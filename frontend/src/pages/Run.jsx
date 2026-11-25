import React, { useState, useRef, useEffect } from 'react'
import { getAgents, runAgent } from '../api'

const WORKFLOWS = [
  { id: 'analyze', label: '分析', desc: '考点分析 & 攻击面评估' },
  { id: 'solve', label: '解题', desc: 'Agent 自主解题（带工具）' },
  { id: 'writeup', label: 'Writeup', desc: '生成完整赛题报告' },
]

export default function Run() {
  const [agents, setAgents] = useState([])
  const [agent, setAgent] = useState('general')
  const [workflow, setWorkflow] = useState('analyze')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Misc')
  const [description, setDescription] = useState('')
  const [attachment, setAttachment] = useState('')
  const [hint, setHint] = useState('')
  const [events, setEvents] = useState([])
  const [running, setRunning] = useState(false)
  const [flag, setFlag] = useState(null)
  const logRef = useRef(null)

  useEffect(() => { getAgents().then(r => {
    setAgents(r.data.agents)
    if (r.data.agents.length) setAgent(r.data.agents[0].name)
  }) }, [])

  useEffect(() => { logRef.current?.scrollTo(0, 1e9) }, [events])

  const start = () => {
    if (!title.trim() || running) return
    setEvents([]); setFlag(null); setRunning(true)
    const challenge = { title, category, description, attachment }
    let sid = null
    runAgent(
      { agent, workflow, challenge, hint: hint || null },
      (ev) => {
        if (ev.type === 'session') { sid = ev.sid; return }
        setEvents(prev => [...prev, ev])
        if (ev.type === 'final' && ev.flag) setFlag(ev.flag)
      },
      () => setRunning(false),
      (e) => { setEvents(prev => [...prev, { type: 'error', message: String(e) }]); setRunning(false) }
    )
  }

  return (
    <div className="run-page">
      <div className="run-form panel">
        <h2>题目信息</h2>
        <div className="row">
          <label>Agent</label>
          <select value={agent} onChange={e => setAgent(e.target.value)}>
            {agents.map(a => <option key={a.name} value={a.name}>
              {a.display_name || a.name}</option>)}
          </select>
        </div>
        <div className="row">
          <label>工作流</label>
          <div className="wf-tabs">
            {WORKFLOWS.map(w => (
              <button key={w.id} title={w.desc}
                className={workflow === w.id ? 'wf-tab active' : 'wf-tab'}
                onClick={() => setWorkflow(w.id)}>{w.label}</button>
            ))}
          </div>
        </div>
        <div className="row two-col">
          <div>
            <label>标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="例如：easy_rsa" />
          </div>
          <div>
            <label>类别</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {['Web', 'Pwn', 'Reverse', 'Crypto', 'Misc', 'Forensics', 'Blockchain'].map(c =>
                <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <label>描述</label>
          <textarea rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="题目描述、已知参数（如 n, e, c）、提示等" />
        </div>
        <div className="row">
          <label>附件路径（相对 challenge_files）</label>
          <input value={attachment} onChange={e => setAttachment(e.target.value)}
            placeholder="例如：chall.zip / 留空" />
        </div>
        <div className="row">
          <label>额外提示（可选）</label>
          <input value={hint} onChange={e => setHint(e.target.value)}
            placeholder="给 Agent 的补充说明" />
        </div>
        <button className="btn-primary" onClick={start} disabled={running || !title.trim()}>
          {running ? '运行中…' : '启动'}
        </button>
      </div>

      <div className="run-log panel">
        <h2>执行日志</h2>
        {flag && (
          <div className="flag-banner">
            🚩 FLAG: <code>{flag}</code>
          </div>
        )}
        <div className="log" ref={logRef}>
          {events.length === 0 && <div className="log-empty">填写题目信息后点“启动”</div>}
          {events.map((ev, i) => <EventView key={i} ev={ev} />)}
        </div>
      </div>
    </div>
  )
}

function EventView({ ev }) {
  if (ev.type === 'step') return <div className="ev-step">── 第 {ev.step} 步 ──</div>
  if (ev.type === 'start') return <div className="ev-start">已加载 Agent「{ev.agent}」，工具: {ev.tools.join(', ') || '无'}</div>
  if (ev.type === 'token') return <div className="ev-text"><ReactMarkdownish text={ev.text} /></div>
  if (ev.type === 'tool_call') return <div className="ev-tool">🔧 调用 {ev.tool} <code>{JSON.stringify(ev.args).slice(0, 200)}</code></div>
  if (ev.type === 'tool_result') {
    const s = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result)
    return <details className="ev-tool-result"><summary>📥 {ev.tool} 结果</summary><pre>{s.slice(0, 2000)}</pre></details>
  }
  if (ev.type === 'final') return <div className="ev-final"><ReactMarkdownish text={ev.text || '(无输出)'} /></div>
  if (ev.type === 'error') return <div className="ev-error">⚠ {ev.message}</div>
  return null
}

// 极简 markdown 渲染（代码块 + 加粗 + 标题）
function ReactMarkdownish({ text }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre class="code"><code>${c}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
