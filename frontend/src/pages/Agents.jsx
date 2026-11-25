import React, { useEffect, useState } from 'react'
import { getAgents, getAgent, saveAgent } from '../api'

const BLANK = {
  name: '', display_name: '', description: '', max_steps: 12,
  llm: {}, persona: '', tools: { builtin: [] },
  knowledge_bases: [], skills: [], mcp_servers: [],
}

const BUILTIN_TOOLS = ['python_exec', 'file_read', 'file_list', 'http_request', 'decode_helper']

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [meta, setMeta] = useState({ available_skills: [], available_kbs: [], available_mcp: [] })
  const [current, setCurrent] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => getAgents().then(r => {
    setAgents(r.data.agents); setMeta(r.data)
  })
  useEffect(load, [])

  const open = async (name) => {
    const a = agents.find(x => x.name === name)
    const full = await getAgent(name)
    setCurrent(name)
    setCfg({ ...BLANK, ...full.data })
    setMsg('')
  }

  const toggleIn = (list, item) =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item]

  const save = async () => {
    setSaving(true)
    try {
      const { name, ...rest } = cfg
      await saveAgent(current, rest)
      setMsg('已保存 ✓'); load()
    } catch (e) { setMsg('保存失败: ' + (e.response?.data?.detail || e.message)) }
    setSaving(false)
  }

  return (
    <div className="page">
      <div className="page-head"><h2>Agent 配置</h2>
        <span className="hint-text">YAML 配置位于 backend/configs/agents/，支持热加载</span></div>
      <div className="split">
        <div className="list-col panel">
          {agents.map(a => (
            <div key={a.name} className={current === a.name ? 'list-item active' : 'list-item'}
              onClick={() => open(a.name)}>
              <div className="li-title">{a.display_name || a.name}</div>
              <div className="li-sub">{a.description}</div>
            </div>
          ))}
        </div>
        <div className="edit-col panel">
          {!cfg && <div className="log-empty">← 选择一个 Agent 编辑</div>}
          {cfg && <>
            <div className="row two-col">
              <div><label>显示名</label>
                <input value={cfg.display_name} onChange={e => setCfg({ ...cfg, display_name: e.target.value })} /></div>
              <div><label>最大步数</label>
                <input type="number" value={cfg.max_steps}
                  onChange={e => setCfg({ ...cfg, max_steps: +e.target.value })} /></div>
            </div>
            <div className="row"><label>描述</label>
              <input value={cfg.description} onChange={e => setCfg({ ...cfg, description: e.target.value })} /></div>
            <div className="row"><label>Persona（人设/风格）</label>
              <textarea rows={4} value={cfg.persona}
                onChange={e => setCfg({ ...cfg, persona: e.target.value })} /></div>
            <div className="row"><label>内置工具</label>
              <div className="chips">
                {BUILTIN_TOOLS.map(t => (
                  <button key={t} className={cfg.tools?.builtin?.includes(t) ? 'chip on' : 'chip'}
                    onClick={() => setCfg({ ...cfg, tools: { ...cfg.tools, builtin: toggleIn(cfg.tools?.builtin || [], t) } })}>{t}</button>
                ))}
              </div></div>
            <div className="row"><label>知识库</label>
              <div className="chips">
                {meta.available_kbs.length === 0 && <span className="hint-text">（暂无知识库）</span>}
                {meta.available_kbs.map(k => (
                  <button key={k} className={cfg.knowledge_bases?.includes(k) ? 'chip on' : 'chip'}
                    onClick={() => setCfg({ ...cfg, knowledge_bases: toggleIn(cfg.knowledge_bases || [], k) })}>{k}</button>
                ))}
              </div></div>
            <div className="row"><label>Skills</label>
              <div className="chips">
                {meta.available_skills.map(s => (
                  <button key={s} className={cfg.skills?.includes(s) ? 'chip on' : 'chip'}
                    onClick={() => setCfg({ ...cfg, skills: toggleIn(cfg.skills || [], s) })}>{s}</button>
                ))}
              </div></div>
            <div className="row"><label>MCP Servers</label>
              <div className="chips">
                {meta.available_mcp.length === 0 && <span className="hint-text">（未配置 MCP）</span>}
                {meta.available_mcp.map(s => (
                  <button key={s} className={cfg.mcp_servers?.includes(s) ? 'chip on' : 'chip'}
                    onClick={() => setCfg({ ...cfg, mcp_servers: toggleIn(cfg.mcp_servers || [], s) })}>{s}</button>
                ))}
              </div></div>
            <div className="row"><label>LLM 覆盖（留空用全局）</label>
              <div className="two-col">
                <input placeholder="model" value={cfg.llm?.model || ''}
                  onChange={e => setCfg({ ...cfg, llm: { ...cfg.llm, model: e.target.value } })} />
                <input placeholder="base_url" value={cfg.llm?.base_url || ''}
                  onChange={e => setCfg({ ...cfg, llm: { ...cfg.llm, base_url: e.target.value } })} />
              </div></div>
            <button className="btn-primary" onClick={save} disabled={saving}>保存</button>
            {msg && <span className="msg">{msg}</span>}
          </>}
        </div>
      </div>
    </div>
  )
}
