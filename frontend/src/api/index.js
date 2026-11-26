import axios from 'axios'

// Relative path: works in dev (vite proxy) and behind tunnel/domain.
const api = axios.create({ baseURL: '/api' })

export const getAgents = () => api.get('/agents')
export const getAgent = (name) => api.get(`/agents/${name}`)
export const saveAgent = (name, cfg) => api.put(`/agents/${name}`, cfg)

export const listKBs = () => api.get('/kb')
export const kbAdd = (m) => api.post('/kb/add', m)
export const kbRead = (kbName, doc) => api.get(`/kb/${kbName}/${doc}`)
export const kbWrite = (kbName, doc, content) => api.put(`/kb/${kbName}/${doc}`, { content })
export const kbDelete = (kbName, doc) => api.delete(`/kb/${kbName}/${doc}`)
export const kbCreate = (name) => api.post('/kb/create', { name })
export const kbDeleteLib = (name) => api.delete(`/kb/${name}`)

export const listSkills = () => api.get('/skills')
export const saveSkill = (name, meta) => api.put(`/skills/${name}`, meta)
export const deleteSkill = (name) => api.delete(`/skills/${name}`)
export const toggleSkill = (name) => api.post(`/skills/${name}/toggle`)
export const skillFiles = (name) => api.get(`/skills/${name}/files`)
export const skillReadFile = (name, path) => api.get(`/skills/${name}/file`, { params: { path } })
export const skillWriteFile = (name, path, content) => api.put(`/skills/${name}/file`, { path, content })
export const skillCreateFile = (name, path, content = '', is_dir = false) => api.post(`/skills/${name}/file`, { path, content, is_dir })
export const skillDeleteFile = (name, path) => api.delete(`/skills/${name}/file`, { params: { path } })
export const skillUpload = (name, path, content_b64) => api.post(`/skills/${name}/upload`, { path, content_b64 })
export const hubSkills = () => api.get('/hub/skills')
export const hubInstall = (name) => api.post('/hub/skills/install', { name })

export const getMcp = () => api.get('/mcp')
export const saveMcpServer = (m) => api.put('/mcp', m)
export const deleteMcp = (name) => api.delete(`/mcp/${name}`)
export const toggleMcp = (name) => api.post(`/mcp/${name}/toggle`)
export const mcpTools = (name) => api.post(`/mcp/${name}/tools`)

export const listSessions = () => api.get('/sessions')
export const getSession = (sid) => api.get(`/sessions/${sid}`)

export const listChallengeFiles = () => api.post('/challenge-files')

// SSE run: returns event subscription
export function runAgent(m, onEvent, onDone, onError) {
  const ctrl = new AbortController()
  fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(m),
    signal: ctrl.signal,
  }).then(async (resp) => {
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') { onDone && onDone(); continue }
          try { onEvent && onEvent(JSON.parse(data)) } catch { /* ignore */ }
        }
      }
    }
    onDone && onDone()
  }).catch((e) => { if (e.name !== 'AbortError') onError && onError(e) })
  return ctrl
}
