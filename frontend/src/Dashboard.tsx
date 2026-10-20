export default function Dashboard({ user, onLogout }: {
  user: { full_name: string; email: string; role: string }
  onLogout: () => void
}) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-badge">CycleEngine</div>
        <h2>Welcome, {user.full_name}</h2>
        <p className="subtitle">{user.email} &mdash; <span className="role-pill">{user.role}</span></p>
        <hr className="divider" />
        <p className="subtitle">Dashboard coming soon.</p>
        <button type="button" className="btn-submit" onClick={onLogout}>Sign Out</button>
      </div>
    </div>
  )
}
