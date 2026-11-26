"""Knowledge base: documents stored as markdown files with JSON sidecar index.
Simple but effective: chunk + local/embedding vectors + cosine search.
Layout: data/kb/<kb_name>/*.md  (+ .index.json cache)
"""
from __future__ import annotations

import json
import hashlib
import math
import re
import time
from pathlib import Path

from ..core.config import KB_DIR
from ..core.llm import local_embed, EMBED_DIM


def _chunk_text(text: str, size: int = 700, overlap: int = 100) -> list[str]:
    # split by headings first, then by size
    parts = re.split(r"\n(?=#{1,4} )", text)
    chunks: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        while len(part) > size:
            chunks.append(part[:size])
            part = part[size - overlap:]
        if part:
            chunks.append(part)
    return chunks


class KnowledgeBase:
    def __init__(self):
        KB_DIR.mkdir(parents=True, exist_ok=True)

    def _kb_dir(self, kb_name: str) -> Path:
        p = KB_DIR / kb_name
        p.mkdir(parents=True, exist_ok=True)
        return p

    def list_kbs(self) -> list[dict]:
        out = []
        for d in sorted(KB_DIR.iterdir()):
            if d.is_dir() and not d.name.startswith("."):
                docs = [str(x.relative_to(d)) for x in sorted(d.rglob("*.md"))]
                out.append({"name": d.name, "docs": docs})
        return out

    async def add_document(self, kb_name: str, title: str, content: str,
                           source: str = "") -> dict:
        d = self._kb_dir(kb_name)
        fname = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", title)[:80] + ".md"
        path = d / fname
        path.write_text(content, encoding="utf-8")
        self._build_index(kb_name)
        return {"kb": kb_name, "doc": fname, "path": str(path)}

    def delete_document(self, kb_name: str, doc: str) -> dict:
        path = self._kb_dir(kb_name) / doc
        if path.exists():
            path.unlink()
        self._build_index(kb_name)
        return {"deleted": doc}

    def create_kb(self, kb_name: str) -> str:
        self._kb_dir(kb_name)
        return kb_name

    def read_document(self, kb_name: str, doc: str) -> str:
        path = self._kb_dir(kb_name) / doc
        if not path.exists():
            raise FileNotFoundError(doc)
        return path.read_text(encoding="utf-8")

    def write_document(self, kb_name: str, doc: str, content: str) -> None:
        path = self._kb_dir(kb_name) / doc
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        self._build_index(kb_name)

    # -- indexing -----------------------------------------------------------
    def _build_index(self, kb_name: str) -> None:
        d = self._kb_dir(kb_name)
        entries = []
        for md in sorted(d.glob("*.md")):
            text = md.read_text(encoding="utf-8")
            for i, chunk in enumerate(_chunk_text(text)):
                entries.append({
                    "doc": md.name, "chunk_id": i, "text": chunk,
                    "vec": local_embed(chunk),
                })
        (d / ".index.json").write_text(
            json.dumps(entries, ensure_ascii=False), encoding="utf-8")

    def _load_index(self, kb_name: str) -> list[dict]:
        d = self._kb_dir(kb_name)
        idx = d / ".index.json"
        # rebuild if stale
        mds = sorted(d.glob("*.md"))
        if idx.exists():
            mtime_idx = idx.stat().st_mtime
            if all(m.stat().st_mtime <= mtime_idx for m in mds):
                return json.loads(idx.read_text(encoding="utf-8"))
        self._build_index(kb_name)
        return json.loads(idx.read_text(encoding="utf-8"))

    async def search(self, query: str, kb_names: list[str] | None = None,
                     top_k: int | None = None) -> dict:
        from ..core.config import settings
        top_k = top_k or settings.kb_top_k
        kbs = kb_names or [d.name for d in KB_DIR.iterdir() if d.is_dir()]
        qv = local_embed(query)
        scored = []
        for kb in kbs:
            try:
                entries = self._load_index(kb)
            except Exception:
                continue
            for e in entries:
                score = sum(a * b for a, b in zip(qv, e["vec"]))
                scored.append((score, kb, e))
        scored.sort(key=lambda x: -x[0])
        hits = [{"kb": kb, "doc": e["doc"], "score": round(score, 4), "text": e["text"]}
                for score, kb, e in scored[:top_k]]
        return {"query": query, "hits": hits}
