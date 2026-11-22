import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiData } from '../lib/api'
import type { Bicycle } from '../types/bicycle'
import type { User } from '../types/user'

export default function ScanPage({ user }: { user: User | null }) {
  const { token = '' } = useParams<{ token: string }>()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const isStaff = user !== null && user.role !== 'student'

  useEffect(() => {
    if (!isStaff) return
    let active = true
    apiData<Bicycle>(`/bicycles/scan/lookup?token=${encodeURIComponent(token)}`)
      .then((bicycle) => { if (active) navigate(`/bicycles/${bicycle.id}`, { replace: true }) })
      .catch((err) => { if (active) setError((err as Error).message) })
    return () => { active = false }
  }, [isStaff, token, navigate])

  if (!user) return <Navigate to="/" replace state={{ from: pathname }} />

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Bicycle QR {token}</h1>
        {isStaff && !error && <p role="status">Looking up the bicycle…</p>}
        {!isStaff && <p className="alert alert-error" role="alert">Only guards and admins can look up a bicycle by its QR code.</p>}
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <Link to="/dashboard" className="btn-link">Go to the dashboard</Link>
      </div>
    </main>
  )
}
