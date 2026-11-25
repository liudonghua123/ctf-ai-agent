# CTF AI Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-green.svg)](https://python.org)
[![React](https://img.shells.io/badge/React-18-blue.svg)](https://react.dev)

A full-stack, frontend-backend separated **CTF AI Agent** that analyzes, solves, and writes up CTF challenges autonomously. Flexible and extensible by design: configurable built-in agents, knowledge base, skills, and MCP support out of the box.

> [中文文档（README.zh_CN.md）](README.zh_CN.md)

## Features

### Three Workflows
- **Analyze** — category identification, attack-surface assessment, solving plan
- **Solve** — ReAct-style autonomous solving with a tool loop, stuck-detection nudge, and flag extraction
- **Writeup** — publishable Markdown challenge reports

### Configurable Agents
Agents are plain YAML files (`backend/configs/agents/*.yaml`), editable live from the UI:
- Custom persona, max steps, temperature
- Per-agent LLM override (api key / base url / model)
- Toggle builtin tools, knowledge bases, skills, and MCP servers per agent

Three agents ship by default: `general`, `crypto`, `web`.

### Extension Points
| System | What it does | Config location |
|---|---|---|
| **Knowledge Base** | Document chunking + vector retrieval (OpenAI-compatible embeddings with a local hash-embedding fallback), queried by agents via the `kb_search` tool | `backend/data/kb/` |
| **Skills** | Prompt injection (`inject_prompt`) + custom Python tools (handlers), one directory per skill | `backend/data/skills/` |
| **MCP** | stdio & streamable-HTTP MCP servers, tools exposed to agents | `backend/data/mcp.json` |

### Builtin Tools
`python_exec` (sandboxed subprocess with 30s timeout), `file_read`, `file_list`, `http_request`, `decode_helper`

### UX & Engineering
- SSE streaming: every reasoning step, tool call, and result rendered live
- Session persistence (SQLite)
- Stuck-detection: if the model stops without a flag, the engine nudges it back to work
- Single-process deployment: backend serves the built frontend

## Architecture

```
backend/  FastAPI (uv-managed)        frontend/  Vite + React
├── app/agents/engine.py    ReAct engine        ├── src/pages/Run.jsx       Run console
├── app/tools/registry.py   Tool registry       ├── src/pages/Agents.jsx    Agent editor
├── app/kb/store.py         Knowledge base      ├── src/pages/KB.jsx        Knowledge base
├── app/skills/loader.py    Skill loader        ├── src/pages/Skills.jsx    Skills
├── app/mcp_client/         MCP client          ├── src/pages/Mcp.jsx       MCP manager
├── app/db/store.py         SQLite sessions     └── src/pages/Sessions.jsx  History
├── configs/agents/*.yaml   Built-in agents
└── data/                   kb / skills / db / mcp.json
```

## Quick Start

Requirements: [uv](https://docs.astral.sh/uv/), Node.js >= 20.

```bash
# Backend
cd backend
cp .env.example .env         # fill in your LLM credentials
uv run uvicorn app.main:app --port 8900

# Frontend (dev)
cd frontend
npm install
npm run dev                  # http://localhost:5173 -> proxies /api to :8900
```

Open http://localhost:5173, fill in the challenge form (title / category / description / attachment), pick an agent and workflow, and hit **Start**.

### Production (single process)

```bash
cd frontend && npm run build   # outputs dist/
cd ../backend && uv run uvicorn app.main:app --port 8900
# now http://localhost:8900 serves both API and UI
```

## Evaluation

Real-style challenges run end-to-end against a live LLM:

```bash
uv run --project backend python eval/run_eval.py all    # or crypto|misc|web
```

Current results (minimax):

| Challenge | Category | Agent | Result | Steps / Tools | Time |
|---|---|---|---|---|---|
| crypto_small_e (small-e RSA) | Crypto | crypto | PASS | 3 / 2 | 18s |
| misc_encoding (hex→b64→rot13) | Misc | general | PASS | 7 / 6 | 30s |
| web_warmup (LFI whitelist bypass) | Web | web | PASS | 11 / 13 | 36s |

`eval/` also includes a local vulnerable web app (FastAPI) so Web challenges can be tested fully offline.

## Configuration

All LLM settings live in `backend/.env`:

```ini
CTFAI_llm_api_key=sk-...
CTFAI_llm_base_url=https://api.openai.com/v1
CTFAI_llm_model=gpt-4o-mini
```

Any OpenAI-compatible endpoint works (vLLM, one-api, new-api, Ollama, ...).

## Development & Contributing

```bash
# backend tests / lint
cd backend && uv run pytest

# frontend type-check / build
cd frontend && npm run build
```

PRs welcome. Ideas worth exploring: reverse/pwn toolchains in the sandbox, headless browser tool, multi-agent collaboration, RAG over historical writeups.

## License

[MIT](LICENSE)
