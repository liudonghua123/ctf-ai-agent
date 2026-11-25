import React, { useEffect, useState } from 'react'
import { getMcp, saveMcp, mcpTools } from '../api'

export default function Mcp() {
  const [cfg, setCfg] = useState({ mcpServers: {} })
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [tools, setTools] = useState({})

  useEffect(() => {
    getMcp().then(r => {
      setCfg(r.data)
      setText(JSON.stringify(r.data, null, 2))
    })
  }, [])

  const save = async () => {
    try {
      const parsed = JSON.parse(text)
      await saveMcp(parsed)
      setCfg(parsed); setMsg('已保存 ✓')
    } catch (e) { setMsg('JSON 解析失败: ' + e.message) }
  }

  const checkTools = async (name) => {
    try {
      const r = await mcpTools(name)
      setTools(t => ({ ...t, [name]: r.data.tools.map(x => x.name).join(', ') }))
    } catch (e) {
      setTools(t => ({ ...t, [name]: '错误: ' + (e.response?.data?.detail || e.message) }))
    }
  }

  return (
    <div className="page">
      <div className="page-head"><h2>MCP 服务器配置</h2>
        <span className="hint-text">配置写入 backend/data/mcp.json，Agent 按 mcp_servers 字段引用</span></div>
      <div className="page panel">
        <textarea className="json-editor" rows={14} value={text}
          onChange={e => setText(e.target.value)} spellCheck={false} />
        <div className="row-inline">
          <button className="btn-primary" onClick={save}>保存配置</button>
          {Object.keys(cfg.mcpServers || {}).map(name => (
            <button key={name} className="chip" onClick={() => checkTools(name)}>
              测试 {name}
            </button>
          ))}
        </div>
        {msg && <div className="msg">{msg}</div>}
        {Object.entries(tools).map(([k, v]) => <div key={k} className="tool-line">{k}: {v}</div>)}
        <div className="example-box">
          <label>配置示例（stdio / http）</label>
          <pre>{`{
  "mcpServers": {
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] },
    "remote": { "url": "https://example.com/mcp" }
  }
}`}</pre>
        </div>
      </div>
    </div>
  )
}
