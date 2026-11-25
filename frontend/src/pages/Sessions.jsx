import { useEffect, useState } from 'react'
import { listSessions, getSession } from '../api'
import { useI18n } from '../i18n/index.jsx'

export default function Sessions() {
  const { t } = useI18n()
  const [sessions, setSessions] = useState([])
  const [cur, setCur] = useState(null)

  useEffect(() => { listSessions().then(r => setSessions(r.data.sessions)) }, [])

  const open = (sid) => getSession(sid).then(r => setCur(r.data))

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('sessions_title')}</h1>
      </div>
      <div className="split">
        <div className="list-col">
          {sessions.length === 0 && <div className="log-empty">{t('sessions_empty')}</div>}
          {sessions.map(s => (
            <button key={s.id}
              className={cur?.id === s.id ? 'list-item active' : 'list-item'}
              onClick={() => open(s.id)}>
              <div className="li-title">{s.title}</div>
              <div className="li-sub">
                {s.agent} · {s.workflow} · {new Date(s.updated_at * 1000).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        <div className="edit-col panel">
          {!cur && <div className="log-empty">{t('select_session')}</div>}
          {cur && <>
            <h2 className="panel-title">
              {cur.title} <span className="tag">{cur.workflow}</span>
            </h2>
            <pre className="code-view challenge-view">
              {JSON.stringify(cur.challenge, null, 2)}
            </pre>
            {cur.messages.filter(m => m.type === 'final').map((m, i) => (
              <div key={i} className="ev-final">
                {m.flag && <div className="flag-banner">{t('flag_label')}: {m.flag}</div>}
                <pre className="code-view">{m.content}</pre>
              </div>
            ))}
          </>}
        </div>
      </div>
    </div>
  )
}
