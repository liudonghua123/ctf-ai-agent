"""Agent engine: loads agent configs (YAML), runs ReAct-style tool-calling loops
for three workflows: analyze / solve / writeup.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, AsyncIterator

import yaml

from ..core.config import CONFIGS_DIR, settings
from ..core.llm import LLMClient
from ..tools.registry import ToolRegistry
from ..kb.store import KnowledgeBase
from ..skills.loader import SkillLoader
from ..mcp_client.manager import MCPManager

WORKFLOWS = ["analyze", "solve", "writeup"]

SYSTEM_PROMPTS: dict[str, str] = {
    "analyze": """You are an elite CTF challenge analyst. Given challenge information
(title, category, description, attachments hints, provided files), produce a structured analysis:
1. Category & difficulty assessment
2. Key observations (anything unusual in the description, encodings, file types)
3. Likely techniques / attack surface (list candidate approaches ranked by probability)
4. Required tools or knowledge
5. Next-step plan
Be concrete. Reference known CTF patterns from the knowledge base when relevant. Answer in the language of the user's request (default: Chinese for 中文题目, else English).""",
    "solve": """You are an elite CTF solver agent working in a sandboxed environment.
You have tools available (python execution, file inspection, decode helpers, knowledge base search).
Work step by step: hypothesize -> act with tools -> observe -> iterate.
When you believe you have found the flag, verify it matches the expected flag format, then
finish with a final line: FLAG: <the flag>""",
    "writeup": """You are a CTF writeup author. Given the challenge info, the analysis
and the solution process, write a complete, publishable writeup:
- Title, category, difficulty, tags
- Summary (TL;DR)
- Step-by-step solution with reasoning, commands and code snippets
- Key takeaways / lessons learned
- Full exploit/solve script in a code block
Use Markdown. Answer in the same language as the challenge (default Chinese if the description is Chinese).""",
}


def load_agent_config(name: str) -> dict:
    path = CONFIGS_DIR / "agents" / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"agent config not found: {name}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def list_agent_configs() -> list[dict]:
    out = []
    for p in sorted(CONFIGS_DIR.glob("agents/*.yaml")):
        try:
            with open(p, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            out.append({"name": p.stem, **cfg})
        except Exception as e:
            out.append({"name": p.stem, "error": str(e)})
    return out


def save_agent_config(name: str, cfg: dict) -> None:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise ValueError("invalid agent name")
    path = CONFIGS_DIR / "agents" / f"{name}.yaml"
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)


class AgentRunner:
    """Runs one workflow for one agent config. Emits events for SSE streaming."""

    def __init__(self, agent_cfg: dict, kb: KnowledgeBase, skill_loader: SkillLoader,
                 mcp_manager: MCPManager):
        self.cfg = agent_cfg
        self.kb = kb
        self.skills = skill_loader
        self.mcp = mcp_manager
        llm = agent_cfg.get("llm", {})
        self.llm = LLMClient(
            api_key=llm.get("api_key"),
            base_url=llm.get("base_url"),
            model=llm.get("model"),
            temperature=llm.get("temperature"),
            max_tokens=llm.get("max_tokens"),
        )
        self.max_steps = int(agent_cfg.get("max_steps", 12))

    # -- tool assembly ------------------------------------------------------
    async def build_tools(self, workflow: str, challenge: dict) -> tuple[list[dict], "ToolRegistry"]:
        """Returns (openai tool schemas, executor map)."""
        registry = ToolRegistry(challenge)

        # 1. builtin tools enabled for this agent
        enabled = self.cfg.get("tools", {}).get("builtin", [])
        registry.register_builtins(enabled)

        # 2. skills: agent-declared skills are loaded as tool-providers
        for skill_name in self.cfg.get("skills", []):
            skill = self.skills.get(skill_name)
            if skill:
                registry.register_skill(skill, challenge)

        # 3. MCP servers declared by agent
        for server_name in self.cfg.get("mcp_servers", []):
            try:
                tools = await self.mcp.list_tools(server_name)
                for t in tools:
                    registry.register_mcp_tool(server_name, t)
            except Exception as e:
                registry.errors.append(f"mcp:{server_name}: {e}")

        # always add kb_search if agent has knowledge bases
        kb_names = self.cfg.get("knowledge_bases", [])
        if kb_names or workflow == "analyze":
            registry.register_kb_search(self.kb, kb_names)

        return registry.to_openai_schema(), registry

    # -- prompts ------------------------------------------------------------
    def build_system_prompt(self, workflow: str, challenge: dict) -> str:
        parts = [SYSTEM_PROMPTS[workflow]]
        persona = self.cfg.get("persona")
        if persona:
            parts.append(f"Persona/style guide:\n{persona}")

        # inject skill instructions (prompt-level knowledge)
        for skill_name in self.cfg.get("skills", []):
            skill = self.skills.get(skill_name)
            if skill and skill.get("inject_prompt"):
                parts.append(f"## Skill: {skill_name}\n{skill['inject_prompt']}")

        if challenge:
            parts.append(
                "## Challenge\n"
                + json.dumps(challenge, ensure_ascii=False, indent=2)
            )
        return "\n\n".join(parts)

    def seed_messages(self, workflow: str, challenge: dict, user_hint: str | None) -> list[dict]:
        sys = self.build_system_prompt(workflow, challenge)
        msgs = [{"role": "system", "content": sys}]
        if workflow == "solve":
            msgs.append({"role": "user", "content": user_hint or
                "Solve this challenge. Start by inspecting what you have.\n"
                "IMPORTANT working rules:\n"
                "- Every hypothesis MUST be verified with a tool call immediately - never conclude by reasoning alone.\n"
                "- For web challenges: enumerate and ACTUALLY REQUEST all bypass variants (query params, encodings, truncations) against the target.\n"
                "- When you find the flag, verify its format, then end your answer with: FLAG: <flag>"})
        else:
            msgs.append({"role": "user", "content": user_hint or
                ("分析这道题" if _is_chinese(challenge.get("description", "")) else "Analyze this challenge.")})
        return msgs

    # -- main loop ----------------------------------------------------------
    async def run(self, workflow: str, challenge: dict, user_hint: str | None = None,
                  approval_gate: bool = False,
                  approved_event: dict | None = None) -> AsyncIterator[dict]:
        """Async generator yielding events:
        {type: step|tool_call|tool_result|token|final, ...}
        """
        t0 = time.time()
        tools_schema, registry = await self.build_tools(workflow, challenge)
        messages = self.seed_messages(workflow, challenge, user_hint)

        yield {"type": "start", "workflow": workflow, "agent": self.cfg.get("name"),
               "tools": [t["function"]["name"] for t in tools_schema]}

        final_text = ""
        flag = None
        for step in range(1, self.max_steps + 1):
            yield {"type": "step", "step": step}
            msg = await self.llm.chat(messages, tools=tools_schema or None)
            usage = msg.pop("_usage", None)
            content = msg.get("content") or ""
            tool_calls = msg.get("tool_calls") or []

            if content:
                yield {"type": "token", "step": step, "text": content}
                final_text = content
                flag = _extract_flag(final_text) or flag

            if not tool_calls:
                # solve-mode nudge: if the model stopped without a flag and
                # steps remain, push it to continue acting instead of giving up.
                if workflow == "solve" and step < self.max_steps:
                    if not flag:
                        messages.append({"role": "assistant", "content": content})
                        messages.append({
                            "role": "user",
                            "content": ("Do not stop yet. Continue solving: pick your "
                                        "next concrete hypothesis and verify it with a "
                                        "tool call NOW. Hypotheses without execution "
                                        "do not count as progress.")})
                        yield {"type": "nudge", "step": step}
                        continue
                break

            messages.append({"role": "assistant", "content": content,
                             "tool_calls": tool_calls})
            for tc in tool_calls:
                name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                yield {"type": "tool_call", "step": step, "tool": name, "args": args}
                try:
                    result = await registry.execute(name, args)
                except Exception as e:
                    result = {"error": str(e)}
                yield {"type": "tool_result", "step": step, "tool": name,
                       "result": _truncate(result)}
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(_truncate(result), ensure_ascii=False)[:8000],
                })

        yield {"type": "final", "text": final_text, "flag": flag,
               "elapsed": round(time.time() - t0, 1)}


def _extract_flag(text: str) -> str | None:
    """Extract flag from agent text: explicit FLAG: marker first,
    then any flag-shaped string (excluding placeholders like flag{...})."""
    m = re.search(
        r"FLAG\s*[:：=]\s*\**\s*([A-Za-z0-9_\-{}!\[\]$@#%^&*+.]{3,100})",
        text)
    if m:
        return m.group(1).strip("*_ ")
    candidates = re.findall(
        r"\b(?:flag|ctf|NSSCTF|DASCTF|ISCC)\{[^{}]{2,100}\}", text, re.I)
    candidates = [c for c in candidates
                  if not re.fullmatch(r"[^{}]*\{\{?\.\.\.?\}?\}?", c)]
    return candidates[-1] if candidates else None


def _truncate(obj: Any, limit: int = 6000) -> Any:
    s = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, default=str)
    if len(s) > limit:
        return s[:limit] + f"...[truncated {len(s) - limit} chars]"
    return obj


def _is_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))
