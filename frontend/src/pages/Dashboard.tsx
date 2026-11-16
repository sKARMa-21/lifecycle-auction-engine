import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { User, UserRole } from '../types/user'
import type { Bicycle } from '../types/bicycle'
import type { Auction } from '../types/auction'

const API = 'http://127.0.0.1:8000/api/v1'

interface DashboardProps {
  user: User
  onLogout: () => void
}

interface RoleConfig {
  badge: string
  title: string
  canLaunchAuction: boolean
  canManageStaff: boolean
  bicyclesNavLabel: string
  showAuctionsNav: boolean
  primaryAction: { label: string; to: string }
  secondaryAction?: { label: string; to: string }
}

const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  super_admin: {
    badge: 'Super Admin',
    title: 'Dashboard',
    canLaunchAuction: true,
    canManageStaff: true,
    bicyclesNavLabel: 'Fleet Registry',
    showAuctionsNav: true,
    primaryAction: { label: 'Fleet Registry →', to: '/bicycles' },
    secondaryAction: { label: 'Auction Pool →', to: '/auctions' },
  },
  admin: {
    badge: 'Admin',
    title: 'Dashboard',
    canLaunchAuction: true,
    canManageStaff: false,
    bicyclesNavLabel: 'Fleet Registry',
    showAuctionsNav: true,
    primaryAction: { label: 'Fleet Registry →', to: '/bicycles' },
    secondaryAction: { label: 'Auction Pool →', to: '/auctions' },
  },
  guard: {
    badge: 'Guard',
    title: 'Dashboard',
    canLaunchAuction: false,
    canManageStaff: false,
    bicyclesNavLabel: 'Inspect Bicycles',
    showAuctionsNav: false,
    primaryAction: { label: 'Inspect Bicycles →', to: '/bicycles' },
  },
  student: {
    badge: 'Student',
    title: 'Dashboard',
    canLaunchAuction: false,
    canManageStaff: false,
    bicyclesNavLabel: 'My Bicycles',
    showAuctionsNav: true,
    primaryAction: { label: 'My Bicycles →', to: '/bicycles' },
    secondaryAction: { label: 'Auction Pool →', to: '/auctions' },
  },
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Super Admin Staff Provisioning state
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRole, setStaffRole] = useState<'admin' | 'guard'>('admin')
  const [staffStatusMsg, setStaffStatusMsg] = useState<{ text: string; error: boolean } | null>(null)
  const [staffLoading, setStaffLoading] = useState(false)

  const currentRole = (user.role as UserRole) || 'student'
  const config = ROLE_CONFIGS[currentRole] || ROLE_CONFIGS.student

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`${API}/bicycles/`, {
        headers: { 'X-User-Id': String(user.id) },
      }).then((r) => {
        if (!r.ok) throw new Error('Could not load dashboard data.')
        return r.json()
      }),
      fetch(`${API}/auctions/`).then((r) => {
        if (!r.ok) throw new Error('Could not load dashboard data.')
        return r.json()
      }),
    ])
      .then(([b, a]) => {
        if (cancelled) return
        setLoadError('')
        setBicycles(Array.isArray(b) ? b : [])
        setAuctions(Array.isArray(a) ? a.filter((auction: Auction) => new Date(auction.ends_at).getTime() > Date.now()) : [])
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load dashboard data.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user.id])

  const activeCount = bicycles.filter((b) => b.status === 'active').length
  const assetCount = bicycles.filter((b) => b.status === 'asset').length
  const auctionableCount = bicycles.filter((b) => b.status === 'auctionable').length
  const soldCount = bicycles.filter((b) => b.status === 'sold').length

  const handleCreateStaff = async (e: FormEvent) => {
    e.preventDefault()
    setStaffStatusMsg(null)
    setStaffLoading(true)

    try {
      const res = await fetch(`${API}/auth/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': String(user.id),
        },
        body: JSON.stringify({
          full_name: staffName,
          email: staffEmail,
          password: staffPassword,
          role: staffRole,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffStatusMsg({ text: `Successfully created ${staffRole.toUpperCase()} user (${data.email})`, error: false })
        setStaffName('')
        setStaffEmail('')
        setStaffPassword('')
      } else {
        setStaffStatusMsg({ text: data.detail || 'Failed to create staff member.', error: true })
      }
    } catch {
      setStaffStatusMsg({ text: 'Error connecting to backend server.', error: true })
    } finally {
      setStaffLoading(false)
    }
  }

  return (
    <div className="page-wide">
      {/* Top Navbar */}
      <header className="bar">
        <div>
          <span className="brand-badge">{config.badge}</span>
          <h2>{config.title}</h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <Link to="/bicycles" className="btn-toggle">
            {config.bicyclesNavLabel}
          </Link>
          {config.showAuctionsNav && (
            <Link to="/auctions" className="btn-toggle">
              Auction Pool
            </Link>
          )}
          {config.canLaunchAuction && (
            <Link to="/launch-auction" className="btn-toggle">
              + Launch Auction
            </Link>
          )}
          <button type="button" className="btn-toggle" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Welcome Card */}
      <div className="card-wide dashboard-welcome-card">
        <div className="welcome-flex">
          <div>
            <h3>Welcome, {user.full_name}</h3>
          </div>
          <div className="welcome-actions">
            <Link to={config.primaryAction.to} className="btn-submit btn-sm" style={{ textDecoration: 'none', textAlign: 'center' }}>
              {config.primaryAction.label}
            </Link>
            {config.secondaryAction && (
              <Link to={config.secondaryAction.to} className="btn-secondary btn-sm" style={{ textDecoration: 'none', textAlign: 'center' }}>
                {config.secondaryAction.label}
              </Link>
            )}
            {config.canLaunchAuction && (
              <Link to="/launch-auction" className="btn-toggle btn-sm" style={{ textDecoration: 'none', textAlign: 'center' }}>
                + Launch Auction
              </Link>
            )}
            {config.canManageStaff && (
              <button
                type="button"
                className="btn-toggle btn-sm"
                onClick={() => setShowStaffForm(!showStaffForm)}
                style={{ textAlign: 'center' }}
              >
                {showStaffForm ? 'Hide Staff Form' : '+ Add Staff'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Super Admin Staff Provisioning Section (Minimal & Collapsible) */}
      {config.canManageStaff && showStaffForm && (
        <div className="card-wide" style={{ marginTop: '16px' }}>
          <h3>Add Staff</h3>

          {staffStatusMsg && (
            <div className={`alert ${staffStatusMsg.error ? 'alert-error' : 'alert-success'}`}>
              {staffStatusMsg.text}
            </div>
          )}

          <form onSubmit={handleCreateStaff} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Full Name</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="e.g. Campus Officer"
                required
                disabled={staffLoading}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Staff Email</label>
              <input
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="e.g. guard1@campus.edu"
                required
                disabled={staffLoading}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Temporary Password</label>
              <input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={staffLoading}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Assigned Role</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as 'admin' | 'guard')}
                disabled={staffLoading}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
              >
                <option value="admin">Admin</option>
                <option value="guard">Guard</option>
              </select>
            </div>
            <div>
              <button type="submit" className="btn-submit" disabled={staffLoading} style={{ width: '100%' }}>
                {staffLoading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Stats Grid */}
      {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
      <div className="kpi-grid">
        <Link to="/bicycles" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="kpi-label">Active Bicycles</span>
          <span className="kpi-num status-text-active">{loading ? '...' : loadError ? '—' : activeCount}</span>
        </Link>

        <Link to="/bicycles" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="kpi-label">Awaiting Claim</span>
          <span className="kpi-num status-text-asset">{loading ? '...' : loadError ? '—' : assetCount}</span>
        </Link>

        <Link to={config.canLaunchAuction ? '/launch-auction' : '/bicycles'} className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="kpi-label">Ready for Auction</span>
          <span className="kpi-num status-text-auctionable">{loading ? '...' : loadError ? '—' : auctionableCount}</span>
        </Link>

        {config.showAuctionsNav && (
          <Link to="/auctions" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="kpi-label">Auction Pool</span>
            <span className="kpi-num status-text-extended">{loading ? '...' : loadError ? '—' : auctions.length}</span>
          </Link>
        )}

        <Link to="/bicycles" className="kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="kpi-label">Sold</span>
          <span className="kpi-num status-text-sold">{loading ? '...' : loadError ? '—' : soldCount}</span>
        </Link>
      </div>
    </div>
  )
}
