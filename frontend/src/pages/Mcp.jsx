import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { getMcp, saveMcpServer, deleteMcp, toggleMcp, mcpTools } from '../api'

const IcoSrv = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
)

const emptyForm = { name: '', type: 'stdio', command: '', argsText: '', url: '' }

export default function Mcp() {
  const { t } = useI18n()
  const [servers, setServers] = useState([])
  const [tools, setTools] = useState({})   // name -> [tool...]
  const [toolErr, setToolErr] = useState({})
  const [edit, setEdit] = useState(null)   // null | form (modal)
  const [editingName, setEditingName] = useState(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    const { data } = await getMcp()
    setServers(data.servers || [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }

  const openEdit = (s) => {
    if (s) {
      setEditingName(s.name)
      setEdit({
        name: s.name, type: s.type,
        command: s.command || '', url: s.url || '',
        argsText: (s.args || []).join('\n'),
      })
    } else {
      setEditingName(null)
      setEdit({ ...emptyForm })
    }
  }

  const saveServer = async () => {
    const f = edit
    if (!f.name.trim()) return
    await saveMcpServer({
      name: f.name.trim(), type: f.type,
      url: f.type === 'http' ? f.url : null,
      command: f.type === 'stdio' ? f.command : null,
      args: f.argsText.split('\n').map(x => x.trim()).filter(Boolean),
    })
    setEdit(null); await load(); flash(t('saved'))
  }

  const del = async (name) => {
    if (!window.confirm(t('mcp_confirm_del'))) return
    await deleteMcp(name)
    await load()
  }

  const toggle = async (name) => {
    await toggleMcp(name)
    await load()
  }

  const listTools = async (name) => {
    setToolErr(e => ({ ...e, [name]: null }))
    try {
      const { data } = await mcpTools(name)
      setTools(tt => ({ ...tt, [name]: data.tools }))
    } catch (e) {
      setTools(tt => ({ ...tt, [name]: [] }))
      setToolErr(te => ({ ...te, [name]: e.response?.data?.detail || String(e) }))
    }
  }

  return (
    <div className="page">
      <div className="mgmt-head">
        <div>
          <h1>{t('mcp_title')}</h1>
          <p className="hint">{t('mcp_hint')}</p>
        </div>
        <button className="chip-btn primary" onClick={() => openEdit(null)}>
          + {t('new_mcp')}
        </button>
      </div>

      {servers.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 15 }}>{t('mcp_no_servers')}</p>
      )}

      <div className="card-grid">
        {servers.map((s, i) => (
          <div key={s.name} className={'card' + (s.enabled ? '' : ' disabled')}
            style={{ animationDelay: `${i * 60}ms`, cursor: 'default' }}>
            {!s.enabled && <span className="card-badge">{t('mcp_disabled')}</span>}
            {s.enabled && <span className="card-badge on">{t('mcp_enabled')}</span>}
            <span className="card-ico"><IcoSrv /></span>
            <div className="card-title">{s.name}</div>
            <div className="card-meta">
              <span>{s.type === 'http' ? 'HTTP' : 'stdio'}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11.5,
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170,
                whiteSpace: 'nowrap',
              }}>{s.type === 'http' ? s.url : `${s.command} ${(s.args || []).join(' ')}`}</span>
            </div>
            <div className="card-actions">
              <button className="chip-btn" onClick={() => openEdit(s)}>{t('mcp_edit')}</button>
              <button className="chip-btn" onClick={() => listTools(s.name)}>
                {t('mcp_list_tools')}
              </button>
              <button className="chip-btn" onClick={() => toggle(s.name)}>
                {s.enabled ? t('mcp_toggle_on') : t('mcp_toggle_off')}
              </button>
              <button className="chip-btn danger" onClick={() => del(s.name)}>{t('delete')}</button>
            </div>
            {toolErr[s.name] && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 'var(--s-3)' }}>
                {toolErr[s.name]}
              </p>
            )}
            {tools[s.name]?.length > 0 && (
              <div className="mini-tools">
                {tools[s.name].map(tl => (
                  <div key={tl.name} className="mini-tool">
                    <b>{tl.name}</b>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', opacity: 0.8,
                    }}>{tl.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {edit && (
        <div className="modal-backdrop" onClick={() => setEdit(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingName ? `${t('mcp_edit')}: ${editingName}` : t('new_mcp')}</h3>
            <div className="frm">
              <div className="field">
                <label>{t('name')}</label>
                <input className="input" value={edit.name}
                  disabled={!!editingName}
                  onChange={e => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Type</label>
                <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                  <button className={'chip-btn' + (edit.type === 'stdio' ? ' primary' : '')}
                    onClick={() => setEdit({ ...edit, type: 'stdio' })}>
                    {t('mcp_type_stdio')}
                  </button>
                  <button className={'chip-btn' + (edit.type === 'http' ? ' primary' : '')}
                    onClick={() => setEdit({ ...edit, type: 'http' })}>
                    {t('mcp_type_http')}
                  </button>
                </div>
              </div>
              {edit.type === 'http' ? (
                <div className="field">
                  <label>{t('mcp_url')}</label>
                  <input className="input" value={edit.url} placeholder="https://example.com/mcp"
                    onChange={e => setEdit({ ...edit, url: e.target.value })} />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>{t('mcp_command')}</label>
                    <input className="input" value={edit.command} placeholder="python / npx / uvx ..."
                      onChange={e => setEdit({ ...edit, command: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>{t('mcp_args')}</label>
                    <textarea className="code-editor" style={{ minHeight: 72 }}
                      value={edit.argsText}
                      placeholder={'-m\nmcp_server_fetch'}
                      onChange={e => setEdit({ ...edit, argsText: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="chip-btn" onClick={() => setEdit(null)}>{t('cancel')}</button>
              <button className="chip-btn primary" onClick={saveServer}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: 'var(--accent-contrast)',
          padding: '8px 20px', borderRadius: 999, fontWeight: 700, fontSize: 13,
          zIndex: 80,
        }}>{toast}</div>
      )}
    </div>
  )
}
