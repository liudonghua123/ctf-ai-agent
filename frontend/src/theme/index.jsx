// Theme: system / light / dark, CSS variables driven, localStorage persisted.
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const QUERY = '(prefers-color-scheme: dark)'

function apply(mode) {
  const dark = mode === 'dark' ||
    (mode === 'system' && window.matchMedia(QUERY).matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() =>
    localStorage.getItem('ctf-ai-theme') || 'system')

  useEffect(() => {
    localStorage.setItem('ctf-ai-theme', mode)
    apply(mode)
    const mq = window.matchMedia(QUERY)
    const onChange = () => { if (mode === 'system') apply('system') }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme outside provider')
  return ctx
}
