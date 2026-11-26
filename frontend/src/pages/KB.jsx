import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import {
  listKBs, kbRead, kbWrite, kbDelete, kbCreate, kbDeleteLib,
} from '../api'

const IcoLib = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
)
const IcoFile = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
)

export default function KB() {
  const { t } = useI18n()
  const [kbs, setKbs] = useState([])
  const [lib, setLib] = useState(null)      // selected library name
  const [file, setFile] = useState(null)    // selected doc name
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [toast, setToast] = useState('')

  const load = async () => {
    const { data } = await listKBs()
    setKbs(data.kbs)
    if (lib && !data.kbs.find(k => k.name === lib)) { setLib(null); setFile(null) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }

  const openFile = async (doc) => {
    const { data } = await kbRead(lib, doc)
    setFile(doc); setContent(data.content); setDirty(false)
  }

  const saveFile = async () => {
    await kbWrite(lib, file, content)
    setDirty(false); flash(t('saved'))
  }

  const delFile = async () => {
    if (!window.confirm(t('kb_confirm_del_file'))) return
    await kbDelete(lib, file)
    setFile(null); await load()
  }

  const createLib = async () => {
    if (!newName.trim()) return
    await kbCreate(newName.trim())
    setShowNew(false); setNewName(''); await load()
    setLib(newName.trim())
  }

  const newFile = async () => {
    const name = window.prompt(t('kb_new_file'))
    if (!name) return
    const safe = name.replace(/[^\w\u4e00-\u9fff.-]+/g, '_') + (name.endsWith('.md') ? '' : '.md')
    await kbWrite(lib, safe, '')
    await load(); openFile(safe)
  }

  const delLib = async () => {
    if (!window.confirm(t('kb_confirm_del_lib'))) return
    await kbDeleteLib(lib)
    setLib(null); setFile(null); await load()
  }

  const sel = kbs.find(k => k.name === lib)

  return (
    <div className="page">
      <div className="mgmt-head">
        <div>
          <h1>{t('kb_title')}</h1>
          <p className="hint">{t('kb_hint')}</p>
        </div>
      </div>

      {/* libraries grid */}
      <div className="card-grid">
        {kbs.map((k, i) => (
          <button key={k.name} className="card"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => { setLib(k.name); setFile(null) }}>
            <span className="card-ico"><IcoLib /></span>
            <div className="card-title">{k.name}</div>
            <div className="card-meta">
              <span>{k.docs.length} {t('docs_count')}</span>
            </div>
          </button>
        ))}
        <button className="card card-add" onClick={() => setShowNew(true)}>
          + {t('new_kb')}
        </button>
      </div>

      {/* library detail */}
      {sel && (
        <div className="detail-panel" style={{ marginTop: 'var(--s-6)' }}>
          <div className="panel-toolbar">
            <h2 style={{ flex: 1 }}>{sel.name}</h2>
            <button className="chip-btn" onClick={newFile}>+ {t('kb_new_file')}</button>
            <button className="chip-btn danger" onClick={delLib}>{t('kb_delete_lib')}</button>
          </div>

          {sel.docs.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{t('kb_empty')}</p>
          )}

          <div className="tree">
            {sel.docs.map(d => (
              <button key={d}
                className={'tree-row' + (file === d ? ' active' : '')}
                onClick={() => openFile(d)}>
                <span className="tw-ico"><IcoFile /></span>
                <span className="tw-name">{d}</span>
              </button>
            ))}
          </div>

          {file && (
            <div style={{ marginTop: 'var(--s-5)' }}>
              <div className="panel-toolbar" style={{ margin: '0 0 var(--s-3)' }}>
                <b style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{file}</b>
                <span style={{ flex: 1 }} />
                {dirty && <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 700 }}>●</span>}
                <button className="chip-btn danger" onClick={delFile}>{t('delete')}</button>
                <button className="chip-btn primary" disabled={!dirty} onClick={saveFile}>
                  {t('kb_save_file')}
                </button>
              </div>
              <textarea className="code-editor" value={content}
                onChange={e => { setContent(e.target.value); setDirty(true) }} />
            </div>
          )}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('new_kb')}</h3>
            <div className="field">
              <label>{t('kb_name')}</label>
              <input className="input" value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('kb_name_ph')} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="chip-btn" onClick={() => setShowNew(false)}>{t('cancel')}</button>
              <button className="chip-btn primary" onClick={createLib}>{t('create')}</button>
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
