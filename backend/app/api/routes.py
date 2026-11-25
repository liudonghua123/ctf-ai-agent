"""API routers: agents, kb, skills, mcp, sessions, run (SSE)."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agents.engine import (AgentRunner, list_agent_configs, load_agent_config,
                             save_agent_config)
from ..kb.store import KnowledgeBase
from ..skills.loader import SkillLoader
from ..mcp_client.manager import MCPManager, load_mcp_config, save_mcp_config
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


@api.get("/kb/{kb_name}/{doc_name}")
async def kb_read(kb_name: str, doc_name: str):
    try:
        return {"content": kb.read_document(kb_name, doc_name)}
    except FileNotFoundError:
        raise HTTPException(404, "doc not found")


@api.delete("/kb/{kb_name}/{doc_name}")
async def kb_delete(kb_name: str, doc_name: str):
    return kb.delete_document(kb_name, doc_name)


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


# ---------------- mcp ----------------
@api.get("/mcp")
async def get_mcp():
    return load_mcp_config()


@api.put("/mcp")
async def put_mcp(cfg: dict):
    return save_mcp_config(cfg)


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
