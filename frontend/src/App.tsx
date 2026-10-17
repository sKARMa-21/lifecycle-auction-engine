import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import './App.css'

interface User {
  id: number
  full_name: string
  email: string
  role: string
}

function AuthPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [isRegister, setIsRegister] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg('Registered! Please login now.')
        setIsRegister(false)
        setPassword('')
      } else {
        setMsg(data.detail || 'Registration failed')
      }
    } catch {
      setMsg('Cannot connect to backend server')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        onLogin(data)
        navigate('/dashboard')
      } else {
        setMsg(data.detail || 'Login failed')
      }
    } catch {
      setMsg('Cannot connect to backend server')
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Lifecycle &amp; Auction Engine</h1>
      </header>

      <main className="page-main">
        <div className="form-box">
          <h2>{isRegister ? 'Register' : 'Login'}</h2>
          {msg && <p className="msg-text">{msg}</p>}

          <form onSubmit={isRegister ? handleRegister : handleLogin}>
            {isRegister && (
              <div className="field">
                <label>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="field">
              <label>LDAP ID</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
          </form>

          <p className="toggle-text">
            {isRegister ? (
              <span>Already have an account? <button type="button" className="text-btn" onClick={() => { setIsRegister(false); setMsg('') }}>Login</button></span>
            ) : (
              <span>Need an account? <button type="button" className="text-btn" onClick={() => { setIsRegister(true); setMsg('') }}>Register</button></span>
            )}
          </p>
        </div>
      </main>

      <footer className="page-footer">
        <p>CS699 - Lifecycle &amp; Auction Engine</p>
      </footer>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <AuthPage onLogin={setUser} />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
