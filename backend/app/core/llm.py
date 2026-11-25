"""Thin wrapper around an OpenAI-compatible chat endpoint.

Supports streaming and tool-calls, with per-agent overrides.
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from .config import settings


class LLMClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ):
        self.api_key = (api_key or "").strip() or settings.llm_api_key
        self.base_url = (base_url or "").strip() or settings.llm_base_url
        self.model = (model or "").strip() or settings.llm_model
        if not self.api_key:
            raise ValueError(
                "LLM api_key is empty: set CTFAI_llm_api_key in .env or pass per-agent config")
        self.temperature = settings.llm_temperature if temperature is None else temperature
        self.max_tokens = max_tokens or settings.llm_max_tokens
        self._client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

    async def chat(self, messages: list[dict], tools: list[dict] | None = None) -> dict:
        """Non-streaming chat; returns the assistant message dict (may contain tool_calls)."""
        kwargs: dict[str, Any] = dict(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        if tools:
            kwargs["tools"] = tools
        resp = await self._client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        out: dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            out["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in msg.tool_calls
            ]
        out["_usage"] = {
            "prompt_tokens": resp.usage.prompt_tokens,
            "completion_tokens": resp.usage.completion_tokens,
        }
        return out

    async def chat_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        """Streaming chat, yields text deltas only (no tools)."""
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embeddings; falls back to a local hash-based embedding if the endpoint fails."""
        try:
            resp = await self._client.embeddings.create(
                model="text-embedding-3-small", input=texts
            )
            return [d.embedding for d in resp.data]
        except Exception:
            return [local_embed(t) for t in texts]


# ---------------------------------------------------------------------------
# Local fallback embedding: bag-of-character-ngrams hashed into a fixed vector.
# Deterministic, dependency-free, good enough for small KB retrieval.
# ---------------------------------------------------------------------------
EMBED_DIM = 512


def _ngrams(text: str, n: int = 3) -> list[str]:
    text = text.lower()
    return [text[i : i + n] for i in range(max(0, len(text) - n + 1))]


def local_embed(text: str) -> list[float]:
    import hashlib

    vec = [0.0] * EMBED_DIM
    for g in _ngrams(text):
        h = int(hashlib.md5(g.encode()).hexdigest(), 16)
        vec[h % EMBED_DIM] += 1.0
    norm = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / norm for v in vec]
