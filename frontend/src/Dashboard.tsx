import type { User } from './types/user'
import { Link } from 'react-router-dom'

interface DashboardProps {
  user: User
  onLogout: () => void
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  return (
    <div className="auth-page">
      <div className="auth-card dashboard-card">
        <div className="dashboard-header">
          <div className="brand-badge">CycleEngine</div>
          <span className="role-pill">{user.role}</span>
        </div>

        <h2>Welcome, {user.full_name}</h2>
        <p className="subtitle">{user.email}</p>

        <div className="dashboard-panel">
          <p className="panel-status">Logged in as authenticated {user.role.toLowerCase()}</p>
          <p className="panel-desc">You have active access to the lifecycle auction portal.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          <Link to="/bicycles" className="btn-submit" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Manage Bicycles →
          </Link>

          <button type="button" className="btn-secondary" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
