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
  description: string
  canLaunchAuction: boolean
  canManageStaff: boolean
  bicyclesNavLabel: string
  showAuctionsNav: boolean
  primaryAction: { label: string; to: string }
  secondaryAction?: { label: string; to: string }
}

const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  super_admin: {
    badge: 'Super Admin Console',
    title: 'Super Admin Governance & Account Administration',
    description: 'System-wide governance: provision operational roles, oversee bicycle lifecycles, and audit campus auctions.',
    canLaunchAuction: true,
    canManageStaff: true,
    bicyclesNavLabel: 'Fleet Registry',
    showAuctionsNav: true,
    primaryAction: { label: 'Fleet Registry →', to: '/bicycles' },
    secondaryAction: { label: 'Live Auctions →', to: '/auctions' },
  },
  admin: {
    badge: 'Operations & Auction Admin',
    title: 'Campus Operations & Auction Dashboard',
    description: 'Manage bicycle lifecycles, monitor 30-day grace periods, and publish eligible cycles to the public auction floor.',
    canLaunchAuction: true,
    canManageStaff: false,
    bicyclesNavLabel: 'Fleet Registry',
    showAuctionsNav: true,
    primaryAction: { label: 'Fleet Registry →', to: '/bicycles' },
    secondaryAction: { label: 'Live Auctions →', to: '/auctions' },
  },
  guard: {
    badge: 'Guard Inspection Portal',
    title: 'Campus Security & Cycle Inspection Portal',
    description: 'Inspect parked bicycles, verify registered QR stickers, and report abandoned assets for statutory grace periods.',
    canLaunchAuction: false,
    canManageStaff: false,
    bicyclesNavLabel: 'Inspect Bicycles',
    showAuctionsNav: false,
    primaryAction: { label: 'Inspect Fleet Registry →', to: '/bicycles' },
  },
  student: {
    badge: 'Student Cycle & Bidding Portal',
    title: 'Student Bicycle & Live Auction Floor',
    description: 'Register and manage your campus bicycles, reclaim flagged assets during the 30-day grace period, and bid in real-time auctions.',
    canLaunchAuction: false,
    canManageStaff: false,
    bicyclesNavLabel: 'My Bicycles',
    showAuctionsNav: true,
    primaryAction: { label: 'My Registered Bicycles →', to: '/bicycles' },
    secondaryAction: { label: 'Browse Live Auctions →', to: '/auctions' },
  },
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)

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
    Promise.all([
      fetch(`${API}/bicycles/`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/auctions/`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([b, a]) => {
        setBicycles(Array.isArray(b) ? b : [])
        setAuctions(Array.isArray(a) ? a : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
              Auctions
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
            <p className="subtitle">
              Logged in as <strong>{user.email}</strong> &bull; Role:{' '}
              <span className="role-pill" style={{ marginLeft: 6 }}>{user.role}</span>
            </p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text)', marginTop: '8px' }}>
              {config.description}
            </p>
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
                {showStaffForm ? 'Hide Staff Form' : '+ Provision Staff'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Super Admin Staff Provisioning Section (Minimal & Collapsible) */}
      {config.canManageStaff && showStaffForm && (
        <div className="card-wide" style={{ marginTop: '16px' }}>
          <h3>Provision Operational Staff Account</h3>
          <p className="subtitle">Create and authorize Admin or Guard accounts directly into the system.</p>

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
                {staffLoading ? 'Provisioning...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Active Campus Cycles</span>
          <span className="kpi-num status-text-active">{loading ? '...' : activeCount}</span>
          <span className="kpi-sub">Registered with students or campus</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">In Grace Period (Asset)</span>
          <span className="kpi-num status-text-asset">{loading ? '...' : assetCount}</span>
          <span className="kpi-sub">Impounded, awaiting 30d reclamation</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Auctionable Pool</span>
          <span className="kpi-num status-text-auctionable">{loading ? '...' : auctionableCount}</span>
          <span className="kpi-sub">Eligible for public student auction</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Active Auctions</span>
          <span className="kpi-num status-text-extended">{loading ? '...' : auctions.length}</span>
          <span className="kpi-sub">Anti-sniping bidding active</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Completed / Sold</span>
          <span className="kpi-num status-text-sold">{loading ? '...' : soldCount}</span>
          <span className="kpi-sub">Archived and transferred to new owners</span>
        </div>
      </div>

      {/* Lifecycle Rules & Policies Explainer */}
      <div className="card-wide">
        <h3>Campus Bicycle Lifecycle Rules Engine</h3>
        <p className="subtitle">
          All state transitions are strictly governed by automated campus policies:
        </p>

        <div className="policy-grid">
          <div className="policy-item">
            <div className="policy-icon"></div>
            <div>
              <strong>Degree Duration Protection</strong>
              <p>
                Guards and authorities cannot impound bicycles belonging to students actively enrolled in their degree program. The engine strictly blocks unauthorized asset tagging.
              </p>
            </div>
          </div>

          <div className="policy-item">
            <div className="policy-icon"></div>
            <div>
              <strong>30-Day Statutory Grace Period</strong>
              <p>
                Once an abandoned cycle is tagged as ASSET, a 30-day countdown starts. The registered student owner can reclaim it at any point during this window.
              </p>
            </div>
          </div>

          <div className="policy-item">
            <div className="policy-icon"></div>
            <div>
              <strong>Anti-Sniping Auction Bidding</strong>
              <p>
                Bids placed within the final 5 minutes of an auction automatically extend the deadline by 5 minutes, preventing last-second sniping and ensuring fair pricing.
              </p>
            </div>
          </div>

          <div className="policy-item">
            <div className="policy-icon"></div>
            <div>
              <strong>Role-Based Access Control</strong>
              <p>
                Super Admins govern accounts, Admins manage auctions and lifecycle disputes, Guards inspect QR codes and tag abandoned assets, and Students participate in bidding and fleet ownership.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
