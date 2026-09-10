import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Leaderboard from './pages/Leaderboard'
import Admin from './pages/Admin'
import Stats from './pages/Stats'
import './App.css'

export default function App() {
  const location = useLocation()

  const navLink = (to, label) => {
    const active = location.pathname === to
    return (
      <Link to={to} style={{
        padding: '8px 14px', fontSize: 13, textDecoration: 'none',
        borderBottom: active ? '2px solid #FFB81C' : '2px solid transparent',
        color: active ? '#FFB81C' : 'rgba(255,255,255,0.7)',
        fontWeight: active ? 600 : 400,
        whiteSpace: 'nowrap'
      }}>{label}</Link>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lions-silver-light)' }}>
      <div style={{
        background: 'var(--lions-blue)',
        borderBottom: '3px solid var(--accent-gold)',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ paddingTop: 14, paddingBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26 }}>🦁</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>NFL Pick 'Em</div>
                <div style={{ fontSize: 11, color: 'var(--lions-silver)', marginTop: 1 }}>2026 Season · Detroit Lions Country</div>
              </div>
            </div>
            <div style={{ display: 'flex', marginTop: 8, overflowX: 'auto' }}>
              {navLink('/leaderboard', 'Leaderboard')}
              {navLink('/stats', 'Stats')}
              {navLink('/admin', 'Admin')}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
        <Routes>
          <Route path='/' element={<Leaderboard />} />
          <Route path='/leaderboard' element={<Leaderboard />} />
          <Route path='/stats' element={<Stats />} />
          <Route path='/admin' element={<Admin />} />
        </Routes>
      </div>
    </div>
  )
}