import { useState, useRef, useEffect, useCallback } from 'react'
import {
  getAgents, getAgent, runAgent, listSessions, getSession,
  renameSession, deleteSession, clearAgentSessions,
  uploadChallengeFile,
} from '../api'
import { useI18n } from '../i18n/index.jsx'
import Modal from '../components/Modal.jsx'

const Chev = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
)
const IcoClip = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
)
const IcoSliders = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
)

const fmtTok = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0)

export default function Run() {
  const { t } = useI18n()
  const [agents, setAgents] = useState([])
  const [agentMeta, setAgentMeta] = useState({})  // name -> full cfg

  // sessions state
  const [sessions, setSessions] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [active, setActive] = useState(null)      // sid | 'draft'
  const [activeMsgs, setActiveMsgs] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')

  // composer state
  const [agent, setAgent] = useState('general')
  const [workflow, setWorkflow] = useState('solve')
  const [description, setDescription] = useState('')
  const [hint, setHint] = useState('')
  const [attachments, setAttachments] = useState([])  // [{path,size}]
  const [dragOver, setDragOver] = useState(false)
  const [showOpts, setShowOpts] = useState(false)
  const [overrides, setOverrides] = useState({})      // {skills,mcp_servers,knowledge_bases}
  const [approvalGate, setApprovalGate] = useState(false)
  const [available, setAvailable] = useState({ skills: [], kbs: [], mcp: [] })

  // live run state
  const [liveEvents, setLiveEvents] = useState([])
  const [running, setRunning] = useState(false)
  const [flag, setFlag] = useState(null)
  const [usage, setUsage] = useState({ input: 0, output: 0 })
  const [elapsed, setElapsed] = useState(null)
  const [hitl, setHitl] = useState(null)   // pending confirm {reply_id, tools}
  const logRef = useRef(null)
  const fileRef = useRef(null)
  const sidRef = useRef(null)
  const taRef = useRef(null)

  const refreshSessions = useCallback(async (selectSid) => {
    const { data } = await listSessions()
    setSessions(data.sessions)
    if (selectSid) setActive(selectSid)
  }, [])

  useEffect(() => {
    getAgents().then(r => {
      setAgents(r.data.agents)
      setAvailable({
        skills: r.data.available_skills || [],
        kbs: r.data.available_kbs || [],
        mcp: r.data.available_mcp || [],
      })
      if (r.data.agents.length) setAgent(r.data.agents[0].name)
      // load default agent configs (for defaults of skills/mcp/kb)
      Promise.all(r.data.agents.map(a =>
        getAgent(a.name).then(x => [a.name, x.data])
      )).then(entries => setAgentMeta(Object.fromEntries(entries)))
    })
    refreshSessions()
  }, []) // eslint-disable-line

  useEffect(() => { logRef.current?.scrollTo(0, 1e9) }, [liveEvents, activeMsgs])

  const agentCfg = agentMeta[agent] || {}
  const defaults = {
    skills: agentCfg.skills || [],
    mcp_servers: agentCfg.mcp_servers || [],
    knowledge_bases: agentCfg.knowledge_bases || [],
  }

  // session list helpers ----------------------------------------------
  const byAgent = {}
  for (const a of agents) byAgent[a.name] = []
  for (const s of sessions) (byAgent[s.agent] ||= []).push(s)

  const openSession = async (sid) => {
    setActive(sid); setLiveEvents([]); setFlag(null); setDraftTitle('')
    setUsage({ input: 0, output: 0 }); setElapsed(null); setHitl(null)
    const { data } = await getSession(sid)
    setActiveMsgs(data)
    if (data.challenge) {
      setAgent(data.agent); setWorkflow(data.workflow || 'solve')
      setDescription(data.challenge.description || '')
      setAttachments(data.challenge.attachment
        ? [{ path: data.challenge.attachment }] : [])
    }
  }

  const newDraft = () => {
    setActive('draft'); setActiveMsgs(null)
    setLiveEvents([]); setFlag(null); setHitl(null)
    setDescription(''); setHint('')
    setAttachments([]); setUsage({ input: 0, output: 0 }); setElapsed(null)
    setDraftTitle(''); setOverrides({}); setApprovalGate(false)
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

  // uploads -----------------------------------------------------------
  const addFiles = async (files) => {
    for (const f of files) {
      try {
        const { data } = await uploadChallengeFile(f)
        setAttachments(prev =>
          prev.some(a => a.path === data.path) ? prev : [...prev, data])
      } catch { /* ignore */ }
    }
  }
  const onDrop = async (e) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer?.files?.length) await addFiles([...e.dataTransfer.files])
  }
  const onPaste = async (e) => {
    const files = [...(e.clipboardData?.files || [])]
    if (files.length) { e.preventDefault(); await addFiles(files) }
  }

  // run ----------------------------------------------------------------
  const start = () => {
    if (running) return
    if (!description.trim()) return
    setLiveEvents([]); setFlag(null); setRunning(true); setActiveMsgs(null)
    setUsage({ input: 0, output: 0 }); setElapsed(null); setHitl(null)
    const autoTitle = description.trim().split('\n')[0].slice(0, 60)
    setDraftTitle(autoTitle)
    setActive('draft')
    const challenge = {
      title: autoTitle, description,
      attachment: attachments.map(a => a.path).join(', '),
    }
    const o = overrides
    runAgent(
      {
        agent, workflow, challenge, hint: hint || null,
        approval_gate: approvalGate,
        skills: o.skills?.length ? o.skills : undefined,
        mcp_servers: o.mcp_servers?.length ? o.mcp_servers : undefined,
        knowledge_bases: o.knowledge_bases?.length ? o.knowledge_bases : undefined,
      },
      (ev) => {
        if (ev.type === 'session') { sidRef.current = ev.sid; return }
        setLiveEvents(prev => [...prev, ev])
        if (ev.type === 'final') {
          if (ev.flag) setFlag(ev.flag)
          if (ev.elapsed) setElapsed(ev.elapsed)
          if (ev.usage) setUsage(ev.usage)
        }
        if (ev.type === 'usage') {
          setUsage(u => ({ input: u.input + (ev.input_tokens || 0),
                            output: u.output + (ev.output_tokens || 0) }))
        }
        if (ev.type === 'hitl_request') setHitl(ev)
      },
      () => { setRunning(false); refreshSessions(sidRef.current) },
      (e) => {
        setLiveEvents(prev => [...prev, { type: 'error', message: String(e) }])
        setRunning(false)
      },
    )
  }

  const answerHITL = async (confirmed) => {
    if (!hitl) return
    setLiveEvents(prev => [...prev, {
      type: 'hitl_answer', confirmed,
      tools: hitl.tools,
    }])
    setHitl(null)
    setRunning(true)
    const challenge = {
      title: description.trim().split('\n')[0].slice(0, 60),
      description,
      attachment: attachments.map(a => a.path).join(', '),
    }
    runAgent(
      {
        agent, workflow, challenge, hint: null,
        resume: {
          sid: sidRef.current,
          event: {
            reply_id: hitl.reply_id,
            tool_calls: hitl._blocks,
            confirm_results: hitl.tools.map(() => ({ confirmed })),
          },
        },
      },
      (ev) => {
        if (ev.type === 'session') return
        setLiveEvents(prev => [...prev, ev])
        if (ev.type === 'usage') {
          setUsage(u => ({ input: u.input + (ev.input_tokens || 0),
                            output: u.output + (ev.output_tokens || 0) }))
        }
        if (ev.type === 'final') {
          if (ev.flag) setFlag(ev.flag)
          if (ev.elapsed) setElapsed(ev.elapsed)
          if (ev.usage) setUsage(ev.usage)
        }
        if (ev.type === 'hitl_request') setHitl(ev)
      },
      () => { setRunning(false); refreshSessions(sidRef.current) },
      (e) => {
        setLiveEvents(prev => [...prev, { type: 'error', message: String(e) }])
        setRunning(false)
      },
    )
  }

  const activeAgentName = (agents.find(a => a.name === agent)
    || {}).display_name || agent

  const activeSession = sessions.find(s => s.id === active)
  const headerTitle = running ? (draftTitle || t('new_session'))
    : activeSession ? activeSession.title
    : active === 'draft' ? (draftTitle || t('new_session'))
    : t('app_name')

  const chatItems = buildChatItems(activeMsgs, liveEvents, running, t, hitl)

  const toggleIn = (list, item) =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item]

  return (
    <div className="page" style={{ height: '100%' }}>
      <div className="run-shell">
        {/* ------- left: sessions by agent ------- */}
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
            {running && <span className="run-pill">{t('running')}</span>}
            {flag && <span className="flag-banner" style={{ padding: '4px 12px' }}>
              {t('flag_label')}: {flag}</span>}
            {(usage.input > 0 || elapsed) && (
              <span className="meta-pill">
                {elapsed ? `${elapsed}s · ` : ''}
                ↑{fmtTok(usage.input)} ↓{fmtTok(usage.output)} tok
              </span>
            )}
          </div>

          <div className={'chat-log' + (dragOver ? ' drag-over' : '')}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}>
            {dragOver && <div className="drop-hint">⬇ {t('upload_pick')}</div>}
            {chatItems.length === 0 && !dragOver && (
              <div className="chat-empty">{t('chat_empty')}</div>
            )}
            {chatItems.map((m, i) => <ChatMsg key={i} m={m} />)}
          </div>

          {/* HITL approval bar */}
          {hitl && (
            <div className="hitl-bar">
              <b>⏸ {t('hitl_title')}</b>
              {hitl.tools.map((tc, i) => (
                <div key={i} className="hitl-tool">
                  <code>{tc.name}</code>
                  <span>{JSON.stringify(tc.input).slice(0, 120)}</span>
                </div>
              ))}
              <div className="hitl-actions">
                <button className="chip-btn danger"
                  onClick={() => answerHITL(false)}>{t('hitl_reject')}</button>
                <button className="chip-btn primary"
                  onClick={() => answerHITL(true)}>{t('hitl_approve')}</button>
              </div>
            </div>
          )}

          {/* composer */}
          <div className={'composer' + (dragOver ? ' drag-over' : '')}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}>
            {attachments.length > 0 && (
              <div className="att-row">
                {attachments.map(a => (
                  <span key={a.path} className="att-chip">
                    <IcoClip /> {a.path}
                    <button onClick={() => setAttachments(prev =>
                      prev.filter(x => x.path !== a.path))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <textarea id="ch-desc" ref={taRef} className="input" value={description}
              onPaste={onPaste}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('description_ph')} />
            <div className="comp-bar">
              <button className="icon-btn" title={t('upload_pick')}
                onClick={() => fileRef.current?.click()}><IcoClip /></button>
              <input ref={fileRef} type="file" multiple hidden
                onChange={e => { addFiles([...e.target.files]); e.target.value = '' }} />
              <button className={'icon-btn' + (showOpts ? ' active' : '')}
                title={t('session_opts')} onClick={() => setShowOpts(true)}>
                <IcoSliders /></button>
              <span className="comp-hint">
                {activeAgentName} · {t('wf_solve')}
                {approvalGate ? ` · ${t('approval_gate')}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={start}
                disabled={running || !description.trim()}>
                {running ? t('running') : t('start')}
              </button>
            </div>
          </div>

          {/* session options modal (maximizable) */}
          {showOpts && (
            <Modal title={t('session_opts')} onClose={() => setShowOpts(false)} wide
              footer={<>
                <label className="opt-check" style={{ marginRight: 'auto' }}>
                  <input type="checkbox" checked={approvalGate}
                    onChange={e => setApprovalGate(e.target.checked)} />
                    {t('approval_gate')}
                </label>
                <button className="chip-btn primary"
                  onClick={() => setShowOpts(false)}>{t('confirm')}</button>
              </>}>
              <div className="frm">
                <div className="frm-row">
                  <div className="field">
                    <label>{t('agent')}</label>
                    <select className="input" value={agent}
                      onChange={e => setAgent(e.target.value)}>
                      {agents.map(a => <option key={a.name} value={a.name}>
                        {a.display_name || a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="frm-row">
                  <div className="field">
                    <label>{t('skills')}</label>
                    <div className="chips">
                      {(available.skills.length ? available.skills : defaults.skills).map(s => (
                        <button key={s}
                          className={(overrides.skills ?? defaults.skills).includes(s) ? 'chip on' : 'chip'}
                          onClick={() => setOverrides(o => ({
                            ...o, skills: toggleIn(o.skills ?? defaults.skills, s),
                          }))}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="frm-row">
                  <div className="field">
                    <label>{t('mcp_servers')}</label>
                    <div className="chips">
                      {available.mcp.map(s => (
                        <button key={s}
                          className={(overrides.mcp_servers ?? defaults.mcp_servers).includes(s) ? 'chip on' : 'chip'}
                          onClick={() => setOverrides(o => ({
                            ...o, mcp_servers: toggleIn(o.mcp_servers ?? defaults.mcp_servers, s),
                          }))}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="frm-row">
                  <div className="field">
                    <label>{t('knowledge_bases')}</label>
                    <div className="chips">
                      {available.kbs.map(k => (
                        <button key={k}
                          className={(overrides.knowledge_bases ?? defaults.knowledge_bases).includes(k) ? 'chip on' : 'chip'}
                          onClick={() => setOverrides(o => ({
                            ...o, knowledge_bases: toggleIn(o.knowledge_bases ?? defaults.knowledge_bases, k),
                          }))}>{k}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function buildChatItems(saved, live, running, t, hitl) {
  const items = []
  if (saved) {
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
      } else if (ev.type === 'thinking') {
        flushTools()
        items.push({ kind: 'thinking_block', text: ev.delta })
      } else if (ev.type === 'tool_call' || ev.type === 'tool_result') {
        pendingTools.push(ev)
      } else if (ev.type === 'error') {
        flushTools()
        items.push({ kind: 'error', message: ev.message })
      } else if (ev.type === 'final') {
        flushTools()
        items.push({ kind: 'final', text: ev.content || ev.text,
                     usage: ev.usage, elapsed: ev.elapsed })
      }
    }
    flushTools()
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
  // live: group consecutive tool events into collapsible process cards
  let texts = []
  let thinking = []
  let tools = []
  const flushAll = () => {
    if (thinking.length) {
      items.push({ kind: 'thinking_block', text: thinking.join('') })
      thinking = []
    }
    if (tools.length) {
      items.push({ kind: 'tools', tools })
      tools = []
    }
    if (texts.length) {
      items.push({ kind: 'text', role: 'assistant', text: texts.join('') })
      texts = []
    }
  }
  for (const ev of live) {
    if (ev.type === 'start' || ev.type === 'step' || ev.type === 'nudge'
      || ev.type === 'usage') continue
    if (ev.type === 'thinking') { thinking.push(ev.delta); continue }
    if (ev.type === 'token') { flushAll(); texts.push(ev.text); continue }
    if (ev.type === 'tool_call' || ev.type === 'tool_result') { tools.push(ev); continue }
    if (ev.type === 'hitl_request') { flushAll(); continue }
    if (ev.type === 'hitl_answer') {
      flushAll()
      items.push({ kind: 'hitl_answer', confirmed: ev.confirmed, tools: ev.tools })
      continue
    }
    if (ev.type === 'error') { flushAll(); items.push({ kind: 'error', message: ev.message }); continue }
    if (ev.type === 'final') { flushAll(); items.push({ kind: 'final', text: ev.text }) }
  }
  // keep trailing groups visible while running
  if (thinking.length) items.push({ kind: 'thinking_block', text: thinking.join(''), live: running })
  if (tools.length) items.push({ kind: 'tools', tools, live: running })
  if (texts.length) items.push({ kind: 'text', role: 'assistant', text: texts.join('') })
  if (running && !hitl && !items.length) items.push({ kind: 'thinking' })
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
  if (m.kind === 'thinking_block') {
    return (
      <details className="proc-card think">
        <summary>🧠 {t('thinking')} <em>{Math.ceil(m.text.length / 4)} tok</em></summary>
        <pre>{m.text}</pre>
      </details>
    )
  }
  if (m.kind === 'tools') {
    const n = m.tools.filter(x => x.type === 'tool_call').length
    return (
      <details className="proc-card tools" open={m.live}>
        <summary>🔧 {t('tool_call')} × {n}
          {m.live && <span className="dots"> ● ● ●</span>}</summary>
        <div className="proc-body">
          {m.tools.map((ev, i) => (
            ev.type === 'tool_call' ? (
              <div key={i} className="proc-line">
                <b>▸ {ev.tool}</b>
                <code>{JSON.stringify(ev.args).slice(0, 160)}</code>
              </div>
            ) : (
              <div key={i} className="proc-line res">
                <span>↳</span>
                <pre>{(typeof ev.result === 'string' ? ev.result
                  : JSON.stringify(ev.result)).slice(0, 400)}</pre>
              </div>
            )
          ))}
        </div>
      </details>
    )
  }
  if (m.kind === 'hitl_answer') {
    return (
      <div className="hitl-note">
        {m.confirmed ? '✅' : '🚫'} {t('hitl_title')}: {m.tools.map(x => x.name).join(', ')}
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
  if (m.kind === 'text' || m.kind === 'final') {
    return (
      <div className="chat-msg">
        <div className="cm-role">
          {t('final_answer')}
          {m.elapsed && <em> · {m.elapsed}s</em>}
          {m.usage && <em> · ↑{fmtTok(m.usage.input)} ↓{fmtTok(m.usage.output)}</em>}
        </div>
        <div className="chat-bubble"><Markdown text={m.text || '—'} /></div>
      </div>
    )
  }
  if (m.kind === 'error') {
    return <div className="ev-error">{t('error')}: {m.message}</div>
  }
  return null
}

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
