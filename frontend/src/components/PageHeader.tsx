import { useId, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import BrandLogo from './BrandLogo'

interface PageHeaderProps {
  title: string
  subtitle?: string
  role: string
  onLogout: () => void
  action?: { label: string } & ({ to: string } | { onClick: () => void; disabled?: boolean })
}

export default function PageHeader({ title, subtitle, role, action, onLogout }: PageHeaderProps) {
  const { pathname, search, key } = useLocation()
  const navId = useId()
  const menuButton = useRef<HTMLButtonElement>(null)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const menuOpen = openFor === key
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
      <div className="nav-bar" onKeyDown={(event) => {
        if (event.key === 'Escape' && menuOpen) {
          setOpenFor(null)
          menuButton.current?.focus()
        }
      }}>
        <BrandLogo />
        <button ref={menuButton} type="button" className="nav-toggle" aria-controls={navId} aria-expanded={menuOpen}
          onClick={() => setOpenFor(menuOpen ? null : key)}>
          Menu <span aria-hidden="true">{menuOpen ? '▴' : '▾'}</span>
        </button>
        <nav id={navId} className="bar-actions" aria-label="Main navigation" data-open={menuOpen} key={pathname + search}
          onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) setOpenFor(null) }}>
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
          <button type="button" className="nav-signout" onClick={onLogout}>Sign out</button>
        </nav>
      </div>
      <div className="bar-title">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && ('to' in action ? (
          <Link to={action.to} className="btn-link">{action.label}</Link>
        ) : (
          <button type="button" className="btn-link" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>
        ))}
      </div>
    </header>
  )
}
