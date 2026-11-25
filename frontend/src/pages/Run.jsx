import { useState, useRef, useEffect } from 'react'
import { getAgents, runAgent } from '../api'
import { useI18n } from '../i18n/index.jsx'

const WORKFLOWS = [
  { id: 'analyze', key: 'wf_analyze', descKey: 'wf_analyze_desc' },
  { id: 'solve', key: 'wf_solve', descKey: 'wf_solve_desc' },
  { id: 'writeup', key: 'wf_writeup', descKey: 'wf_writeup_desc' },
]

export default function Run() {
  const { t } = useI18n()
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
    runAgent(
      { agent, workflow, challenge, hint: hint || null },
      (ev) => {
        if (ev.type === 'session') return
        setEvents(prev => [...prev, ev])
        if (ev.type === 'final' && ev.flag) setFlag(ev.flag)
      },
      () => setRunning(false),
      (e) => {
        setEvents(prev => [...prev, { type: 'error', message: String(e) }])
        setRunning(false)
      },
    )
  }

  return (
    <div className="run-page">
      <section className="run-form panel" aria-label={t('challenge_info')}>
        <h2 className="panel-title">{t('challenge_info')}</h2>
        <div className="field">
          <label htmlFor="agent-sel">{t('agent')}</label>
          <select id="agent-sel" value={agent}
            onChange={e => setAgent(e.target.value)}>
            {agents.map(a => <option key={a.name} value={a.name}>
              {a.display_name || a.name}
            </option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('workflow')}</label>
          <div className="wf-tabs" role="tablist">
            {WORKFLOWS.map(w => (
              <button key={w.id} role="tab" aria-selected={workflow === w.id}
                className={workflow === w.id ? 'wf-tab active' : 'wf-tab'}
                onClick={() => setWorkflow(w.id)}>
                <span className="wf-name">{t(w.key)}</span>
                <span className="wf-desc">{t(w.descKey)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="ch-title">{t('title')}</label>
            <input id="ch-title" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={t('title_ph')} />
          </div>
          <div className="field">
            <label htmlFor="ch-cat">{t('category')}</label>
            <select id="ch-cat" value={category}
              onChange={e => setCategory(e.target.value)}>
              {['Web', 'Pwn', 'Reverse', 'Crypto', 'Misc', 'Forensics', 'Blockchain']
                .map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ch-desc">{t('description')}</label>
          <textarea id="ch-desc" rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('description_ph')} />
        </div>
        <div className="field">
          <label htmlFor="ch-att">{t('attachment')}</label>
          <input id="ch-att" value={attachment}
            onChange={e => setAttachment(e.target.value)}
            placeholder={t('attachment_ph')} />
        </div>
        <div className="field">
          <label htmlFor="ch-hint">{t('extra_hint')}</label>
          <input id="ch-hint" value={hint} onChange={e => setHint(e.target.value)}
            placeholder={t('extra_hint_ph')} />
        </div>
        <button className="btn btn-primary" onClick={start}
          disabled={running || !title.trim()}>
          {running ? t('running') : t('start')}
        </button>
      </section>

      <section className="run-log panel" aria-label={t('exec_log')}>
        <h2 className="panel-title">{t('exec_log')}</h2>
        {flag && <div className="flag-banner">{t('flag_label')}: {flag}</div>}
        <div className="log" ref={logRef} aria-live="polite">
          {events.length === 0 && <div className="log-empty">{t('log_empty')}</div>}
          {events.map((ev, i) => <EventView key={i} ev={ev} />)}
        </div>
      </section>
    </div>
  )
}

function EventView({ ev }) {
  const { t } = useI18n()
  if (ev.type === 'step') return <div className="ev-step">{t('step')} {ev.step}</div>
  if (ev.type === 'nudge') return <div className="ev-nudge">↻ keep going</div>
  if (ev.type === 'start') {
    return <div className="ev-start">{ev.agent} · {ev.tools.join(', ') || '—'}</div>
  }
  if (ev.type === 'token') return <Markdown text={ev.text} />
  if (ev.type === 'tool_call') {
    return <div className="ev-tool">▸ {ev.tool} <code>{JSON.stringify(ev.args).slice(0, 200)}</code></div>
  }
  if (ev.type === 'tool_result') {
    const s = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result)
    return (
      <details className="ev-tool-result">
        <summary>▸ {ev.tool} {t('result')}</summary>
        <pre>{s.slice(0, 2000)}</pre>
      </details>
    )
  }
  if (ev.type === 'final') return (
    <div className="ev-final"><Markdown text={ev.text || '—'} /></div>
  )
  if (ev.type === 'error') return <div className="ev-error">{t('error')}: {ev.message}</div>
  return null
}

// Minimal markdown: code blocks, inline code, headings, bold
function Markdown({ text }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g,
      (_, l, c) => `<pre class="code"><code>${c}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
