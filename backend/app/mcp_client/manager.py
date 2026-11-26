"""MCP client manager: connects to configured MCP servers (stdio / streamable-http)
and exposes their tools to agents. Config stored in data/mcp.json.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..core.config import DATA_DIR, settings

MCP_CONFIG_PATH = DATA_DIR / "mcp.json"

DEFAULT_CONFIG = {"mcpServers": {}}


def load_mcp_config() -> dict:
    if MCP_CONFIG_PATH.exists():
        return json.loads(MCP_CONFIG_PATH.read_text(encoding="utf-8"))
    return dict(DEFAULT_CONFIG)


def get_disabled_servers() -> set[str]:
    return set(load_mcp_config().get("disabled", []))


def toggle_mcp_server(name: str) -> dict:
    cfg = load_mcp_config()
    disabled = set(cfg.get("disabled", []))
    if name in disabled:
        disabled.discard(name)
        enabled = True
    else:
        if name not in cfg.get("mcpServers", {}):
            raise KeyError(f"mcp server not configured: {name}")
        disabled.add(name)
        enabled = False
    cfg["disabled"] = sorted(disabled)
    save_mcp_config(cfg)
    return {"name": name, "enabled": enabled}


def save_mcp_config(cfg: dict) -> dict:
    MCP_CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2),
                               encoding="utf-8")
    MCPManager.instance().reload()
    return cfg


class MCPManager:
    _inst: "MCPManager | None" = None

    @classmethod
    def instance(cls) -> "MCPManager":
        if cls._inst is None:
            cls._inst = cls()
        return cls._inst

    def __init__(self):
        self._clients: dict[str, Any] = {}
        self.reload()

    def reload(self):
        # close existing clients lazily; reconnect on demand
        self._clients.clear()

    def _get_client(self, name: str):
        if name in self._clients:
            return self._clients[name]
        if name in get_disabled_servers():
            raise KeyError(f"mcp server disabled: {name}")
        cfg = load_mcp_config().get("mcpServers", {}).get(name)
        if not cfg:
            raise KeyError(f"mcp server not configured: {name}")
        from fastmcp import Client
        from fastmcp.client.transports import (
            StreamableHttpTransport, SSETransport, StdioTransport,
        )
        headers = cfg.get("headers") or None
        if cfg.get("transport") == "sse" or (
                "url" in cfg and cfg.get("transport") != "http"):
            # explicit sse; legacy url-only configs also default to sse-safe http
            transport = SSETransport(cfg["url"], headers=headers)
        elif "url" in cfg:
            transport = StreamableHttpTransport(cfg["url"], headers=headers)
        else:
            transport = StdioTransport(
                cfg["command"], cfg.get("args", []),
                env={**settings.mcp_default_env, **(cfg.get("env") or {})}
                if (cfg.get("env") or settings.mcp_default_env) else None)
        client = Client(transport)
        self._clients[name] = client
        return client

    async def list_tools(self, name: str) -> list[dict]:
        client = self._get_client(name)
        async with client:
            tools = await client.list_tools()
        return [{"name": t.name, "description": t.description or "",
                 "inputSchema": t.inputSchema} for t in tools]

    async def call_tool(self, server: str, tool: str, args: dict) -> Any:
        client = self._get_client(server)
        async with client:
            result = await client.call_tool(tool, args)
        # fastmcp returns CallToolResult with .content list; older list style also handled
        items = getattr(result, "content", result)
        if isinstance(items, dict):
            return items
        out = []
        try:
            for item in items:
                if hasattr(item, "text"):
                    out.append(item.text)
                else:
                    out.append(str(item))
        except TypeError:
            return {"content": str(items)}
        return {"content": "\n".join(out)}
