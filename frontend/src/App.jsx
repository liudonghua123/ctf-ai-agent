import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import Run from './pages/Run'
import Agents from './pages/Agents'
import KB from './pages/KB'
import Skills from './pages/Skills'
import Mcp from './pages/Mcp'
import Sessions from './pages/Sessions'

const navItems = [
  { to: '/', label: '运行', icon: '▶' },
  { to: '/agents', label: 'Agent 配置', icon: '⚙' },
  { to: '/kb', label: '知识库', icon: '📚' },
  { to: '/skills', label: 'Skills', icon: '🧩' },
  { to: '/mcp', label: 'MCP', icon: '🔌' },
  { to: '/sessions', label: '历史', icon: '🕘' },
]

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-flag">🚩</span>
          <span>CTF AI Agent</span>
        </div>
        <nav>
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">v0.1 · 分析 / 解题 / Writeup</div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Run />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/kb" element={<KB />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/mcp" element={<Mcp />} />
          <Route path="/sessions" element={<Sessions />} />
        </Routes>
      </main>
    </div>
  )
}
