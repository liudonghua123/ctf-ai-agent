import React, { useEffect, useState } from 'react'
import { listKBs, kbAdd, kbRead, kbDelete } from '../api'

export default function KB() {
  const [kbs, setKbs] = useState([])
  const [cur, setCur] = useState(null) // {name, docs}
  const [form, setForm] = useState({ kb: '', title: '', content: '' })
  const [viewing, setViewing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = () => listKBs().then(r => setKbs(r.data.kbs))
  useEffect(load, [])

  const add = async () => {
    if (!form.kb || !form.title || !form.content) { setMsg('kb / 标题 / 内容 必填'); return }
    await kbAdd(form)
    setMsg('已添加 ✓'); setForm({ kb: '', title: '', content: '' }); load()
  }

  const view = async (kbName, doc) => {
    const r = await kbRead(kbName, doc)
    setViewing({ kb: kbName, doc, content: r.data.content })
  }

  return (
    <div className="page">
      <div className="page-head"><h2>知识库</h2>
        <span className="hint-text">自动分块 + 向量检索，Agent 通过 kb_search 工具查询</span></div>
      <div className="split">
        <div className="list-col panel">
          {kbs.length === 0 && <div className="log-empty">暂无知识库，右侧创建</div>}
          {kbs.map(k => (
            <div key={k.name} className={cur?.name === k.name ? 'list-item active' : 'list-item'}
              onClick={() => setCur(k)}>
              <div className="li-title">📚 {k.name}</div>
              <div className="li-sub">{k.docs.length} 篇文档</div>
              {cur?.name === k.name && k.docs.map(d => (
                <div key={d} className="doc-row" onClick={e => { e.stopPropagation(); view(k.name, d) }}>
                  <span>{d}</span>
                  <button className="mini-del" onClick={e => {
                    e.stopPropagation(); kbDelete(k.name, d).then(load)
                  }}>删</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="edit-col panel">
          <div className="row two-col">
            <div><label>知识库名</label>
              <input value={form.kb} onChange={e => setForm({ ...form, kb: e.target.value })}
                placeholder="例如 writeups" /></div>
            <div><label>文档标题</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="例如：RSA低指数攻击" /></div>
          </div>
          <div className="row"><label>内容（Markdown）</label>
            <textarea rows={12} value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })} /></div>
          <button className="btn-primary" onClick={add}>添加文档</button>
          {msg && <span className="msg">{msg}</span>}
          {viewing && <div className="doc-view"><h3>{viewing.doc}</h3><pre>{viewing.content}</pre></div>}
        </div>
      </div>
    </div>
  )
}
