"""AgentScope 2.x runtime: adapts our agent configs / tool registry to
agentscope's Agent (ReAct) with streaming events and HITL support.

Selected per-agent via `runtime: agentscope` in the agent YAML;
the builtin engine remains the default fallback.
"""
from __future__ import annotations

import json
import time
from typing import Any, AsyncIterator

from ..core.config import settings
from ..tools.registry import ToolRegistry
from ..kb.store import KnowledgeBase
from ..skills.loader import SkillLoader
from ..mcp_client.manager import MCPManager
from .engine import SYSTEM_PROMPTS, _extract_flag


class AgentscopeRunner:
    """Same public interface as AgentRunner: run() yields SSE events."""

    def __init__(self, agent_cfg: dict, kb: KnowledgeBase,
                 skill_loader: SkillLoader, mcp_manager: MCPManager):
        self.cfg = agent_cfg
        self.kb = kb
        self.skills = skill_loader
        self.mcp = mcp_manager
        self.max_iters = int(agent_cfg.get("max_steps", 12))

    async def _build_model(self):
        from agentscope.model import OpenAIChatModel
        from agentscope.credential._openai import OpenAICredential
        llm = self.cfg.get("llm", {})
        api_key = llm.get("api_key") or settings.llm_api_key
        base_url = llm.get("base_url") or settings.llm_base_url
        cred = OpenAICredential(api_key=api_key,
                                 base_url=base_url or None)
        kwargs = {"model": llm.get("model") or settings.llm_model,
                  "stream": True}
        if llm.get("max_tokens"):
            kwargs["parameters"] = {"max_tokens": llm["max_tokens"]}
        return OpenAIChatModel(credential=cred, **kwargs)

    async def _build_toolkit(self, registry: ToolRegistry):
        """Wrap registry tools as agentscope FunctionTools."""
        from agentscope.tool import Toolkit, FunctionTool, ToolResponse
        tk = Toolkit()

        for schema in registry.to_openai_schema():
            fname = schema["function"]["name"]
            desc = schema["function"].get("description", "")
            params = schema["function"].get("parameters", {})

            def make_exec(name):
                async def execute(**kwargs) -> ToolResponse:
                    try:
                        result = await registry.execute(name, kwargs)
                    except Exception as e:
                        result = {"error": str(e)}
                    text = result if isinstance(result, str) else json.dumps(
                        result, ensure_ascii=False, default=str)
                    return ToolResponse(
                        content=[{"type": "text", "text": text[:8000]}])
                return execute

            await tk.add_tool(FunctionTool(
                make_exec(fname), name=fname, description=desc,
                input_schema=params or {"type": "object", "properties": {}}))
        return tk

    async def run(self, workflow: str, challenge: dict,
                  user_hint: str | None = None,
                  tool_overrides: dict | None = None,
                  approval_gate: bool = False,
                  approved_event: dict | None = None,
                  ) -> AsyncIterator[dict]:
        """Yield normalized events compatible with the builtin engine,
        plus agentscope extras: thinking deltas, usage, HITL requests."""
        from agentscope.agent import Agent, ReActConfig
        from agentscope.message import Msg
        from agentscope.permission import PermissionContext
        from agentscope.permission._types import PermissionMode
        from agentscope.state import AgentState
        from agentscope.event import RequireUserConfirmEvent

        t0 = time.time()
        registry = ToolRegistry(challenge)
        enabled = self.cfg.get("tools", {}).get("builtin", [])
        registry.register_builtins(enabled)
        for skill_name in self.cfg.get("skills", []):
            skill = self.skills.get(skill_name)
            if skill:
                registry.register_skill(skill, challenge)
        for server_name in self.cfg.get("mcp_servers", []):
            try:
                tools = await self.mcp.list_tools(server_name)
                for tool in tools:
                    registry.register_mcp_tool(server_name, tool)
            except Exception as e:
                registry.errors.append(f"mcp:{server_name}: {e}")
        kb_names = self.cfg.get("knowledge_bases", [])
        if kb_names or workflow == "analyze":
            registry.register_kb_search(self.kb, kb_names)

        model = await self._build_model()
        toolkit = await self._build_toolkit(registry)

        sys_prompt = SYSTEM_PROMPTS[workflow]
        persona = self.cfg.get("persona")
        if persona:
            sys_prompt += f"\n\nPersona/style guide:\n{persona}"
        for skill_name in self.cfg.get("skills", []):
            skill = self.skills.get(skill_name)
            if skill and skill.get("inject_prompt"):
                sys_prompt += f"\n\n## Skill: {skill_name}\n{skill['inject_prompt']}"
        if challenge:
            sys_prompt += ("\n\n## Challenge\n"
                           + json.dumps(challenge, ensure_ascii=False, indent=2))

        permission_mode = (PermissionMode.BYPASS if not approval_gate
                            else PermissionMode.DEFAULT)
        agent = Agent(
            self.cfg.get("name", "ctf-agent"), sys_prompt,
            model=model, toolkit=toolkit,
            state=AgentState(permission_context=PermissionContext(
                mode=permission_mode)),
            react_config=ReActConfig(max_iters=self.max_iters),
        )

        yield {"type": "start", "workflow": workflow,
               "agent": self.cfg.get("name"), "runtime": "agentscope",
               "tools": [s["function"]["name"]
                         for s in registry.to_openai_schema()]}

        # resume path (HITL answer)
        if approved_event is not None:
            from agentscope.event import UserConfirmResultEvent, ConfirmResult
            res = UserConfirmResultEvent(
                reply_id=approved_event["reply_id"],
                confirm_results=[
                    ConfirmResult(confirmed=c["confirmed"],
                                   tool_call=c["_block"])
                    for c in approved_event["tool_calls"]])
            inputs = res
        else:
            text = user_hint or {
                "analyze": "Analyze this challenge.",
                "solve": ("Solve this challenge. Verify every hypothesis "
                           "with a tool call. End with: FLAG: <flag>"),
                "writeup": "Write a complete writeup for this challenge.",
            }[workflow]
            inputs = Msg(name="user", role="user",
                          content=[{"type": "text", "text": text}])

        final_text = ""
        usage_total = {"input": 0, "output": 0}
        pending_confirm = None
        step = 0
        async for ev in agent.reply_stream(inputs):
            etype = type(ev).__name__
            if etype == "ModelCallEndEvent":
                usage_total["input"] += ev.input_tokens or 0
                usage_total["output"] += ev.output_tokens or 0
                yield {"type": "usage", "input_tokens": ev.input_tokens,
                       "output_tokens": ev.output_tokens}
            elif etype == "ThinkingBlockDeltaEvent":
                yield {"type": "thinking", "delta": ev.delta}
            elif etype == "TextBlockDeltaEvent":
                final_text += ev.delta
                yield {"type": "token", "text": ev.delta}
            elif etype == "ToolCallStartEvent":
                step += 1
                yield {"type": "tool_call", "step": step,
                       "tool": ev.tool_call_name}
            elif etype == "ToolResultEndEvent":
                yield {"type": "tool_result", "step": step, "tool": "",
                       "result": {"state": str(
                           getattr(ev.state, "value", ev.state))}}
            elif etype == "RequireUserConfirmEvent":
                tc_list = [
                    {"name": tc.name, "input": getattr(tc, "input", None),
                     "_block": tc}
                    for tc in ev.tool_calls]
                pending_confirm = {
                    "reply_id": ev.reply_id,
                    "tool_calls": tc_list,
                }
                yield {"type": "hitl_request",
                       "reply_id": ev.reply_id,
                       "tools": [{"name": t["name"], "input": t["input"]}
                                  for t in tc_list]}
                break
            elif etype == "ReplyEndEvent":
                msg = getattr(ev, "msg", None)
                if msg:
                    final_text = msg.get_text_content() or final_text

        flag = _extract_flag(final_text)
        yield {"type": "final", "text": final_text, "flag": flag,
               "elapsed": round(time.time() - t0, 1),
               "usage": usage_total,
               "pending_confirm": pending_confirm}


def get_runner(agent_cfg: dict, kb: KnowledgeBase, skills: SkillLoader,
               mcp: MCPManager):
    """Factory: pick runtime per agent config."""
    runtime = (agent_cfg.get("runtime") or "builtin").lower()
    if runtime == "agentscope":
        try:
            return AgentscopeRunner(agent_cfg, kb, skills, mcp)
        except ImportError:
            pass
    from .engine import AgentRunner
    return AgentRunner(agent_cfg, kb, skills, mcp)
