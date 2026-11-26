"""SQLite persistence for sessions (chat history) via aiosqlite."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

import aiosqlite

from ..core.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent TEXT,
    workflow TEXT,
    title TEXT,
    challenge TEXT,
    messages TEXT,
    created_at REAL,
    updated_at REAL
);
"""


class Database:
    def __init__(self, path=DB_PATH):
        self.path = str(path)

    async def init(self):
        async with aiosqlite.connect(self.path) as db:
            await db.execute(SCHEMA)
            await db.commit()

    async def create_session(self, agent: str, workflow: str, challenge: dict) -> str:
        sid = uuid.uuid4().hex[:12]
        now = time.time()
        title = (challenge.get("title") or "untitled")[:60]
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)",
                (sid, agent, workflow, title, json.dumps(challenge, ensure_ascii=False),
                 "[]", now, now))
            await db.commit()
        return sid

    async def append_messages(self, sid: str, msgs: list[dict]):
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute("SELECT messages FROM sessions WHERE id=?", (sid,))
            row = await cur.fetchone()
            if not row:
                return
            existing = json.loads(row[0])
            existing.extend(msgs)
            await db.execute("UPDATE sessions SET messages=?, updated_at=? WHERE id=?",
                             (json.dumps(existing, ensure_ascii=False), time.time(), sid))
            await db.commit()

    async def update_final(self, sid: str, final_text: str, flag: str | None):
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute("SELECT messages FROM sessions WHERE id=?", (sid,))
            row = await cur.fetchone()
            if not row:
                return
            msgs = json.loads(row[0])
            msgs.append({"role": "final", "content": final_text, "flag": flag})
            await db.execute("UPDATE sessions SET messages=?, updated_at=? WHERE id=?",
                             (json.dumps(msgs, ensure_ascii=False), time.time(), sid))
            await db.commit()

    async def list_sessions(self) -> list[dict]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute(
                "SELECT id, agent, workflow, title, created_at, updated_at "
                "FROM sessions ORDER BY updated_at DESC")
            return [dict(r) for r in await cur.fetchall()]

    async def rename_session(self, sid: str, title: str):
        async with aiosqlite.connect(self.path) as db:
            await db.execute("UPDATE sessions SET title=? WHERE id=?",
                             (title[:80], sid))
            await db.commit()

    async def delete_session(self, sid: str):
        async with aiosqlite.connect(self.path) as db:
            await db.execute("DELETE FROM sessions WHERE id=?", (sid,))
            await db.commit()

    async def clear_agent_sessions(self, agent: str):
        async with aiosqlite.connect(self.path) as db:
            await db.execute("DELETE FROM sessions WHERE agent=?", (agent,))
            await db.commit()

    async def get_session(self, sid: str) -> dict | None:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute("SELECT * FROM sessions WHERE id=?", (sid,))
            r = await cur.fetchone()
            if not r:
                return None
            d = dict(r)
            d["challenge"] = json.loads(d["challenge"])
            d["messages"] = json.loads(d["messages"])
            return d
