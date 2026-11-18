import { Link } from 'react-router-dom'

interface PageHeaderProps {
  badge: string
  title: string
  role: string
  onLogout: () => void
  links: { to: string; label: string; visible?: boolean }[]
}

export default function PageHeader({ badge, title, role, links, onLogout }: PageHeaderProps) {
  return (
    <header className="bar">
      <div>
        <span className="brand-badge">{badge}</span>
        <h2>{title}</h2>
      </div>
      <div className="bar-actions">
        <span className="role-pill">{role}</span>
        {links.filter(link => link.visible !== false).map(link => (
          <Link key={link.to} to={link.to} className="btn-toggle">
            {link.label}
          </Link>
        ))}
        <button type="button" className="btn-toggle" onClick={onLogout}>Sign Out</button>
      </div>
    </header>
  )
}
