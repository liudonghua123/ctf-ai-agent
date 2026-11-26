import { useState, useRef, useEffect, useCallback } from 'react'
import {
  getAgents, runAgent, listSessions, getSession,
  renameSession, deleteSession, clearAgentSessions,
} from '../api'
import { useI18n } from '../i18n/index.jsx'

const WORKFLOWS = [
  { id: 'analyze', key: 'wf_analyze', descKey: 'wf_analyze_desc' },
  { id: 'solve', key: 'wf_solve', descKey: 'wf_solve_desc' },
  { id: 'writeup', key: 'wf_writeup', descKey: 'wf_writeup_desc' },
]
const CATEGORIES = ['Web', 'Pwn', 'Reverse', 'Crypto', 'Misc', 'Forensics', 'Blockchain']

const Chev = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
)

export default function Run() {
  const { t } = useI18n()
  const [agents, setAgents] = useState([])

  // sessions state
  const [sessions, setSessions] = useState([])
  const [collapsed, setCollapsed] = useState({})   // agent -> bool
  const [active, setActive] = useState(null)       // sid or 'draft'
  const [activeMsgs, setActiveMsgs] = useState(null) // loaded session messages
  const [draftTitle, setDraftTitle] = useState('')

  // composer state
  const [agent, setAgent] = useState('general')
  const [workflow, setWorkflow] = useState('analyze')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Misc')
  const [description, setDescription] = useState('')
  const [attachment, setAttachment] = useState('')
  const [hint, setHint] = useState('')

  // live run state
  const [liveEvents, setLiveEvents] = useState([])
  const [running, setRunning] = useState(false)
  const [flag, setFlag] = useState(null)
  const logRef = useRef(null)
  const sidRef = useRef(null)

  const refreshSessions = useCallback(async (selectSid) => {
    const { data } = await listSessions()
    setSessions(data.sessions)
    if (selectSid) setActive(selectSid)
  }, [])

  useEffect(() => {
    getAgents().then(r => {
      setAgents(r.data.agents)
      if (r.data.agents.length && !sessions.length) setAgent(r.data.agents[0].name)
    })
    refreshSessions()
  }, []) // eslint-disable-line

  useEffect(() => { logRef.current?.scrollTo(0, 1e9) }, [liveEvents, activeMsgs])

  // session list helpers ----------------------------------------------
  const byAgent = {}
  for (const a of agents) byAgent[a.name] = []
  for (const s of sessions) (byAgent[s.agent] ||= []).push(s)

  const openSession = async (sid) => {
    setActive(sid)
    setLiveEvents([]); setFlag(null); setDraftTitle('')
    const { data } = await getSession(sid)
    setActiveMsgs(data)
    // restore composer from session challenge
    if (data.challenge) {
      setAgent(data.agent); setWorkflow(data.workflow)
      setTitle(data.challenge.title || '')
      setCategory(data.challenge.category || 'Misc')
      setDescription(data.challenge.description || '')
      setAttachment(data.challenge.attachment || '')
    }
  }

  const newDraft = () => {
    setActive('draft'); setActiveMsgs(null)
    setLiveEvents([]); setFlag(null)
    setTitle(''); setDescription(''); setAttachment(''); setHint('')
    setDraftTitle('')
  }

  const doRename = async (s) => {
    const nn = window.prompt(t('rename_session'), s.title)
    if (!nn || nn === s.title) return
    await renameSession(s.id, nn)
    refreshSessions()
  }

  const doDelete = async (s) => {
    if (!window.confirm(t('delete_session') + `: ${s.title}?`)) return
    await deleteSession(s.id)
    if (active === s.id) newDraft()
    refreshSessions()
  }

  const doClearAgent = async (ag) => {
    if (!window.confirm(`${t('clear_sessions')} (${ag})?`)) return
    await clearAgentSessions(ag)
    if (active && sessions.find(s => s.id === active && s.agent === ag)) newDraft()
    refreshSessions()
  }

  // run ----------------------------------------------------------------
  const start = () => {
    if (running) return
    if (!title.trim() && !description.trim()) return
    setLiveEvents([]); setFlag(null); setRunning(true); setActiveMsgs(null)
    setDraftTitle(title.trim() || description.trim().slice(0, 40))
    setActive('draft')
    const challenge = { title, category, description, attachment }
    runAgent(
      { agent, workflow, challenge, hint: hint || null },
      (ev) => {
        if (ev.type === 'session') { sidRef.current = ev.sid; return }
        setLiveEvents(prev => [...prev, ev])
        if (ev.type === 'final' && ev.flag) setFlag(ev.flag)
      },
      () => { setRunning(false); refreshSessions(sidRef.current) },
      (e) => {
        setLiveEvents(prev => [...prev, { type: 'error', message: String(e) }])
        setRunning(false)
      },
    )
  }

  // header title of the chat column
  const activeSession = sessions.find(s => s.id === active)
  const headerTitle = running ? (draftTitle || t('new_session'))
    : activeSession ? activeSession.title
    : active === 'draft' ? (draftTitle || t('new_session'))
    : t('app_name')

  // messages to render in chat column
  const chatItems = buildChatItems(activeMsgs, liveEvents, running, t)

  return (
    <div className="page" style={{ height: '100%' }}>
      <div className="run-shell">
        {/* ------- left: session list grouped by agent ------- */}
        <aside className="sess-col">
          <div className="sess-col-head">
            <b>{t('sessions_title')}</b>
            <button className="chip-btn" onClick={newDraft}>+ {t('new_session')}</button>
          </div>
          <div className="sess-list">
            {agents.map(a => {
              const list = byAgent[a.name] || []
              const open = !collapsed[a.name]
              return (
                <div key={a.name} className={'agent-group' + (open ? ' open' : '')}>
                  <button className="agent-group-head"
                    onClick={() => setCollapsed(c => ({ ...c, [a.name]: open }))}>
                    <span className="chev"><Chev /></span>
                    <span className="ag-name">{a.display_name || a.name}</span>
                    <span className="ag-count">{list.length || ''}</span>
                    <span className="ag-add" title={t('new_session')}
                      onClick={e => { e.stopPropagation(); newDraft(); setAgent(a.name) }}>+</span>
                    <span className="ag-add" title={t('clear_sessions')}
                      onClick={e => { e.stopPropagation(); doClearAgent(a.name) }}>⌫</span>
                  </button>
                  {open && list.map(s => (
                    <div key={s.id}
                      className={'sess-item' + (active === s.id ? ' active' : '')}
                      onClick={() => openSession(s.id)}>
                      <span className="si-title">{s.title}</span>
                      <span className="si-ops">
                        <button title={t('rename_session')}
                          onClick={e => { e.stopPropagation(); doRename(s) }}>✎</button>
                        <button title={t('delete_session')}
                          onClick={e => { e.stopPropagation(); doDelete(s) }}>×</button>
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
            {agents.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: 13, padding: 'var(--s-3)' }}>
                {t('loading')}</p>
            )}
          </div>
        </aside>

        {/* ------- right: chat ------- */}
        <section className="chat-col">
          <div className="chat-head">
            <span className="ch-title">{headerTitle}</span>
            {flag && <span className="flag-banner" style={{ padding: '4px 12px' }}>
              {t('flag_label')}: {flag}</span>}
            {activeSession && (
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                {activeSession.agent} · {activeSession.workflow}</span>
            )}
          </div>

          <div className="chat-log" ref={logRef} aria-live="polite">
            {chatItems.length === 0 && (
              <div className="chat-empty">{t('chat_empty')}</div>
            )}
            {chatItems.map((m, i) => <ChatMsg key={i} m={m} />)}
          </div>

          {/* composer */}
          <div className="composer">
            <div className="comp-row">
              <select className="input" style={{ flex: '0 0 150px' }} value={agent}
                onChange={e => setAgent(e.target.value)}>
                {agents.map(a => <option key={a.name} value={a.name}>
                  {a.display_name || a.name}</option>)}
              </select>
              <select className="input" style={{ flex: '0 0 130px' }} value={workflow}
                onChange={e => setWorkflow(e.target.value)}>
                {WORKFLOWS.map(w => <option key={w.id} value={w.id}>{t(w.key)}</option>)}
              </select>
              <select className="input" style={{ flex: '0 0 120px' }} value={category}
                onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input className="input" style={{ flex: 1 }} value={title}
                onChange={e => setTitle(e.target.value)} placeholder={t('title_ph')} />
            </div>
            <textarea id="ch-desc" className="input" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('description_ph')} />
            <div className="comp-row">
              <input className="input" style={{ flex: 1 }} value={attachment}
                onChange={e => setAttachment(e.target.value)}
                placeholder={t('attachment_ph')} />
              <input className="input" style={{ flex: 1 }} value={hint}
                onChange={e => setHint(e.target.value)}
                placeholder={t('extra_hint_ph')} />
              <button className="btn btn-primary" style={{ flex: '0 0 auto' }}
                onClick={start}
                disabled={running || (!title.trim() && !description.trim())}>
                {running ? t('running') : t('start')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Build chat items: merge persisted messages or live events into     */
/* a CherryStudio-like transcript: user -> reasoning/tools -> answer  */
function buildChatItems(saved, live, running, t) {
  const items = []
  if (saved) {
    // persisted session
    let pendingTools = []
    const flushTools = () => {
      if (pendingTools.length) {
        items.push({ kind: 'tools', tools: pendingTools })
        pendingTools = []
      }
    }
    for (const ev of saved.messages || []) {
      if (ev.type === 'token') {
        flushTools()
        items.push({ kind: 'text', role: 'assistant', text: ev.text })
      } else if (ev.type === 'tool_call' || ev.type === 'tool_result') {
        pendingTools.push(ev)
      } else if (ev.type === 'error') {
        flushTools()
        items.push({ kind: 'error', message: ev.message })
      } else if (ev.type === 'final') {
        flushTools()
        items.push({ kind: 'final', text: ev.content || ev.text })
      }
    }
    flushTools()
    // user bubble from challenge
    const ch = saved.challenge || {}
    if (ch.title || ch.description) {
      items.unshift({
        kind: 'user',
        text: [ch.title && `**${ch.title}**`, ch.description]
          .filter(Boolean).join('\n\n'),
      })
    }
    return items
  }
  // live events
  let pendingTools = []
  let texts = []
  const flushAll = () => {
    if (pendingTools.length) {
      items.push({ kind: 'tools', tools: pendingTools })
      pendingTools = []
    }
    if (texts.length) {
      items.push({ kind: 'text', role: 'assistant', text: texts.join('') })
      texts = []
    }
  }
  for (const ev of live) {
    if (ev.type === 'start' || ev.type === 'step' || ev.type === 'nudge') continue
    if (ev.type === 'token') { texts.push(ev.text); continue }
    if (ev.type === 'tool_call' || ev.type === 'tool_result') { pendingTools.push(ev); continue }
    if (ev.type === 'error') { flushAll(); items.push({ kind: 'error', message: ev.message }); continue }
    if (ev.type === 'final') { flushAll(); items.push({ kind: 'final', text: ev.text }) }
  }
  if (running && !items.length && !pendingTools.length && !texts.length) {
    items.push({ kind: 'thinking' })
  }
  // trailing state (running dots / unflushed)
  if (pendingTools.length || texts.length) {
    if (pendingTools.length) items.push({ kind: 'tools', tools: pendingTools })
    if (texts.length) items.push({ kind: 'text', role: 'assistant', text: texts.join('') })
    if (running) items.push({ kind: 'thinking' })
  }
  // user bubble
  return items
}

function ChatMsg({ m }) {
  const { t } = useI18n()
  if (m.kind === 'user') {
    return (
      <div className="chat-msg user">
        <div className="cm-role">{t('challenge_info')}</div>
        <div className="chat-bubble"><Markdown text={m.text} /></div>
      </div>
    )
  }
  if (m.kind === 'text') {
    return (
      <div className="chat-msg">
        <div className="cm-role">{t('final_answer')}</div>
        <div className="chat-bubble"><Markdown text={m.text} /></div>
      </div>
    )
  }
  if (m.kind === 'final') {
    return (
      <div className="chat-msg">
        <div className="cm-role">{t('final_answer')}</div>
        <div className="chat-bubble"><Markdown text={m.text || '—'} /></div>
      </div>
    )
  }
  if (m.kind === 'tools') {
    return (
      <div className="chat-msg">
        <div className="chat-tools">
          {m.tools.map((ev, i) => (
            ev.type === 'tool_call' ? (
              <details key={i} className="chat-tool" open={i === m.tools.length - 1}>
                <summary>▸ {ev.tool} <code>{JSON.stringify(ev.args).slice(0, 120)}</code></summary>
                <pre>{JSON.stringify(ev.args, null, 2).slice(0, 1500)}</pre>
              </details>
            ) : (
              <details key={i} className="chat-tool">
                <summary>▸ {ev.tool} · {t('result')}</summary>
                <pre>{(typeof ev.result === 'string' ? ev.result
                  : JSON.stringify(ev.result, null, 2)).slice(0, 2500)}</pre>
              </details>
            )
          ))}
        </div>
      </div>
    )
  }
  if (m.kind === 'thinking') {
    return (
      <div className="chat-msg">
        <div className="cm-role">{t('thinking')}</div>
        <div className="chat-bubble" style={{ color: 'var(--text-3)' }}>
          <span className="dots">● ● ●</span>
        </div>
      </div>
    )
  }
  if (m.kind === 'error') {
    return <div className="ev-error">{t('error')}: {m.message}</div>
  }
  return null
}

// Minimal markdown: code blocks, inline code, headings, bold
function Markdown({ text }) {
  const html = (text || '')
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
