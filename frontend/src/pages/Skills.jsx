import React, { useEffect, useState } from 'react'
import { listSkills, deleteSkill } from '../api'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [sel, setSel] = useState(null)

  const load = () => listSkills().then(r => setSkills(r.data.skills))
  useEffect(load, [])

  return (
    <div className="page">
      <div className="page-head"><h2>Skills 技能包</h2>
        <span className="hint-text">目录位于 backend/data/skills/&lt;name&gt;/skill.yaml，含提示注入与自定义工具</span></div>
      <div className="split">
        <div className="list-col panel">
          {skills.map(s => (
            <div key={s.name} className={sel?.name === s.name ? 'list-item active' : 'list-item'}
              onClick={() => setSel(s)}>
              <div className="li-title">🧩 {s.name}</div>
              <div className="li-sub">{s.description}</div>
              <div className="li-meta">
                {s.inject_prompt ? '提示注入 ✓' : ''} · 工具 {s.tools?.length || 0} 个
              </div>
            </div>
          ))}
        </div>
        <div className="edit-col panel">
          {!sel && <div className="log-empty">← 选择 skill 查看详情</div>}
          {sel && <>
            <h3>{sel.name}</h3>
            <p>{sel.description}</p>
            {sel.inject_prompt && <>
              <label>注入的系统提示</label>
              <pre className="code-view">{sel.inject_prompt}</pre>
            </>}
            {sel.tools?.length > 0 && <>
              <label>提供工具</label>
              <pre className="code-view">{JSON.stringify(sel.tools, null, 2)}</pre>
            </>}
            <button className="btn-danger" onClick={() => {
              if (confirm(`删除 skill ${sel.name}？`)) deleteSkill(sel.name).then(() => { setSel(null); load() })
            }}>删除</button>
          </>}
        </div>
      </div>
    </div>
  )
}
