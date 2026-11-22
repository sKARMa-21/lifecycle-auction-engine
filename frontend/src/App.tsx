import { useSyncExternalStore } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import BicyclesPage from './pages/BicyclesPage'
import BicycleDetailPage from './pages/BicycleDetailPage'
import AuctionPoolPage from './pages/AuctionPoolPage'
import AuctionsPage from './pages/AuctionsPage'
import LaunchAuctionPage from './LaunchAuctionPage'
import type { User } from './types/user'
import { authStorage } from './lib/authStorage'
import './App.css'

export default function App() {
  const user = useSyncExternalStore(authStorage.subscribe, authStorage.getUser)

  const handleLogin = (u: User, token: string) => {
    authStorage.setSession(u, token)
  }

  const handleLogout = () => {
    authStorage.clearUser()
  }

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
          element={user ? <LaunchAuctionPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
