"""Tool registry: builtin tools + skill-provided tools + KB search + MCP tools."""
from __future__ import annotations

import asyncio
import base64
import codecs
import hashlib
import json
import re
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Coroutine

import httpx

CHALLENGE_FILES_DIR = Path(__file__).resolve().parents[2] / "data" / "challenge_files"


class ToolRegistry:
    def __init__(self, challenge: dict | None = None):
        self._tools: dict[str, dict] = {}
        self._executors: dict[str, Callable[..., Coroutine]] = {}
        self.errors: list[str] = []
        self.challenge: dict = challenge or {}

    # -- registration -------------------------------------------------------
    def register(self, name: str, description: str, parameters: dict,
                 executor: Callable[..., Coroutine]):
        if name in self._tools:
            self.errors.append(f"duplicate tool skipped: {name}")
            return
        self._tools[name] = {
            "type": "function",
            "function": {"name": name, "description": description,
                         "parameters": parameters or {"type": "object", "properties": {}}},
        }
        self._executors[name] = executor

    def register_builtins(self, names: list[str]):
        for n in names:
            fn = BUILTIN_TOOLS.get(n)
            if not fn:
                self.errors.append(f"unknown builtin tool: {n}")
                continue
            self.register(n, fn["description"], fn["parameters"], fn["executor"])

    def register_kb_search(self, kb, kb_names: list[str]):
        async def kb_search(query: str) -> dict:
            return await kb.search(query, kb_names=kb_names or None)
        self.register(
            "kb_search",
            "Search the internal knowledge base of CTF techniques and writeups.",
            {"type": "object", "properties": {
                "query": {"type": "string", "description": "search keywords"}},
                "required": ["query"]},
            kb_search,
        )

    def register_skill(self, skill: dict, challenge: dict):
        for tool in skill.get("tools", []):
            name = f"skill_{skill['name']}_{tool['name']}"
            self.register(
                name, tool.get("description", ""),
                tool.get("parameters", {"type": "object", "properties": {}}),
                _make_skill_executor(tool["handler"], challenge),
            )

    def register_mcp_tool(self, server: str, tool: dict):
        async def executor(args: dict):
            from ..mcp_client.manager import MCPManager
            return await MCPManager.instance().call_tool(
                server, tool["name"], args)
        self.register(f"mcp_{server}_{tool['name']}".replace(".", "_"),
                      tool.get("description", ""),
                      tool.get("input_schema") or tool.get("inputSchema")
                      or {"type": "object", "properties": {}},
                      executor)

    async def execute(self, name: str, args: dict) -> Any:
        fn = self._executors.get(name)
        if not fn:
            return {"error": f"unknown tool: {name}"}
        # Skill executors take (args, challenge); builtin take **args
        if name.startswith("skill_"):
            return await fn(args, self.challenge)
        return await fn(**args)

    def to_openai_schema(self) -> list[dict]:
        return list(self._tools.values())


def _make_skill_executor(handler_path: str, challenge: dict):
    async def executor(args: dict, chal: dict):
        from ..skills.loader import run_skill_handler
        return await run_skill_handler(handler_path, args, chal)
    return executor


# ---------------------------------------------------------------------------
# Builtin tools
# ---------------------------------------------------------------------------

async def python_exec(code: str) -> dict:
    """Execute Python code in a subprocess sandbox, capture stdout/stderr."""
    import subprocess, sys, tempfile, os
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(code)
        path = f.name
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, path,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            cwd=str(CHALLENGE_FILES_DIR),
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=30)
        except asyncio.TimeoutError:
            proc.kill()
            return {"error": "timeout (30s)"}
        return {"returncode": proc.returncode,
                "stdout": out.decode("utf-8", "replace")[:8000],
                "stderr": err.decode("utf-8", "replace")[:4000]}
    except Exception as e:
        return {"error": f"python_exec failed: {e}"}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def file_read(path: str) -> dict:
    p = (CHALLENGE_FILES_DIR / path).resolve()
    if not str(p).startswith(str(CHALLENGE_FILES_DIR.resolve())):
        return {"error": "path escapes sandbox"}
    if not p.exists():
        return {"error": f"not found: {path}"}
    if p.stat().st_size > 200_000:
        head = p.open("rb").read(200_000)
        try:
            return {"content": head.decode("utf-8"), "truncated": True}
        except UnicodeDecodeError:
            return {"hex_preview": head[:512].hex(), "size": p.stat().st_size}
    data = p.read_bytes()
    try:
        return {"content": data.decode("utf-8"), "size": len(data)}
    except UnicodeDecodeError:
        return {"hex_preview": data[:512].hex(), "size": len(data),
                "hint": "binary file; use python_exec for deeper inspection"}


async def file_list(path: str = ".") -> dict:
    base = (CHALLENGE_FILES_DIR / path).resolve()
    if not str(base).startswith(str(CHALLENGE_FILES_DIR.resolve())):
        return {"error": "path escapes sandbox"}
    if not base.exists():
        return {"error": f"not found: {path}"}
    items = []
    for p in sorted(base.rglob("*"))[:200]:
        rel = p.relative_to(CHALLENGE_FILES_DIR)
        items.append({"path": str(rel), "dir": p.is_dir(),
                      "size": p.stat().st_size if p.is_file() else None})
    return {"files": items}


async def http_request(url: str, method: str = "GET", headers: dict | None = None,
                       body: str | None = None, timeout: float = 15.0) -> dict:
    """Send an HTTP request (for Web challenges running locally or remotely)."""
    try:
        async with httpx.AsyncClient(verify=False, timeout=timeout,
                                     follow_redirects=True) as client:
            resp = await client.request(method, url, headers=headers, content=body)
        ct = resp.headers.get("content-type", "")
        content = resp.text[:12000]
        return {"status": resp.status_code, "headers": dict(resp.headers),
                "content_type": ct, "content": content}
    except Exception as e:
        return {"error": str(e)}


async def decode_helper(data: str) -> dict:
    """Try common decodings: base64, hex, url, rot13, binary."""
    results = {}
    s = data.strip()
    try:
        raw = base64.b64decode(s, validate=True)
        try:
            results["base64"] = raw.decode("utf-8")
        except UnicodeDecodeError:
            results["base64_hex"] = raw.hex()[:200]
    except Exception:
        pass
    if re.fullmatch(r"[0-9a-fA-F\s]+", s) and len(s) >= 8:
        try:
            results["hex"] = bytes.fromhex(s.replace(" ", "")).decode("utf-8", "replace")
        except Exception:
            pass
    if "%" in s:
        results["url"] = urllib.parse.unquote(s)
    results["rot13"] = codecs.decode(s, "rot_13")
    if re.fullmatch(r"[01\s]+", s) and len(s) >= 8:
        bits = s.replace(" ", "")
        try:
            results["binary"] = "".join(
                chr(int(bits[i:i+8], 2)) for i in range(0, len(bits) - 7, 8))
        except Exception:
            pass
    results["md5_of_input"] = hashlib.md5(data.encode()).hexdigest()
    return results


BUILTIN_TOOLS = {
    "python_exec": {
        "description": "Execute Python code (sandboxed subprocess, 30s timeout, cwd=challenge files). print() to see output.",
        "parameters": {"type": "object",
                       "properties": {"code": {"type": "string"}},
                       "required": ["code"]},
        "executor": python_exec,
    },
    "file_read": {
        "description": "Read a challenge file by relative path. Returns text content or hex preview for binary.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}},
                       "required": ["path"]},
        "executor": file_read,
    },
    "file_list": {
        "description": "List challenge files recursively.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string", "default": "."}}},
        "executor": file_list,
    },
    "http_request": {
        "description": "Send HTTP request to a target (Web challenges).",
        "parameters": {"type": "object",
                       "properties": {
                           "url": {"type": "string"},
                           "method": {"type": "string", "default": "GET"},
                           "headers": {"type": "object"},
                           "body": {"type": "string"},
                           "timeout": {"type": "number", "default": 15},
                       },
                       "required": ["url"]},
        "executor": http_request,
    },
    "decode_helper": {
        "description": "Try common decodings (base64/hex/url/rot13/binary) on a string.",
        "parameters": {"type": "object",
                       "properties": {"data": {"type": "string"}},
                       "required": ["data"]},
        "executor": decode_helper,
    },
}
