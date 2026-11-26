import { useEffect, useState } from 'react'
import { getAgents, getAgent, saveAgent } from '../api'
import { useI18n } from '../i18n/index.jsx'
import Modal from '../components/Modal.jsx'

const BLANK = {
  name: '', display_name: '', description: '', max_steps: 12,
  llm: {}, persona: '', tools: { builtin: [] },
  knowledge_bases: [], skills: [], mcp_servers: [],
}

const BUILTIN_TOOLS = ['python_exec', 'file_read', 'file_list', 'http_request', 'decode_helper', 'kb_search']

const IcoAgent = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M12 7V4"/><circle cx="12" cy="3" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M9 16h6"/></svg>
)

export default function Agents() {
  const { t } = useI18n()
  const [agents, setAgents] = useState([])
  const [meta, setMeta] = useState({ available_skills: [], available_kbs: [], available_mcp: [] })
  // editor state: null | { name, isNew }
  const [editing, setEditing] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => getAgents().then(r => { setAgents(r.data.agents); setMeta(r.data) })
  useEffect(() => { load() }, [])

  const open = async (name) => {
    const full = await getAgent(name)
    setEditing({ name, isNew: false })
    setCfg({ ...BLANK, ...full.data })
    setMsg('')
  }

  const toggleIn = (list, item) =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item]

  const save = async () => {
    setSaving(true)
    try {
      const name = editing.isNew
        ? cfg.name.replace(/[^A-Za-z0-9_-]+/g, '_')
        : editing.name
      const { name: _n, ...rest } = cfg
      await saveAgent(name, rest)
      setMsg(t('saved')); load()
      setEditing({ name, isNew: false })
      setTimeout(() => setEditing(null), 600)
    } catch (e) {
      setMsg(`${t('error')}: ${e.response?.data?.detail || e.message}`)
    }
    setSaving(false)
  }

  const newAgent = () => {
    setCfg({ ...BLANK, display_name: '' })
    setEditing({ name: '', isNew: true })
    setMsg('')
  }

  return (
    <div className="page">
      <div className="mgmt-head">
        <div>
          <h1>{t('agents_title')}</h1>
          <p className="hint">{t('agents_hint')}</p>
        </div>
        <button className="chip-btn" onClick={newAgent}>+ {t('create')}</button>
      </div>

      <div className="card-grid">
        {agents.map((a, i) => (
          <button key={a.name}
            className="card"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => open(a.name)}>
            <span className="card-ico"><IcoAgent /></span>
            <div className="card-title">{a.display_name || a.name}</div>
            <div className="card-desc">{a.description}</div>
            <div className="card-meta">
              <span>{a.name}</span>
              <span>{a.max_steps || 12} steps</span>
            </div>
          </button>
        ))}
      </div>

      {editing && cfg && (
        <Modal
          title={(editing.isNew ? t('create') + ' · ' : '') + (cfg.display_name || editing.name || t('agents_title'))}
          wide
          onClose={() => setEditing(null)}
          footer={<>
            {msg && <span style={{ flex: 1, color: 'var(--text-2)', fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>{msg}</span>}
            <button className="chip-btn" onClick={() => setEditing(null)}>{t('cancel')}</button>
            <button className="chip-btn primary" onClick={save} disabled={saving}>{t('save')}</button>
          </>}>
          <div className="frm">
            <div className="frm-row">
              <div className="field">
                <label htmlFor="ag-id">{t('name')} (id)</label>
                <input id="ag-id" className="input" value={cfg.name} disabled={!editing.isNew}
                  onChange={e => setCfg({ ...cfg, name: e.target.value })}
                  placeholder="my_agent" />
              </div>
              <div className="field">
                <label htmlFor="ag-name">{t('display_name')}</label>
                <input id="ag-name" className="input" value={cfg.display_name}
                  onChange={e => setCfg({ ...cfg, display_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ag-steps">{t('max_steps')}</label>
                <input id="ag-steps" className="input" type="number" value={cfg.max_steps}
                  onChange={e => setCfg({ ...cfg, max_steps: +e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ag-desc">{t('description')}</label>
              <input id="ag-desc" className="input" value={cfg.description}
                onChange={e => setCfg({ ...cfg, description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ag-persona">{t('persona')}</label>
              <textarea id="ag-persona" className="code-editor" style={{ minHeight: 160 }}
                value={cfg.persona}
                onChange={e => setCfg({ ...cfg, persona: e.target.value })} />
            </div>
            <div className="frm-row">
              <div className="field">
                <label>{t('builtin_tools')}</label>
                <div className="chips">
                  {BUILTIN_TOOLS.map(tool => (
                    <button key={tool}
                      className={cfg.tools?.builtin?.includes(tool) ? 'chip on' : 'chip'}
                      onClick={() => setCfg({
                        ...cfg,
                        tools: { ...cfg.tools, builtin: toggleIn(cfg.tools?.builtin || [], tool) },
                      })}>{tool}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>{t('knowledge_bases')}</label>
                <div className="chips">
                  {meta.available_kbs.length === 0 && <span className="hint-text">{t('no_kbs')}</span>}
                  {meta.available_kbs.map(k => (
                    <button key={k} className={cfg.knowledge_bases?.includes(k) ? 'chip on' : 'chip'}
                      onClick={() => setCfg({
                        ...cfg, knowledge_bases: toggleIn(cfg.knowledge_bases || [], k),
                      })}>{k}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="frm-row">
              <div className="field">
                <label>{t('skills')}</label>
                <div className="chips">
                  {meta.available_skills.map(s => (
                    <button key={s} className={cfg.skills?.includes(s) ? 'chip on' : 'chip'}
                      onClick={() => setCfg({ ...cfg, skills: toggleIn(cfg.skills || [], s) })}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>{t('mcp_servers')}</label>
                <div className="chips">
                  {meta.available_mcp.length === 0 && <span className="hint-text">{t('no_mcp')}</span>}
                  {meta.available_mcp.map(s => (
                    <button key={s} className={cfg.mcp_servers?.includes(s) ? 'chip on' : 'chip'}
                      onClick={() => setCfg({ ...cfg, mcp_servers: toggleIn(cfg.mcp_servers || [], s) })}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label>{t('llm_override')}</label>
              <div className="frm-row">
                <input className="input" placeholder="model" value={cfg.llm?.model || ''}
                  onChange={e => setCfg({ ...cfg, llm: { ...cfg.llm, model: e.target.value } })} />
                <input className="input" placeholder="base_url" value={cfg.llm?.base_url || ''}
                  onChange={e => setCfg({ ...cfg, llm: { ...cfg.llm, base_url: e.target.value } })} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
