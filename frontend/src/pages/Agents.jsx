import { useEffect, useState } from 'react'
import { getAgents, getAgent, saveAgent } from '../api'
import { useI18n } from '../i18n/index.jsx'

const BLANK = {
  name: '', display_name: '', description: '', max_steps: 12,
  llm: {}, persona: '', tools: { builtin: [] },
  knowledge_bases: [], skills: [], mcp_servers: [],
}

const BUILTIN_TOOLS = ['python_exec', 'file_read', 'file_list', 'http_request', 'decode_helper']

export default function Agents() {
  const { t } = useI18n()
  const [agents, setAgents] = useState([])
  const [meta, setMeta] = useState({ available_skills: [], available_kbs: [], available_mcp: [] })
  const [current, setCurrent] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => getAgents().then(r => { setAgents(r.data.agents); setMeta(r.data) })
  useEffect(() => { load() }, [])

  const open = async (name) => {
    const full = await getAgent(name)
    setCurrent(name)
    setCfg({ ...BLANK, ...full.data })
    setMsg('')
  }

  const toggleIn = (list, item) =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item]

  const save = async () => {
    setSaving(true)
    try {
      const { name, ...rest } = cfg
      await saveAgent(current, rest)
      setMsg(t('saved')); load()
    } catch (e) {
      setMsg(`${t('error')}: ${e.response?.data?.detail || e.message}`)
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('agents_title')}</h1>
        <p className="page-hint">{t('agents_hint')}</p>
      </div>
      <div className="split">
        <div className="list-col">
          {agents.map(a => (
            <button key={a.name} className={current === a.name ? 'list-item active' : 'list-item'}
              onClick={() => open(a.name)}>
              <div className="li-title">{a.display_name || a.name}</div>
              <div className="li-sub">{a.description}</div>
            </button>
          ))}
        </div>
        <div className="edit-col panel">
          {!cfg && <div className="log-empty">{t('select_agent')}</div>}
          {cfg && <>
            <div className="two-col">
              <div className="field">
                <label htmlFor="ag-name">{t('display_name')}</label>
                <input id="ag-name" value={cfg.display_name}
                  onChange={e => setCfg({ ...cfg, display_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ag-steps">{t('max_steps')}</label>
                <input id="ag-steps" type="number" value={cfg.max_steps}
                  onChange={e => setCfg({ ...cfg, max_steps: +e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ag-desc">{t('description')}</label>
              <input id="ag-desc" value={cfg.description}
                onChange={e => setCfg({ ...cfg, description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ag-persona">{t('persona')}</label>
              <textarea id="ag-persona" rows={4} value={cfg.persona}
                onChange={e => setCfg({ ...cfg, persona: e.target.value })} />
            </div>
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
            <div className="field">
              <label>{t('llm_override')}</label>
              <div className="two-col">
                <input placeholder="model" value={cfg.llm?.model || ''}
                  onChange={e => setCfg({ ...cfg, llm: { ...cfg.llm, model: e.target.value } })} />
                <input placeholder="base_url" value={cfg.llm?.base_url || ''}
                  onChange={e => setCfg({ ...cfg, llm: { ...cfg.llm, base_url: e.target.value } })} />
              </div>
            </div>
            <div className="row-inline">
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {t('save')}
              </button>
              {msg && <span className="msg">{msg}</span>}
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}
