"""Skills: extensible capability packages.

A skill is a directory under backend/data/skills/<name>/ containing skill.yaml:
    name: str
    description: str
    inject_prompt: str        # optional, injected into agent system prompt
    tools:                    # optional, each becomes a callable tool
      - name: my_tool
        description: ...
        parameters: {json schema}
        handler: handlers.py::my_tool   # python function (args, challenge) -> dict

Built-in skills are shipped in the same directory and can be edited/added at runtime.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
from pathlib import Path
from typing import Any

import yaml

from ..core.config import SKILLS_DIR


class SkillLoader:
    def __init__(self):
        SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, dict] = {}

    def _skill_dir(self, name: str) -> Path:
        return SKILLS_DIR / name

    def list_skills(self) -> list[dict]:
        out = []
        for d in sorted(SKILLS_DIR.iterdir()):
            cfg = d / "skill.yaml"
            if d.is_dir() and cfg.exists():
                try:
                    meta = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
                    meta["name"] = meta.get("name", d.name)
                    meta["_dir"] = d.name
                    out.append(meta)
                except Exception as e:
                    out.append({"name": d.name, "error": str(e)})
        return out

    def get(self, name: str) -> dict | None:
        if name in self._cache:
            return self._cache[name]
        cfg = self._skill_dir(name) / "skill.yaml"
        if not cfg.exists():
            return None
        meta = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
        meta["name"] = meta.get("name", name)
        self._cache[name] = meta
        return meta

    def save_skill(self, name: str, meta: dict) -> dict:
        d = self._skill_dir(name)
        d.mkdir(parents=True, exist_ok=True)
        (d / "skill.yaml").write_text(
            yaml.safe_dump(meta, allow_unicode=True, sort_keys=False), encoding="utf-8")
        self._cache.pop(name, None)
        return {"saved": name}

    def delete_skill(self, name: str) -> dict:
        import shutil
        d = self._skill_dir(name)
        if d.exists():
            shutil.rmtree(d)
        self._cache.pop(name, None)
        return {"deleted": name}

    # -- enabled/disabled state (stored in skill.yaml `enabled` field) --
    def toggle_enabled(self, name: str) -> dict:
        meta = self.get(name)
        if not meta:
            raise FileNotFoundError(name)
        meta["enabled"] = not meta.get("enabled", True)
        self.save_skill(name, meta)
        return {"name": name, "enabled": meta["enabled"]}

    def is_enabled(self, name: str) -> bool:
        meta = self.get(name)
        return bool(meta and meta.get("enabled", True))

    # -- file tree operations --
    def _safe_path(self, name: str, rel: str) -> Path:
        base = self._skill_dir(name).resolve()
        p = (base / rel).resolve()
        if not str(p).startswith(str(base)):
            raise ValueError("path escapes skill dir")
        return p

    def list_files(self, name: str) -> list[dict]:
        d = self._skill_dir(name)
        if not d.exists():
            raise FileNotFoundError(name)
        files = []
        for p in sorted(d.rglob("*")):
            if p.name.startswith("."):
                continue
            rel = str(p.relative_to(d)).replace("\\", "/")
            files.append({"path": rel, "dir": p.is_dir(),
                          "size": p.stat().st_size if p.is_file() else None})
        return files

    def read_file(self, name: str, rel: str) -> dict:
        p = self._safe_path(name, rel)
        if not p.exists() or p.is_dir():
            raise FileNotFoundError(rel)
        data = p.read_bytes()
        try:
            return {"path": rel, "content": data.decode("utf-8"),
                    "binary": False, "size": len(data)}
        except UnicodeDecodeError:
            import base64 as b64
            return {"path": rel, "content_b64": b64.b64encode(data).decode(),
                    "binary": True, "size": len(data)}

    def write_file(self, name: str, rel: str, content: str) -> dict:
        p = self._safe_path(name, rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        self._cache.pop(name, None)
        return {"path": rel, "size": p.stat().st_size}

    def create_file(self, name: str, rel: str, content: str = "",
                    is_dir: bool = False) -> dict:
        p = self._safe_path(name, rel)
        if p.exists():
            raise ValueError(f"already exists: {rel}")
        if is_dir:
            p.mkdir(parents=True)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
        self._cache.pop(name, None)
        return {"path": rel, "dir": is_dir}

    def delete_file(self, name: str, rel: str) -> dict:
        p = self._safe_path(name, rel)
        if not p.exists():
            raise FileNotFoundError(rel)
        if p.is_dir():
            import shutil
            shutil.rmtree(p)
        else:
            p.unlink()
        self._cache.pop(name, None)
        return {"deleted": rel}

    def write_binary(self, name: str, rel: str, data: bytes) -> dict:
        p = self._safe_path(name, rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        self._cache.pop(name, None)
        return {"path": rel, "size": len(data)}

    def rename(self, old: str, new: str) -> dict:
        import re
        if not re.fullmatch(r"[A-Za-z0-9_-]+", new):
            raise ValueError("invalid skill name")
        d = self._skill_dir(old)
        if not d.exists():
            raise FileNotFoundError(old)
        nd = self._skill_dir(new)
        if nd.exists():
            raise ValueError(f"already exists: {new}")
        d.rename(nd)
        self._cache.pop(old, None)
        return {"renamed": f"{old} -> {new}"}


async def run_skill_handler(handler_path: str, args: dict, challenge: dict) -> Any:
    """handler_path format: handlers.py::func_name, relative to the skill dir."""
    rel, _, fn_name = handler_path.partition("::")
    skill_name = rel.split("/")[0] if "/" in rel else None
    # handler paths are stored as "<skill>/handlers.py::fn" or relative to skill
    # we resolve: search all skill dirs for matching file
    candidates = list(SKILLS_DIR.glob(f"*/{rel}")) if "/" not in rel or skill_name is None \
        else [SKILLS_DIR / rel]
    if not candidates:
        return {"error": f"handler not found: {handler_path}"}
    path = candidates[0].resolve()
    spec = importlib.util.spec_from_file_location(f"skill_{path.stem}_{fn_name}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fn = getattr(mod, fn_name)
    result = fn(args, challenge)
    if asyncio.iscoroutine(result):
        result = await result
    return result
