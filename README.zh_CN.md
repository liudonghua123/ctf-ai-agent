# CTF AI Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

前后端分离的 **CTF 智能体**：自主完成题目分析、解题、Writeup 生成。设计上灵活可扩展——支持内置可配置 Agent、知识库、Skills 与 MCP。

> [English (README.md)](README.md)

## 功能

### 三种工作流
- **分析（analyze）** — 识别考点、评估攻击面、给出解题计划
- **解题（solve）** — ReAct 式自主解题：工具循环 + 卡死检测 nudge + flag 提取
- **Writeup** — 生成可发布的 Markdown 赛题报告

### 可配置 Agent
Agent 即 YAML 文件（`backend/configs/agents/*.yaml`），可在 UI 中实时编辑：
- 自定义人设（persona）、最大步数、温度
- 每个 Agent 可覆盖 LLM 配置（key / base_url / model）
- 按需勾选内置工具、知识库、Skills、MCP servers

默认内置三个：`general`（通用）、`crypto`（密码学）、`web`（Web 安全）。

### 扩展体系
| 系统 | 说明 | 配置位置 |
|---|---|---|
| **知识库** | 文档分块 + 向量检索（OpenAI 兼容 embedding，失败时回退本地哈希 embedding），Agent 通过 `kb_search` 工具查询 | `backend/data/kb/` |
| **Skills** | 提示注入（inject_prompt）+ Python 自定义工具（handler），一个目录一个技能 | `backend/data/skills/` |
| **MCP** | stdio 与 streamable-HTTP MCP server，工具直接暴露给 Agent | `backend/data/mcp.json` |

### 内置工具
`python_exec`（沙箱子进程，30s 超时）、`file_read`、`file_list`、`http_request`、`decode_helper`

### 工程细节
- SSE 流式：每步推理、工具调用、结果实时渲染
- 会话持久化（SQLite）
- 卡死检测：模型停下来且没找到 flag 时，引擎自动 nudge 继续
- 单进程部署：后端直接托管前端构建产物

## 架构

```
backend/  FastAPI（uv 管理）            frontend/  Vite + React
├── app/agents/engine.py    ReAct 引擎      ├── src/pages/Run.jsx       运行台
├── app/tools/registry.py   工具注册表      ├── src/pages/Agents.jsx    Agent 编辑
├── app/kb/store.py         知识库          ├── src/pages/KB.jsx        知识库
├── app/skills/loader.py    Skills 加载     ├── src/pages/Skills.jsx    Skills
├── app/mcp_client/         MCP 客户端      ├── src/pages/Mcp.jsx       MCP 管理
├── app/db/store.py         SQLite 会话     └── src/pages/Sessions.jsx  历史
├── configs/agents/*.yaml   内置 Agent
└── data/                   kb / skills / db / mcp.json
```

## 快速开始

依赖：[uv](https://docs.astral.sh/uv/)、Node.js >= 20。

```bash
# 后端
cd backend
cp .env.example .env         # 填入 LLM 配置
uv run uvicorn app.main:app --port 8900

# 前端（开发）
cd frontend
npm install
npm run dev                  # http://localhost:5173（/api 代理到 8900）
```

打开 http://localhost:5173，填写题目信息（标题 / 类别 / 描述 / 附件），选择 Agent 和工作流，点 **启动**。

### 生产（单进程）

```bash
cd frontend && npm run build   # 产出 dist/
cd ../backend && uv run uvicorn app.main:app --port 8900
# 此时 http://localhost:8900 同时提供 API 和 UI
```

## 评测

真实风格赛题 + 在线 LLM 端到端验证：

```bash
uv run --project backend python eval/run_eval.py all    # 或 crypto|misc|web
```

当前成绩（minimax）：

| 题目 | 类别 | Agent | 结果 | 步数/工具 | 耗时 |
|---|---|---|---|---|---|
| crypto_small_e（低指数 RSA） | Crypto | crypto | PASS | 3 / 2 | 18s |
| misc_encoding（hex→b64→rot13） | Misc | general | PASS | 7 / 6 | 30s |
| web_warmup（LFI 白名单绕过） | Web | web | PASS | 11 / 13 | 36s |

`eval/` 还包含一个本地漏洞 Web 应用（FastAPI），Web 题可完全离线测试。

## 配置

LLM 配置在 `backend/.env`：

```ini
CTFAI_llm_api_key=sk-...
CTFAI_llm_base_url=https://api.openai.com/v1
CTFAI_llm_model=gpt-4o-mini
```

任何 OpenAI 兼容端点均可（vLLM、one-api、new-api、Ollama 等）。

## 开发与贡献

```bash
# 后端测试
cd backend && uv run pytest

# 前端构建
cd frontend && npm run build
```

欢迎 PR。可探索方向：沙箱内 reverse/pwn 工具链、无头浏览器工具、多 Agent 协作、历史 writeup RAG。

## License

[MIT](LICENSE)
