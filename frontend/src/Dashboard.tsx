import type { User } from './types/user'

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

        <button type="button" className="btn-submit" onClick={onLogout}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
