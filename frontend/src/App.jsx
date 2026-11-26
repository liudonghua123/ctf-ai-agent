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
            <div className="settings-pop" role="dialog" aria-label="Settings">
              <div className="settings-row">
                <span className="settings-label">
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {t('theme')}
                </span>
                <div className="seg" role="radiogroup" aria-label={t('theme')}>
                  {['system', 'light', 'dark'].map(m => (
                    <button key={m} className={mode === m ? 'on' : ''}
                      onClick={() => setMode(m)} role="radio" aria-checked={mode === m}>
                      {m === 'system' && (
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M5 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      )}
                      {m === 'light' && (
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      )}
                      {m === 'dark' && (
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                      )}
                      {t(`theme_${m}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <span className="settings-label">
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M2 8h12M8 2c-3.5 3.8-3.5 8.2 0 12M8 2c3.5 3.8 3.5 8.2 0 12" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {t('language')}
                </span>
                <div className="seg" role="radiogroup" aria-label={t('language')}>
                  {['en', 'zh'].map(l => (
                    <button key={l} className={lang === l ? 'on' : ''}
                      onClick={() => setLang(l)} role="radio" aria-checked={lang === l}>
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
