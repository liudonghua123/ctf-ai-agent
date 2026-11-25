import { useEffect, useState } from 'react'
import { listSkills, deleteSkill } from '../api'
import { useI18n } from '../i18n/index.jsx'

export default function Skills() {
  const { t } = useI18n()
  const [skills, setSkills] = useState([])
  const [sel, setSel] = useState(null)

  const load = () => listSkills().then(r => setSkills(r.data.skills))
  useEffect(load, [])

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('skills_title')}</h1>
        <p className="page-hint">{t('skills_hint')}</p>
      </div>
      <div className="split">
        <div className="list-col">
          {skills.map(s => (
            <button key={s.name}
              className={sel?.name === s.name ? 'list-item active' : 'list-item'}
              onClick={() => setSel(s)}>
              <div className="li-title">{s.name}</div>
              <div className="li-sub">{s.description}</div>
              <div className="li-meta">
                {s.inject_prompt ? 'prompt ✓ · ' : ''}
                {s.tools?.length || 0} {t('tools_count')}
              </div>
            </button>
          ))}
        </div>
        <div className="edit-col panel">
          {!sel && <div className="log-empty">{t('select_skill')}</div>}
          {sel && <>
            <h2 className="panel-title">{sel.name}</h2>
            <p className="hint-text">{sel.description}</p>
            {sel.inject_prompt && <>
              <label>{t('injected_prompt')}</label>
              <pre className="code-view">{sel.inject_prompt}</pre>
            </>}
            {sel.tools?.length > 0 && <>
              <label>{t('provided_tools')}</label>
              <pre className="code-view">{JSON.stringify(sel.tools, null, 2)}</pre>
            </>}
            <button className="btn btn-danger" onClick={() => {
              if (confirm(`${t('delete')} ${sel.name}?`)) {
                deleteSkill(sel.name).then(() => { setSel(null); load() })
              }
            }}>{t('delete')}</button>
          </>}
        </div>
      </div>
    </div>
  )
}
