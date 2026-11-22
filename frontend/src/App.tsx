import { useEffect, useState, useSyncExternalStore } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import RegistrationsPage from './pages/RegistrationsPage'
import Dashboard from './pages/Dashboard'
import BicyclesPage from './pages/BicyclesPage'
import BicycleDetailPage from './pages/BicycleDetailPage'
import AuctionPoolPage from './pages/AuctionPoolPage'
import AuctionsPage from './pages/AuctionsPage'
import LaunchAuctionPage from './LaunchAuctionPage'
import NotificationsPage from './pages/NotificationsPage'
import RequestsPage from './pages/RequestsPage'
import ScanPage from './pages/ScanPage'
import type { User } from './types/user'
import { authStorage } from './lib/authStorage'
import { apiData } from './lib/api'
import './App.css'

export default function App() {
  const user = useSyncExternalStore(authStorage.subscribe, authStorage.getUser)

  const token = authStorage.getToken()
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    apiData<User>('/auth/me', { signal: controller.signal }).then((currentUser) => {
      if (!controller.signal.aborted && authStorage.getToken() === token) {
        authStorage.setSession(currentUser, token)
        setVerifiedToken(token)
      }
    }).catch(() => {
      if (!controller.signal.aborted && authStorage.getToken() === token) setSessionError(true)
    })
    return () => controller.abort()
  }, [token, retry])

  const handleLogin = (u: User, token: string) => {
    setSessionError(false)
    authStorage.setSession(u, token)
  }

  const handleLogout = () => {
    authStorage.clearUser()
    setVerifiedToken(null)
    setSessionError(false)
  }

  if (user && token && verifiedToken !== token) return (
    <div className="auth-page">
      <div className="auth-card">
        <p role="status">{sessionError ? 'Could not verify your session.' : 'Checking your session…'}</p>
        {sessionError && <button className="btn-link" onClick={() => { setSessionError(false); setRetry(retry + 1) }}>Retry</button>}
        <button className="btn-link" onClick={handleLogout}>Sign out</button>
      </div>
    </div>
  )
  if (user?.role === 'student' && !user.profile_complete && token) return (
    <ProfilePage user={user} onLogout={handleLogout} onSave={(updated) => {
      if (authStorage.getToken() === token) authStorage.setSession(updated, token)
    }} />
  )

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/dashboard" replace /> : <AuthPage onLogin={handleLogin} />}
        />
        <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/bicycles"
          element={user ? <BicyclesPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route path="/bicycles/registrations" element={
          user && user.role !== 'guard' ? <RegistrationsPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />
        } />
        <Route
          path="/bicycles/:id"
          element={user ? <BicycleDetailPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/auctions"
          element={user ? <AuctionsPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route path="/auctions/:id" element={user ? <AuctionPoolPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />} />
        <Route
          path="/launch-auction"
          element={user && isAdmin ? <LaunchAuctionPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/notifications"
          element={user ? <NotificationsPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/requests"
          element={user && user.role !== 'guard' ? <RequestsPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route path="/s/:token" element={<ScanPage user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}