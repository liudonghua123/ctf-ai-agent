import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import {
  listSkills, deleteSkill, toggleSkill, saveSkill,
  skillFiles, skillReadFile, skillWriteFile, skillCreateFile, skillDeleteFile,
  skillUpload, hubSkills, hubInstall,
} from '../api'

const IcoPack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
)
const IcoDir = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
)
const IcoFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
)

export default function Skills() {
  const { t } = useI18n()
  const [skills, setSkills] = useState([])
  const [sel, setSel] = useState(null)       // selected skill name
  const [meta, setMeta] = useState(null)
  const [files, setFiles] = useState([])
  const [curFile, setCurFile] = useState(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [hub, setHub] = useState(null)
  const [showHub, setShowHub] = useState(false)
  const [toast, setToast] = useState('')
  const uploadRef = useRef(null)

  const load = async (keepSel) => {
    const { data } = await listSkills()
    setSkills(data.skills)
    if (keepSel && data.skills.find(s => s.name === keepSel || s._dir === keepSel)) {
      openSkill(keepSel, data.skills)
    } else if (sel && !data.skills.find(s => (s._dir || s.name) === sel)) {
      setSel(null); setMeta(null)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }

  const openSkill = async (name, list) => {
    setSel(name)
    const src = list || skills
    const m = src.find(s => (s._dir || s.name) === name)
    setMeta(m || null)
    setCurFile(null)
    try {
      const { data } = await skillFiles(name)
      setFiles(data.files)
    } catch { setFiles([]) }
  }

  const openFile = async (f) => {
    if (f.dir) return
    const { data } = await skillReadFile(sel, f.path)
    if (data.binary) { flash('binary file'); return }
    setCurFile(f.path); setContent(data.content); setDirty(false)
  }

  const saveFile = async () => {
    await skillWriteFile(sel, curFile, content)
    setDirty(false); flash(t('saved'))
  }

  const newFile = async (isDir) => {
    const name = window.prompt(isDir ? t('skill_new_dir') : t('skill_new_file'))
    if (!name) return
    try {
      await skillCreateFile(sel, name, '', isDir)
      await refreshFiles()
    } catch (e) { flash(e.response?.data?.detail || 'error') }
  }

  const delFile = async (path) => {
    if (!window.confirm(t('skill_confirm_del_file'))) return
    await skillDeleteFile(sel, path)
    if (curFile === path) setCurFile(null)
    await refreshFiles()
  }

  const refreshFiles = async () => {
    const { data } = await skillFiles(sel)
    setFiles(data.files)
  }

  const doUpload = async (e) => {
    const fs = [...e.target.files]
    for (const f of fs) {
      const buf = await f.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      await skillUpload(sel, f.name, b64)
    }
    flash(`${fs.length} ${t('upload_done')}`)
    await refreshFiles()
    e.target.value = ''
  }

  const toggle = async () => {
    const { data } = await toggleSkill(sel)
    setMeta(m => ({ ...m, enabled: data.enabled }))
    load(sel)
  }

  const saveMeta = async () => {
    const { name, description, inject_prompt } = meta
    await saveSkill(sel, { name, description, inject_prompt, enabled: meta.enabled !== false })
    flash(t('saved')); load(sel)
  }

  const delSkill = async () => {
    if (!window.confirm(t('skill_confirm_del'))) return
    await deleteSkill(sel)
    setSel(null); setMeta(null); await load()
  }

  const renameSkill = async () => {
    const nn = window.prompt(t('skill_rename'), sel)
    if (!nn || nn === sel) return
    const axios = (await import('axios')).default
    await axios.post(`/api/skills/${sel}/rename`, { new_name: nn })
    setSel(null); setMeta(null); await load()
  }

  const install = async (name) => {
    await hubInstall(name)
    flash(`${name} ${t('skill_installed')}`)
    await load(); setShowHub(false)
  }

  const openHub = async () => {
    setShowHub(true)
    setHub(null)
    try {
      const { data } = await hubSkills()
      setHub(data)
    } catch { setHub({ skills: [] }) }
  }

  const installedNames = () => new Set(skills.map(s => s.name))

  // build tree structure: group by dir
  const tree = []
  for (const f of files) {
    const parts = f.path.split('/')
    if (parts.length === 1) tree.push({ ...f, depth: 0 })
  }
  const dirs = [...new Set(files.filter(f => f.path.includes('/')).map(f => f.path.split('/').slice(0, -1).join('/')))]
  const rows = []
  for (const d of dirs.sort()) rows.push({ path: d, dir: true, depth: d.split('/').length - 1 })
  for (const f of files.filter(f => !f.dir && f.path.includes('/')))
    rows.push({ ...f, depth: f.path.split('/').length - 1 })

  return (
    <div className="page">
      <div className="mgmt-head">
        <div>
          <h1>{t('skills_title')}</h1>
          <p className="hint">{t('skills_hint')}</p>
        </div>
        <button className="chip-btn" onClick={openHub}>⬇ {t('skill_hub')}</button>
      </div>

      <div className="card-grid">
        {skills.map((s, i) => {
          const name = s._dir || s.name
          const enabled = s.enabled !== false
          return (
            <div key={name} className={'card' + (enabled ? '' : ' disabled')}
              style={{ animationDelay: `${i * 60}ms`, cursor: 'default' }}
              role="button" tabIndex={0}
              onClick={() => openSkill(name)}
              onKeyDown={e => e.key === 'Enter' && openSkill(name)}>
              {!enabled && <span className="card-badge">{t('skill_disabled')}</span>}
              {enabled && <span className="card-badge on">{t('skill_enabled')}</span>}
              <span className="card-ico"><IcoPack /></span>
              <div className="card-title">{s.name}</div>
              <div className="card-desc">{s.description || ''}</div>
              <div className="card-meta">
                {s.tools ? <span>{s.tools.length} {t('tools_count')}</span> : null}
              </div>
            </div>
          )
        })}
        <button className="card card-add" onClick={() => {
          const name = window.prompt(t('new_skill'))
          if (!name) return
          saveSkill(name.replace(/[^A-Za-z0-9_-]+/g, '_'), { name, description: '', inject_prompt: '' })
            .then(() => load(name))
        }}>
          + {t('new_skill')}
        </button>
      </div>

      {meta && (
        <div className="detail-panel" style={{ marginTop: 'var(--s-6)' }}>
          <div className="panel-toolbar">
            <h2 style={{ flex: 1 }}>{meta.name}</h2>
            <button className={'switch' + (meta.enabled !== false ? ' on' : '')}
              onClick={toggle} title={meta.enabled !== false ? t('skill_disable') : t('skill_enable')} />
            <button className="chip-btn" onClick={renameSkill}>{t('skill_rename')}</button>
            <button className="chip-btn danger" onClick={delSkill}>{t('delete')}</button>
          </div>

          <div className="frm">
            <div className="frm-row">
              <div className="field">
                <label>{t('name')}</label>
                <input className="input" value={meta.name || ''}
                  onChange={e => setMeta({ ...meta, name: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" value={meta.description || ''}
                onChange={e => setMeta({ ...meta, description: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('injected_prompt')}</label>
              <textarea className="code-editor" style={{ minHeight: 110 }}
                value={meta.inject_prompt || ''}
                onChange={e => setMeta({ ...meta, inject_prompt: e.target.value })} />
            </div>
            <div><button className="chip-btn primary" onClick={saveMeta}>{t('save')}</button></div>
          </div>

          <div className="panel-toolbar" style={{ marginTop: 'var(--s-6)' }}>
            <b>{t('skill_files')}</b>
            <span style={{ flex: 1 }} />
            <button className="chip-btn" onClick={() => newFile(false)}>+ {t('skill_new_file')}</button>
            <button className="chip-btn" onClick={() => newFile(true)}>+ {t('skill_new_dir')}</button>
            <button className="chip-btn" onClick={() => uploadRef.current?.click()}>⬆ {t('skill_upload')}</button>
            <input ref={uploadRef} type="file" multiple hidden onChange={doUpload} />
          </div>

          {rows.length === 0 && tree.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{t('skill_empty_tree')}</p>
          )}
          <div className="tree">
            {rows.map(f => (
              <div key={f.path} className={'tree-row' + (curFile === f.path ? ' active' : '')}
                style={{ paddingLeft: `calc(var(--s-3) + ${f.depth * 18}px)` }}
                onClick={() => openFile(f)} role="button" tabIndex={0}>
                <span className="tw-ico">{f.dir ? <IcoDir /> : <IcoFile />}</span>
                <span className="tw-name">{f.path.split('/').pop()}</span>
                <button className="tw-del" title={t('delete')}
                  onClick={e => { e.stopPropagation(); delFile(f.path) }}>×</button>
              </div>
            ))}
            {files.filter(f => !f.dir && !f.path.includes('/')).map(f => (
              <div key={f.path} className={'tree-row' + (curFile === f.path ? ' active' : '')}
                onClick={() => openFile(f)} role="button" tabIndex={0}>
                <span className="tw-ico"><IcoFile /></span>
                <span className="tw-name">{f.path}</span>
                <button className="tw-del" title={t('delete')}
                  onClick={e => { e.stopPropagation(); delFile(f.path) }}>×</button>
              </div>
            ))}
            {tree.filter(f => !f.path.includes('/')).map(f => (
              <div key={f.path} className={'tree-row'} onClick={() => openFile(f)}>
                <span className="tw-ico"><IcoFile /></span>
                <span className="tw-name">{f.path}</span>
                <button className="tw-del" onClick={e => { e.stopPropagation(); delFile(f.path) }}>×</button>
              </div>
            ))}
          </div>

          {curFile && (
            <div style={{ marginTop: 'var(--s-4)' }}>
              <div className="panel-toolbar" style={{ margin: '0 0 var(--s-3)' }}>
                <b style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{curFile}</b>
                <span style={{ flex: 1 }} />
                {dirty && <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 700 }}>●</span>}
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

      {showHub && (
        <div className="modal-backdrop" onClick={() => setShowHub(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('skill_hub')}</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 'var(--s-5)' }}>
              {t('skill_hub_hint')}</p>
            {(hub?.skills || []).map(s => {
              const installed = installedNames().has(s.name)
              return (
                <div key={s.name} className="hub-banner" style={{ marginBottom: 'var(--s-3)' }}>
                  <div style={{ flex: 1 }}>
                    <div className="hb-title">{s.name} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>v{s.version}</span></div>
                    <div className="hb-hint">{s.description}</div>
                  </div>
                  <button className={'chip-btn' + (installed ? '' : ' primary')}
                    disabled={installed} onClick={() => install(s.name)}>
                    {installed ? t('skill_installed') : t('skill_install')}
                  </button>
                </div>
              )
            })}
            {!hub && (
              <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{t('loading')}</p>
            )}
            {hub && (hub.skills || []).length === 0 && (
              <p style={{ color: 'var(--text-3)' }}>hub empty</p>
            )}
            <div className="modal-actions">
              <button className="chip-btn" onClick={() => setShowHub(false)}>{t('cancel')}</button>
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
