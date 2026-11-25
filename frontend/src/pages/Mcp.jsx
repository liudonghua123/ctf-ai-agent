import { useEffect, useState } from 'react'
import { getMcp, saveMcp, mcpTools } from '../api'
import { useI18n } from '../i18n/index.jsx'

export default function Mcp() {
  const { t } = useI18n()
  const [cfg, setCfg] = useState({ mcpServers: {} })
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [tools, setTools] = useState({})

  useEffect(() => {
    getMcp().then(r => { setCfg(r.data); setText(JSON.stringify(r.data, null, 2)) })
  }, [])

  const save = async () => {
    try {
      const parsed = JSON.parse(text)
      await saveMcp(parsed)
      setCfg(parsed); setMsg(t('saved'))
    } catch (e) { setMsg(t('json_error') + e.message) }
  }

  const checkTools = async (name) => {
    try {
      const r = await mcpTools(name)
      setTools(s => ({ ...s, [name]: r.data.tools.map(x => x.name).join(', ') }))
    } catch (e) {
      setTools(s => ({
        ...s, [name]: `${t('error')}: ${e.response?.data?.detail || e.message}`,
      }))
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('mcp_title')}</h1>
        <p className="page-hint">{t('mcp_hint')}</p>
      </div>
      <div className="panel page-panel">
        <textarea className="json-editor" rows={14} value={text}
          onChange={e => setText(e.target.value)} spellCheck={false}
          aria-label={t('mcp_title')} />
        <div className="row-inline">
          <button className="btn btn-primary" onClick={save}>{t('save_config')}</button>
          {Object.keys(cfg.mcpServers || {}).map(name => (
            <button key={name} className="chip" onClick={() => checkTools(name)}>
              {t('test')} {name}
            </button>
          ))}
          {msg && <span className="msg">{msg}</span>}
        </div>
        {Object.entries(tools).map(([k, v]) => (
          <div key={k} className="tool-line">{k}: {v}</div>
        ))}
        <div className="example-box">
          <label>{t('config_example')}</label>
          <pre className="code-view">{`{
  "mcpServers": {
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] },
    "remote": { "url": "https://example.com/mcp" }
  }
}`}</pre>
        </div>
      </div>
    </div>
  )
}
