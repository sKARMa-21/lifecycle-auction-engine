import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordField from '../components/PasswordField'
import { API_BASE } from '../lib/api'
import type { User } from '../types/user'

interface AuthPageProps {
  onLogin: (user: User, token: string) => void
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    if (isRegister && password !== confirmation) {
      setErrorMsg('Passwords must match.')
      return
    }
    setLoading(true)

    const endpoint = isRegister ? '/auth/register' : '/auth/login'
    const body = isRegister ? { full_name: name, email, password, password_confirmation: confirmation } : { email, password }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
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
          setConfirmation('')
        } else {
          onLogin(data.user, data.access_token)
          navigate('/dashboard')
        }
      } else {
        setErrorMsg(typeof data.detail === 'string' ? data.detail : 'Authentication failed. Check the form and try again.')
      }
    } catch {
      setErrorMsg('Cannot reach backend server. Please verify the FastAPI backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page login-page">
      <div className="auth-card">
        <header className="brand-header">
          <span className="nav-brand">CycleEngine</span>
          <h1>{isRegister ? 'Create an account' : 'Sign in'}</h1>
          {isRegister && <p className="subtitle">Students can register with a campus email. Staff accounts are created by a super admin.</p>}
        </header>

        {errorMsg && <div className="alert alert-error" role="alert">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success" role="status">{successMsg}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="field">
              <label htmlFor="account-name">Full name</label>
              <input
                id="account-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="account-email">Campus email</label>
            <input
              id="account-email"
              type="email"
              autoComplete={isRegister ? 'email' : 'username'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'} disabled={loading} />
          {isRegister && <PasswordField label="Confirm password" value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" disabled={loading} />}

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          <p className="toggle-msg">
            {isRegister ? 'Already registered?' : 'New student?'}{' '}
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
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
