import { useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, Link } from 'react-router-dom'
import { useI18n } from './i18n/index.jsx'
import { useTheme } from './theme/index.jsx'
import Run from './pages/Run'
import Agents from './pages/Agents'
import KB from './pages/KB'
import Skills from './pages/Skills'
import Mcp from './pages/Mcp'
import Sessions from './pages/Sessions'

const NAV = [
  { to: '/', key: 'nav_run', end: true },
  { to: '/agents', key: 'nav_agents' },
  { to: '/kb', key: 'nav_kb' },
  { to: '/skills', key: 'nav_skills' },
  { to: '/mcp', key: 'nav_mcp' },
  { to: '/sessions', key: 'nav_sessions' },
]

function FlagIcon() {
  return (
    <svg className="brand-flag" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 4h11l-2.5 3.5L16 11H5V4z" fill="currentColor" />
    </svg>
  )
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  const { mode, setMode } = useTheme()
  const [drawer, setDrawer] = useState(false)
  const [settings, setSettings] = useState(false)
  const popRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setSettings(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    document.title = `${t('app_name')} — ${t('app_sub')}`
  }, [lang, t])

  const navLinks = (className) => NAV.map((n) => (
    <NavLink key={n.to} to={n.to} end={n.end}
      className={({ isActive }) => (isActive ? `${className} active` : className)}
      onClick={() => setDrawer(false)}>
      {t(n.key)}
    </NavLink>
  ))

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <FlagIcon />
          <span>
            <span className="brand-name">{t('app_name')}</span>
            <span className="brand-sub">{t('app_sub')}</span>
          </span>
        </Link>
        <nav className="island-nav" aria-label="Main">{navLinks('')}</nav>
        <div className="topbar-actions" ref={popRef} style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={() => setSettings(v => !v)}
            aria-label={t('theme')} aria-expanded={settings}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {settings && (
            <div className="settings-pop">
              <div className="settings-row">
                <span className="settings-label">{t('theme')}</span>
                <div className="seg" role="radiogroup">
                  {['system', 'light', 'dark'].map(m => (
                    <button key={m} className={mode === m ? 'on' : ''}
                      onClick={() => setMode(m)}>
                      {t(`theme_${m}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <span className="settings-label">{t('language')}</span>
                <div className="seg" role="radiogroup">
                  {['en', 'zh'].map(l => (
                    <button key={l} className={lang === l ? 'on' : ''}
                      onClick={() => setLang(l)}>
                      {l === 'en' ? 'English' : '中文'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <button className={`icon-btn menu-btn ${drawer ? 'open' : ''}`}
            onClick={() => setDrawer(v => !v)}
            aria-label="Menu" aria-expanded={drawer}>
            <span /><span /><span />
          </button>
        </div>
      </header>

      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <nav className="drawer" aria-label="Mobile">{navLinks('')}</nav>
        </>
      )}

      <main id="main" className="container">
        <Routes>
          <Route path="/" element={<Run />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/kb" element={<KB />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/mcp" element={<Mcp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="footer">
        <span>CTF AI Agent</span>
        <span>
          <a href="https://github.com/liudonghua123/ctf-ai-agent" target="_blank"
            rel="noreferrer">GitHub</a>
          {' · '}MIT
        </span>
      </footer>
    </>
  )
}

function NotFound() {
  const { t } = useI18n()
  return (
    <div className="panel" style={{ textAlign: 'center', padding: 'var(--s-10)' }}>
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em' }}>404</div>
      <p className="hint-text" style={{ margin: 'var(--s-4) 0' }}>
        This page does not exist.
      </p>
      <Link to="/" className="btn btn-primary">{t('nav_run')}</Link>
    </div>
  )
}
