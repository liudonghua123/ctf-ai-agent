import { useEffect, useState } from 'react'
import { listKBs, kbAdd, kbRead, kbDelete } from '../api'
import { useI18n } from '../i18n/index.jsx'

export default function KB() {
  const { t } = useI18n()
  const [kbs, setKbs] = useState([])
  const [cur, setCur] = useState(null)
  const [form, setForm] = useState({ kb: '', title: '', content: '' })
  const [viewing, setViewing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = () => listKBs().then(r => setKbs(r.data.kbs))
  useEffect(load, [])

  const add = async () => {
    if (!form.kb || !form.title || !form.content) { setMsg(t('required')); return }
    await kbAdd(form)
    setMsg(t('saved')); setForm({ kb: '', title: '', content: '' }); load()
  }

  const view = async (kbName, doc) => {
    const r = await kbRead(kbName, doc)
    setViewing({ kb: kbName, doc, content: r.data.content })
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('kb_title')}</h1>
        <p className="page-hint">{t('kb_hint')}</p>
      </div>
      <div className="split">
        <div className="list-col">
          {kbs.length === 0 && <div className="log-empty">{t('kb_empty')}</div>}
          {kbs.map(k => (
            <div key={k.name} className={cur?.name === k.name ? 'list-item active' : 'list-item'}
              onClick={() => setCur(k)} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setCur(k)}>
              <div className="li-title">{k.name}</div>
              <div className="li-sub">{k.docs.length} {t('docs_count')}</div>
              {cur?.name === k.name && k.docs.map(d => (
                <div key={d} className="doc-row" tabIndex={0}
                  onClick={e => { e.stopPropagation(); view(k.name, d) }}
                  onKeyDown={e => e.key === 'Enter' && view(k.name, d)}>
                  <span>{d}</span>
                  <button className="mini-del" aria-label={`${t('delete')} ${d}`}
                    onClick={e => { e.stopPropagation(); kbDelete(k.name, d).then(load) }}>
                    {t('delete')}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="edit-col panel">
          <div className="two-col">
            <div className="field">
              <label htmlFor="kb-name">{t('kb_name')}</label>
              <input id="kb-name" value={form.kb}
                onChange={e => setForm({ ...form, kb: e.target.value })}
                placeholder={t('kb_name_ph')} />
            </div>
            <div className="field">
              <label htmlFor="kb-title">{t('doc_title')}</label>
              <input id="kb-title" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={t('doc_title_ph')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="kb-content">{t('content')}</label>
            <textarea id="kb-content" rows={12} value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })} />
          </div>
          <div className="row-inline">
            <button className="btn btn-primary" onClick={add}>{t('add_doc')}</button>
            {msg && <span className="msg">{msg}</span>}
          </div>
          {viewing && (
            <div className="doc-view">
              <h3 className="panel-title">{viewing.doc}</h3>
              <pre className="code-view">{viewing.content}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
