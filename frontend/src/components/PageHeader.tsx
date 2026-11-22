import { Link, NavLink, useLocation } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  subtitle?: string
  role: string
  onLogout: () => void
  action?: { to: string; label: string }
}

export default function PageHeader({ title, subtitle, role, action, onLogout }: PageHeaderProps) {
  const { pathname, search } = useLocation()
  const admin = role === 'admin' || role === 'super_admin'
  const groups = [
    { label: 'Bicycles', links: [
      { to: '/bicycles', label: admin ? 'Fleet registry' : 'My bicycles' },
      { to: '/bicycles/registrations', label: admin ? 'Review registrations' : 'Cycle registration' },
    ] },
    { label: 'Auctions', links: [
      { to: '/auctions', label: 'Browse auctions' },
      { to: '/requests', label: admin ? 'Auction requests' : 'My auction requests' },
      ...(admin ? [{ to: '/launch-auction', label: 'Launch auction' }] : []),
    ] },
  ]

  return (
    <header className="bar">
      <div className="nav-bar">
        <span className="nav-brand">CycleEngine</span>
        <nav className="bar-actions" aria-label="Main navigation" key={pathname + search}>
          <NavLink to="/dashboard">Dashboard</NavLink>
          {role === 'guard' ? <NavLink to="/bicycles">Scan bicycle</NavLink> : groups.map(({ label, links }) => (
            <details key={label} name="main-menu" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
            }}>
              <summary className={links.some(({ to }) => pathname === to || pathname.startsWith(to + '/')) ? 'nav-current' : undefined}>{label}</summary>
              <div className="nav-menu">
                {links.map(({ to, label }) => <NavLink key={to} to={to} end
                  onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>{label}</NavLink>)}
              </div>
            </details>
          ))}
          <NavLink to="/notifications">Notifications</NavLink>
        </nav>
        <button type="button" className="nav-signout" onClick={onLogout}>Sign out</button>
      </div>
      <div className="bar-title">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && <Link to={action.to} className="btn-link">{action.label}</Link>}
      </div>
    </header>
  )
}
