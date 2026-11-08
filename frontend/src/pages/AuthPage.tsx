import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '../types/user'

interface AuthPageProps {
  onLogin: (user: User) => void
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)

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
          setSuccessMsg('Account registered successfully! You can now sign in.')
          setIsRegister(false)
          setPassword('')
        } else {
          onLogin(data)
          navigate('/dashboard')
        }
      } else {
        setErrorMsg(data.detail || 'Authentication failed. Please check your credentials.')
      }
    } catch {
      setErrorMsg('Cannot reach backend server. Please verify the FastAPI backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-header">
          <span className="brand-badge">Lifecycle & Auction</span>
          <h2>{isRegister ? 'Create Campus Account' : 'Welcome Back'}</h2>
          <p className="subtitle">
            {isRegister
              ? 'Register with your student or campus email ID'
              : 'Sign in to manage bicycles, ownership, and campus auctions'}
          </p>
        </div>

        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="field">
            <label>Campus Email / LDAP</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@campus.edu or admin@campus.edu"
              required
              disabled={loading}
            />
            <span className="field-hint">
              Tip: Emails starting with <code>admin</code> gain Admin privileges.
            </span>
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Processing...' : isRegister ? 'Register Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p className="toggle-msg">
            {isRegister ? 'Already registered?' : 'Need an account?'}
            <button
              type="button"
              className="btn-toggle"
              onClick={() => {
                setIsRegister(!isRegister)
                setErrorMsg('')
                setSuccessMsg('')
              }}
              disabled={loading}
            >
              {isRegister ? 'Sign In here' : 'Register now'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
