"""API routers: agents, kb, skills, mcp, sessions, run (SSE)."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agents.engine import (AgentRunner, list_agent_configs, load_agent_config,
                             save_agent_config)
from ..kb.store import KnowledgeBase, KB_DIR
from ..skills.loader import SkillLoader
from ..skills.hub_data import PWN_SKILL_YAML, FOR_SKILL_YAML, _b64
from ..mcp_client.manager import (MCPManager, load_mcp_config,
                                    save_mcp_config, toggle_mcp_server)
from ..db.store import Database
from ..tools.registry import CHALLENGE_FILES_DIR

api = APIRouter(prefix="/api")
kb = KnowledgeBase()
skills = SkillLoader()
db = Database()


# ---------------- agents ----------------
class AgentConfigModel(BaseModel):
    name: str
    display_name: str = ""
    description: str = ""
    max_steps: int = 12
    llm: dict = {}
    persona: str = ""
    tools: dict = {}
    knowledge_bases: list[str] = []
    skills: list[str] = []
    mcp_servers: list[str] = []


@api.get("/agents")
async def list_agents():
    return {"agents": list_agent_configs(), "available_skills": [s["name"] for s in skills.list_skills()],
            "available_kbs": [k["name"] for k in kb.list_kbs()],
            "available_mcp": list(load_mcp_config().get("mcpServers", {}).keys())}


@api.get("/agents/{name}")
async def get_agent(name: str):
    try:
        return load_agent_config(name)
    except FileNotFoundError:
        raise HTTPException(404, "agent not found")


@api.put("/agents/{name}")
async def put_agent(name: str, cfg: AgentConfigModel):
    save_agent_config(name, cfg.model_dump())
    return {"ok": True}


# ---------------- kb ----------------
@api.get("/kb")
async def list_kbs():
    return {"kbs": kb.list_kbs()}


class KBAddModel(BaseModel):
    kb: str
    title: str
    content: str
    source: str = ""


@api.post("/kb/add")
async def kb_add(m: KBAddModel):
    return await kb.add_document(m.kb, m.title, m.content, m.source)


class KBCreateModel(BaseModel):
    name: str


@api.post("/kb/create")
async def kb_create(m: KBCreateModel):
    import re as _re
    if not _re.fullmatch(r"[A-Za-z0-9_-]+", m.name):
        raise HTTPException(400, "invalid kb name")
    return {"created": kb.create_kb(m.name)}


@api.get("/kb/{kb_name}/{doc_name}")
async def kb_read(kb_name: str, doc_name: str):
    try:
        return {"content": kb.read_document(kb_name, doc_name)}
    except FileNotFoundError:
        raise HTTPException(404, "doc not found")


@api.put("/kb/{kb_name}/{doc_name}")
async def kb_write(kb_name: str, doc_name: str, m: dict):
    import re as _re
    if not _re.fullmatch(r"[\w\u4e00-\u9fff.-]+", doc_name):
        raise HTTPException(400, "invalid doc name")
    kb.write_document(kb_name, doc_name, m.get("content", ""))
    return {"ok": True}


@api.delete("/kb/{kb_name}/{doc_name}")
async def kb_delete(kb_name: str, doc_name: str):
    return kb.delete_document(kb_name, doc_name)


@api.delete("/kb/{kb_name}")
async def kb_delete_all(kb_name: str):
    import shutil
    d = KB_DIR / kb_name
    if d.exists() and kb_name not in ("", ".", ".."):
        shutil.rmtree(d)
    return {"deleted": kb_name}


# ---------------- skills ----------------
@api.get("/skills")
async def list_skills():
    return {"skills": skills.list_skills()}


@api.get("/skills/{name}")
async def get_skill(name: str):
    meta = skills.get(name)
    if not meta:
        raise HTTPException(404, "skill not found")
    return meta


@api.put("/skills/{name}")
async def put_skill(name: str, meta: dict):
    return skills.save_skill(name, meta)


@api.delete("/skills/{name}")
async def delete_skill(name: str):
    return skills.delete_skill(name)


@api.post("/skills/{name}/toggle")
async def toggle_skill(name: str):
    return skills.toggle_enabled(name)


@api.get("/skills/{name}/files")
async def skill_files(name: str):
    try:
        return {"files": skills.list_files(name)}
    except FileNotFoundError:
        raise HTTPException(404, "skill not found")


@api.get("/skills/{name}/file")
async def skill_read_file(name: str, path: str):
    try:
        return skills.read_file(name, path)
    except FileNotFoundError:
        raise HTTPException(404, "file not found")


@api.put("/skills/{name}/file")
async def skill_write_file(name: str, m: dict):
    try:
        return skills.write_file(name, m.get("path", ""), m.get("content", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))


@api.post("/skills/{name}/file")
async def skill_create_file(name: str, m: dict):
    try:
        return skills.create_file(name, m.get("path", ""), m.get("content", ""),
                                   m.get("is_dir", False))
    except ValueError as e:
        raise HTTPException(400, str(e))


@api.delete("/skills/{name}/file")
async def skill_delete_file(name: str, path: str):
    try:
        return skills.delete_file(name, path)
    except FileNotFoundError:
        raise HTTPException(404, "file not found")


class SkillUploadModel(BaseModel):
    path: str
    content_b64: str


@api.post("/skills/{name}/upload")
async def skill_upload(name: str, m: SkillUploadModel):
    import base64
    try:
        content = base64.b64decode(m.content_b64)
    except Exception:
        raise HTTPException(400, "invalid base64")
    try:
        return skills.write_binary(name, m.path, content)
    except ValueError as e:
        raise HTTPException(400, str(e))


@api.post("/skills/{name}/rename")
async def skill_rename(name: str, m: dict):
    try:
        return skills.rename(name, m.get("new_name", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))


# ---------------- skill hub ----------------
HUB_INDEX_URL = ("https://raw.githubusercontent.com/"
                  "liudonghua123/ctf-ai-agent/main/hub/index.json")


@api.get("/hub/skills")
async def hub_list():
    """List installable skills from the hub index (builtin fallback is instant)."""
    import httpx, asyncio
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await asyncio.wait_for(client.get(HUB_INDEX_URL), timeout=3.5)
            r.raise_for_status()
            return r.json()
    except Exception:
        # fallback: built-in hub entries
        return {"skills": BUILTIN_HUB_SKILLS, "source": "builtin"}


@api.post("/hub/skills/install")
async def hub_install(m: dict):
    """Install a skill from the hub by name (fetches files from hub repo)."""
    name = m.get("name", "")
    entry = next((s for s in BUILTIN_HUB_SKILLS if s["name"] == name), None)
    if not entry:
        raise HTTPException(404, f"skill not in hub: {name}")
    import base64
    for f in entry.get("files", []):
        rel = f["path"]
        content = base64.b64decode(f["content_b64"])
        skills.write_binary(name, rel, content)
    skills._cache.pop(name, None)
    return {"installed": name, "files": [f["path"] for f in entry.get("files", [])]}


BUILTIN_HUB_SKILLS = [
    {
        "name": "pwn_playbook",
        "description": "Pwn 解题手册：栈溢出、格式化字符串、堆利用入门",
        "version": "1.0.0",
        "files": [
            {"path": "skill.yaml", "content_b64": _b64(PWN_SKILL_YAML)},
        ],
    },
    {
        "name": "forensics_playbook",
        "description": "取证手册：文件恢复、内存取证、流量分析",
        "version": "1.0.0",
        "files": [
            {"path": "skill.yaml", "content_b64": _b64(FOR_SKILL_YAML)},
        ],
    },
]


# ---------------- mcp ----------------
@api.get("/mcp")
async def get_mcp():
    cfg = load_mcp_config()
    disabled = set(cfg.get("disabled", []))
    servers = []
    for name, scfg in cfg.get("mcpServers", {}).items():
        transport = scfg.get("transport") or (
            "http" if "url" in scfg else "stdio")
        servers.append({
            "name": name,
            "type": transport,  # stdio | http | sse
            "url": scfg.get("url"),
            "command": scfg.get("command"),
            "args": scfg.get("args", []),
            "headers": scfg.get("headers", {}),
            "enabled": name not in disabled,
        })
    return {"servers": servers}


class MCPServerModel(BaseModel):
    name: str
    type: str = "stdio"  # stdio | http | sse
    url: str | None = None
    command: str | None = None
    args: list[str] = []
    headers: dict[str, str] = {}


@api.put("/mcp")
async def put_mcp(m: MCPServerModel):
    if m.type in ("http", "sse"):
        if not m.url:
            raise HTTPException(400, "url required for http/sse server")
        entry: dict = {"url": m.url, "transport": m.type}
        if m.headers:
            entry["headers"] = m.headers
    else:
        if not m.command:
            raise HTTPException(400, "command required for stdio server")
        entry = {"command": m.command, "args": m.args}
    cfg = load_mcp_config()
    cfg.setdefault("mcpServers", {})[m.name] = entry
    cfg["disabled"] = [d for d in cfg.get("disabled", []) if d != m.name]
    save_mcp_config(cfg)
    return {"saved": m.name}


@api.delete("/mcp/{name}")
async def delete_mcp(name: str):
    cfg = load_mcp_config()
    if name not in cfg.get("mcpServers", {}):
        raise HTTPException(404, "server not found")
    del cfg["mcpServers"][name]
    cfg["disabled"] = [d for d in cfg.get("disabled", []) if d != name]
    save_mcp_config(cfg)
    return {"deleted": name}


@api.post("/mcp/{name}/toggle")
async def mcp_toggle(name: str):
    try:
        return toggle_mcp_server(name)
    except KeyError as e:
        raise HTTPException(404, str(e))


@api.post("/mcp/{name}/tools")
async def mcp_tools(name: str):
    try:
        return {"tools": await MCPManager.instance().list_tools(name)}
    except Exception as e:
        raise HTTPException(400, f"mcp error: {e}")


# ---------------- sessions ----------------
@api.get("/sessions")
async def list_sessions():
    return {"sessions": await db.list_sessions()}


@api.get("/sessions/{sid}")
async def get_session(sid: str):
    s = await db.get_session(sid)
    if not s:
        raise HTTPException(404, "not found")
    return s


@api.put("/sessions/{sid}/title")
async def rename_session(sid: str, m: dict):
    await db.rename_session(sid, m.get("title", "untitled"))
    return {"ok": True}


@api.delete("/sessions/{sid}")
async def del_session(sid: str):
    await db.delete_session(sid)
    return {"deleted": sid}


@api.post("/sessions/clear/{agent}")
async def clear_sessions(agent: str):
    await db.clear_agent_sessions(agent)
    return {"cleared": agent}


# ---------------- run ----------------
class RunModel(BaseModel):
    agent: str = "general"
    workflow: str = "analyze"  # analyze | solve | writeup
    challenge: dict = {}
    hint: str | None = None


@api.post("/run")
async def run_agent(m: RunModel):
    try:
        cfg = load_agent_config(m.agent)
    except FileNotFoundError:
        raise HTTPException(404, f"agent not found: {m.agent}")
    if m.workflow not in ("analyze", "solve", "writeup"):
        raise HTTPException(400, "invalid workflow")
    runner = AgentRunner(cfg, kb, skills, MCPManager.instance())
    sid = await db.create_session(m.agent, m.workflow, m.challenge)
    # auto-name from first message content (title or description)
    auto = (m.challenge.get("title")
            or (m.challenge.get("description") or "").strip()[:40]
            or "untitled")
    await db.rename_session(sid, auto)

    async def gen():
        yield f"event: session\ndata: {json.dumps({'sid': sid})}\n\n"
        collected: list[dict] = []
        final_text, flag = "", None
        try:
            async for ev in runner.run(m.workflow, m.challenge, m.hint):
                if ev["type"] == "final":
                    final_text, flag = ev.get("text", ""), ev.get("flag")
                collected.append(ev)
                yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
        except Exception as e:
            err = {"type": "error", "message": str(e)}
            collected.append(err)
            yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
        await db.append_messages(sid, collected)
        if final_text:
            await db.update_final(sid, final_text, flag)
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


# ---------------- challenge files ----------------
@api.post("/challenge-files")
async def list_challenge_files():
    """List uploaded challenge files visible to agent tools."""
    items = []
    for p in sorted(CHALLENGE_FILES_DIR.rglob("*")):
        if p.is_file() and ".gitkeep" not in p.name:
            items.append({"path": str(p.relative_to(CHALLENGE_FILES_DIR)),
                          "size": p.stat().st_size})
    return {"files": items}
