import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useI18n } from '../i18n'
import Modal from '../components/Modal'
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

const LANG_BY_EXT = {
  py: 'python', js: 'javascript', ts: 'typescript', json: 'json',
  yaml: 'yaml', yml: 'yaml', md: 'markdown', sh: 'shell', txt: 'plaintext',
}

const langOf = (path) => LANG_BY_EXT[path.split('.').pop()] || 'plaintext'

export default function Skills() {
  const { t } = useI18n()
  const [skills, setSkills] = useState([])
  const [sel, setSel] = useState(null)
  const [meta, setMeta] = useState(null)
  const [files, setFiles] = useState([])
  const [curFile, setCurFile] = useState(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [editMeta, setEditMeta] = useState(null)   // modal: null | meta copy
  const [newMeta, setNewMeta] = useState(null)     // modal: create new skill
  const [newEntry, setNewEntry] = useState(null)   // modal: { isDir, name }
  const [renameTo, setRenameTo] = useState(null)   // modal: new skill name
  const [showHub, setShowHub] = useState(false)
  const [hub, setHub] = useState(null)
  const [toast, setToast] = useState('')
  const uploadRef = useRef(null)
  const metaSavedRef = useRef(false)

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }

  const load = async (keepSel) => {
    const { data } = await listSkills()
    setSkills(data.skills)
    if (keepSel && data.skills.find(s => (s._dir || s.name) === keepSel)) {
      openSkill(keepSel, data.skills)
    } else if (sel && !data.skills.find(s => (s._dir || s.name) === sel)) {
      setSel(null); setMeta(null); setCurFile(null)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const openSkill = async (name, list) => {
    setSel(name)
    const src = list || skills
    setMeta(src.find(s => (s._dir || s.name) === name) || null)
    setCurFile(null); setContent(''); setDirty(false)
    try {
      const { data } = await skillFiles(name)
      setFiles(data.files)
    } catch { setFiles([]) }
  }

  const refreshFiles = async () => {
    const { data } = await skillFiles(sel)
    setFiles(data.files)
  }

  const openFile = async (f) => {
    if (f.dir) return
    if (dirty && !window.confirm(t('kb_confirm_del_file').replace('?','?'))) {
      // unsaved changes: ask to discard
      if (!window.confirm('Discard unsaved changes?')) return
    }
    const { data } = await skillReadFile(sel, f.path)
    if (data.binary) { flash('binary file'); return }
    setCurFile(f.path); setContent(data.content); setDirty(false)
  }

  const saveFile = async () => {
    await skillWriteFile(sel, curFile, content)
    setDirty(false); flash(t('saved'))
  }

  const newFile = async (isDir) => {
    setNewEntry({ isDir, name: '' })
  }

  const createEntry = async () => {
    try {
      await skillCreateFile(sel, newEntry.name, '', newEntry.isDir)
      setNewEntry(null)
      await refreshFiles()
    } catch (e) { flash(e.response?.data?.detail || 'error') }
  }

  const delFile = async (path, e) => {
    e?.stopPropagation()
    if (!window.confirm(t('skill_confirm_del_file'))) return
    await skillDeleteFile(sel, path)
    if (curFile === path) { setCurFile(null); setContent(''); setDirty(false) }
    await refreshFiles()
  }

  const doUpload = async (e) => {
    const fs = [...e.target.files]
    for (const f of fs) {
      const buf = await f.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      await skillUpload(sel, f.name, btoa(binary))
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
    await saveSkill(sel, {
      name: editMeta.name, description: editMeta.description,
      inject_prompt: editMeta.inject_prompt,
      enabled: meta.enabled !== false,
    })
    setEditMeta(null); flash(t('saved')); load(sel)
  }

  const delSkill = async () => {
    if (!window.confirm(t('skill_confirm_del'))) return
    await deleteSkill(sel)
    setSel(null); setMeta(null); setCurFile(null); await load()
  }

  const createSkill = async () => {
    const id = newMeta.name.replace(/[^A-Za-z0-9_-]+/g, '_')
    try {
      await saveSkill(id, {
        name: newMeta.display_name?.trim() || newMeta.name.trim(),
        description: newMeta.description || '',
        inject_prompt: newMeta.inject_prompt || '',
      })
      setNewMeta(null)
      flash(t('saved'))
      await load(id)
    } catch (e) {
      flash(`${t('error')}: ${e.response?.data?.detail || e.message}`)
    }
  }

  const renameSkill = async () => {
    setRenameTo(sel)
  }

  const doRename = async () => {
    const nn = renameTo?.trim()
    if (!nn || nn === sel) { setRenameTo(null); return }
    const axios = (await import('axios')).default
    await axios.post(`/api/skills/${sel}/rename`, { new_name: nn })
    setRenameTo(null)
    setSel(null); setMeta(null); await load()
  }

  const install = async (name) => {
    await hubInstall(name)
    flash(`${name} ${t('skill_installed')}`)
    setShowHub(false)
    await load(name)
  }

  const openHub = async () => {
    setShowHub(true); setHub(null)
    try {
      const { data } = await hubSkills()
      setHub(data)
    } catch { setHub({ skills: [] }) }
  }

  const installedNames = () => new Set(skills.map(s => s.name))

  // build tree rows: dirs first then files, depth by slash count
  const dirs = [...new Set(files.filter(f => f.path.includes('/'))
    .map(f => f.path.split('/').slice(0, -1).join('/')))].sort()
  const topFiles = files.filter(f => !f.dir && !f.path.includes('/'))
  const nestedFiles = files.filter(f => !f.dir && f.path.includes('/'))
  const rows = [
    ...dirs.map(d => ({ path: d, dir: true, depth: d.split('/').length - 1 })),
    ...nestedFiles.map(f => ({ ...f, depth: f.path.split('/').length - 1 })),
    ...topFiles.map(f => ({ ...f, depth: 0 })),
  ]

  return (
    <div className="page">
      <div className="mgmt-head">
        <div>
          <h1>{t('skills_title')}</h1>
          <p className="hint">{t('skills_hint')}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <button className="chip-btn" onClick={openHub}>⬇ {t('skill_hub')}</button>
          <button className="chip-btn primary" onClick={() => {
            setNewMeta({ name: '', display_name: '', description: '', inject_prompt: '' })
          }}>+ {t('new_skill')}</button>
        </div>
      </div>

      {/* skill selector cards */}
      <div className="card-grid" style={{ marginBottom: 'var(--s-5)' }}>
        {skills.map((s, i) => {
          const name = s._dir || s.name
          const enabled = s.enabled !== false
          return (
            <div key={name} className={'card' + (enabled ? '' : ' disabled') + (sel === name ? ' sel' : '')}
              style={{ animationDelay: `${i * 60}ms` }}
              role="button" tabIndex={0}
              onClick={() => openSkill(name)}
              onKeyDown={e => e.key === 'Enter' && openSkill(name)}>
              {!enabled && <span className="card-badge">{t('skill_disabled')}</span>}
              {enabled && <span className="card-badge on">{t('skill_enabled')}</span>}
              <span className="card-ico"><IcoPack /></span>
              <div className="card-title">{s.name}</div>
              <div className="card-desc">{s.description || ''}</div>
            </div>
          )
        })}
      </div>

      {/* two-pane workspace */}
      {meta && (
        <div className="skill-workspace">
          <div className="skill-pane">
            <div className="skill-pane-head">
              <b>{meta.name}</b>
              <span style={{ flex: 1 }} />
              <button className={'switch' + (meta.enabled !== false ? ' on' : '')}
                onClick={toggle}
                title={meta.enabled !== false ? t('skill_disable') : t('skill_enable')} />
              <button className="chip-btn" onClick={() => setEditMeta({ ...meta })}>
                {t('mcp_edit')}
              </button>
              <button className="chip-btn" onClick={renameSkill}>{t('skill_rename')}</button>
              <button className="chip-btn danger" onClick={delSkill}>{t('delete')}</button>
            </div>
            <div className="skill-pane-head" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="chip-btn" onClick={() => newFile(false)}>+ {t('skill_new_file')}</button>
              <button className="chip-btn" onClick={() => newFile(true)}>+ {t('skill_new_dir')}</button>
              <button className="chip-btn" onClick={() => uploadRef.current?.click()}>⬆ {t('skill_upload')}</button>
              <input ref={uploadRef} type="file" multiple hidden onChange={doUpload} />
            </div>
            <div className="skill-tree-scroll">
              <div className="tree">
                {rows.length === 0 && (
                  <p style={{ color: 'var(--text-3)', fontSize: 13, padding: 'var(--s-3)' }}>
                    {t('skill_empty_tree')}</p>
                )}
                {rows.map(f => (
                  <div key={f.path}
                    className={'tree-row' + (curFile === f.path ? ' active' : '')}
                    style={{ paddingLeft: `calc(var(--s-3) + ${f.depth * 16}px)` }}
                    onClick={() => openFile(f)} role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && openFile(f)}>
                    <span className="tw-ico">{f.dir ? <IcoDir /> : <IcoFile />}</span>
                    <span className="tw-name">{f.path.split('/').pop()}</span>
                    <button className="tw-del" title={t('delete')}
                      onClick={e => delFile(f.path, e)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="skill-pane skill-editor-pane">
            {curFile ? (
              <>
                <div className="monaco-host">
                  <Editor
                    height="100%"
                    language={langOf(curFile)}
                    theme={document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark'}
                    value={content}
                    onChange={v => { setContent(v ?? ''); setDirty(true) }}
                    options={{
                      fontSize: 13, fontFamily: 'Geist Mono, monospace',
                      minimap: { enabled: false }, scrollBeyondLastLine: false,
                      automaticLayout: true, tabSize: 2, wordWrap: 'on',
                    }}
                  />
                </div>
                <div className="skill-editor-bar">
                  <span className="fname">{curFile}</span>
                  {dirty && <span className="dirty-dot">● {t('unsaved')}</span>}
                  <button className="chip-btn primary" disabled={!dirty} onClick={saveFile}>
                    {t('kb_save_file')}
                  </button>
                </div>
              </>
            ) : (
              <div className="chat-empty">{t('kb_no_file')}</div>
            )}
          </div>
        </div>
      )}

      {/* new file/dir modal */}
      {newEntry && (
        <Modal title={newEntry.isDir ? t('skill_new_dir') : t('skill_new_file')}
          onClose={() => setNewEntry(null)}
          footer={<>
            <button className="chip-btn" onClick={() => setNewEntry(null)}>{t('cancel')}</button>
            <button className="chip-btn primary" onClick={createEntry}
              disabled={!newEntry.name.trim()}>{t('create')}</button>
          </>}>
          <div className="field">
            <label>{t('name')}</label>
            <input className="input" value={newEntry.name} autoFocus
              onKeyDown={e => e.key === 'Enter' && createEntry()}
              onChange={e => setNewEntry({ ...newEntry, name: e.target.value })}
              placeholder={newEntry.isDir ? 'scripts/' : 'handler.py'} />
          </div>
        </Modal>
      )}

      {/* rename modal */}
      {renameTo !== null && (
        <Modal title={t('skill_rename')} onClose={() => setRenameTo(null)}
          footer={<>
            <button className="chip-btn" onClick={() => setRenameTo(null)}>{t('cancel')}</button>
            <button className="chip-btn primary" onClick={doRename}
              disabled={!renameTo.trim() || renameTo.trim() === sel}>{t('confirm')}</button>
          </>}>
          <div className="field">
            <label>{t('name')}</label>
            <input className="input" value={renameTo} autoFocus
              onKeyDown={e => e.key === 'Enter' && doRename()}
              onChange={e => setRenameTo(e.target.value)} />
          </div>
        </Modal>
      )}

      {/* meta edit modal (maximizable) */}
      {editMeta && (
        <Modal title={`${t('mcp_edit')}: ${sel}`} onClose={() => setEditMeta(null)} wide
          footer={<>
            <button className="chip-btn" onClick={() => setEditMeta(null)}>{t('cancel')}</button>
            <button className="chip-btn primary" onClick={saveMeta}>{t('save')}</button>
          </>}>
          <div className="frm">
            <div className="frm-row">
              <div className="field">
                <label>{t('name')}</label>
                <input className="input" value={editMeta.name || ''}
                  onChange={e => setEditMeta({ ...editMeta, name: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" value={editMeta.description || ''}
                onChange={e => setEditMeta({ ...editMeta, description: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('injected_prompt')}</label>
              <textarea className="code-editor" style={{ minHeight: 180 }}
                value={editMeta.inject_prompt || ''}
                onChange={e => setEditMeta({ ...editMeta, inject_prompt: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {/* new skill modal (maximizable) */}
      {newMeta && (
        <Modal title={t('new_skill')} onClose={() => setNewMeta(null)} wide
          footer={<>
            <button className="chip-btn" onClick={() => setNewMeta(null)}>{t('cancel')}</button>
            <button className="chip-btn primary" onClick={createSkill} disabled={!newMeta.name.trim()}>
              {t('create')}
            </button>
          </>}>
          <div className="frm">
            <div className="frm-row">
              <div className="field">
                <label>{t('name')} (id)</label>
                <input className="input" value={newMeta.name} autoFocus
                  placeholder="my_skill"
                  onChange={e => setNewMeta({ ...newMeta, name: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('display_name')}</label>
                <input className="input" value={newMeta.display_name || ''}
                  onChange={e => setNewMeta({ ...newMeta, display_name: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" value={newMeta.description || ''}
                onChange={e => setNewMeta({ ...newMeta, description: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('injected_prompt')}</label>
              <textarea className="code-editor" style={{ minHeight: 140 }}
                value={newMeta.inject_prompt || ''}
                onChange={e => setNewMeta({ ...newMeta, inject_prompt: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {/* hub modal */}
      {showHub && (
        <Modal title={t('skill_hub')} onClose={() => setShowHub(false)} wide
          footer={<button className="chip-btn" onClick={() => setShowHub(false)}>{t('cancel')}</button>}>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 'var(--s-4)' }}>
            {t('skill_hub_hint')}</p>
          {!hub && <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{t('loading')}</p>}
          {(hub?.skills || []).map(s => {
            const installed = installedNames().has(s.name)
            return (
              <div key={s.name} className="hub-banner" style={{ marginBottom: 'var(--s-3)' }}>
                <div style={{ flex: 1 }}>
                  <div className="hb-title">{s.name}
                    <span style={{ color: 'var(--text-3)', fontWeight: 600 }}> v{s.version}</span>
                  </div>
                  <div className="hb-hint">{s.description}</div>
                </div>
                <button className={'chip-btn' + (installed ? '' : ' primary')}
                  disabled={installed} onClick={() => install(s.name)}>
                  {installed ? t('skill_installed') : t('skill_install')}
                </button>
              </div>
            )
          })}
          {hub && (hub.skills || []).length === 0 && (
            <p style={{ color: 'var(--text-3)' }}>hub empty</p>
          )}
        </Modal>
      )}

      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  )
}
