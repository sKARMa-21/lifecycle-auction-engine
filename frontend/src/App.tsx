import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import type { User } from './types/user'
import { authStorage } from './lib/authStorage'
import './App.css'

function AuthPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    const endpoint = isRegister ? '/api/v1/auth/register' : '/api/v1/auth/login'
    const body = isRegister ? { full_name: name, email, password } : { email, password }

    try {
      const res = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        if (isRegister) {
          setMsg('Account created! Please sign in.')
          setIsRegister(false)
          setPassword('')
        } else {
          onLogin(data)
          navigate('/dashboard')
        }
      } else {
        setMsg(data.detail || 'Authentication failed')
      }
    } catch {
      setMsg('Cannot connect to backend server')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-badge">CycleEngine</div>
        <h2>{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
        <p className="subtitle">{isRegister ? 'Register your student LDAP' : 'Sign in to access lifecycle portal'}</p>

        {msg && <div className="alert">{msg}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="field">
              <label>Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" required />
            </div>
          )}
          <div className="field">
            <label>LDAP ID / Email</label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rollnumber@iitb.ac.in" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
          </div>

          <button type="submit" className="btn-submit">
            {isRegister ? 'Register' : 'Sign In'}
          </button>
        </form>

        <p className="toggle-msg">
          {isRegister ? 'Already have an account?' : 'Need an account?'}
          <button type="button" className="btn-toggle" onClick={() => { setIsRegister(!isRegister); setMsg('') }}>
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => authStorage.getUser())

  const handleLogin = (u: User) => {
    authStorage.setUser(u)
    setUser(u)
  }

  const handleLogout = () => {
    authStorage.clearUser()
    setUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage onLogin={handleLogin} />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
