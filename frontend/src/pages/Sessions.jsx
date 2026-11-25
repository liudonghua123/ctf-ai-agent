import React, { useEffect, useState } from 'react'
import { listSessions, getSession } from '../api'

export default function Sessions() {
  const [sessions, setSessions] = useState([])
  const [cur, setCur] = useState(null)

  useEffect(() => { listSessions().then(r => setSessions(r.data.sessions)) }, [])

  const open = async (sid) => getSession(sid).then(r => setCur(r.data))

  return (
    <div className="page">
      <div className="page-head"><h2>历史会话</h2></div>
      <div className="split">
        <div className="list-col panel">
          {sessions.length === 0 && <div className="log-empty">暂无会话</div>}
          {sessions.map(s => (
            <div key={s.id} className={cur?.id === s.id ? 'list-item active' : 'list-item'}
              onClick={() => open(s.id)}>
              <div className="li-title">{s.title}</div>
              <div className="li-sub">{s.agent} · {s.workflow} · {new Date(s.updated_at * 1000).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="edit-col panel">
          {!cur && <div className="log-empty">← 选择会话查看</div>}
          {cur && <>
            <h3>{cur.title} <span className="tag">{cur.workflow}</span></h3>
            <pre className="code-view challenge-view">
              {JSON.stringify(cur.challenge, null, 2)}
            </pre>
            {cur.messages.filter(m => m.type === 'final').map((m, i) => (
              <div key={i} className="ev-final">
                {m.flag && <div className="flag-banner">🚩 {m.flag}</div>}
                <pre className="code-view">{m.content}</pre>
              </div>
            ))}
          </>}
        </div>
      </div>
    </div>
  )
}
