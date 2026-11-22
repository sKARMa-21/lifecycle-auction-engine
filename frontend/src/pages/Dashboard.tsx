import { apiData, apiFetch, jsonRequest } from '../lib/api'
import PageHeader from '../components/PageHeader'
import HostelSelect from '../components/HostelSelect'
import PasswordField from '../components/PasswordField'
import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Hostel, User, UserRole } from '../types/user'
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
    bicyclesNavLabel: 'Bicycle Lookup',
    showAuctionsNav: false,
    primaryAction: { label: 'Bicycle Lookup →', to: '/bicycles' },
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

  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffConfirmation, setStaffConfirmation] = useState('')
  const [staffHostel, setStaffHostel] = useState('')
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [directory, setDirectory] = useState<User[]>([])
  const [directoryError, setDirectoryError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [staffRole, setStaffRole] = useState<'admin' | 'guard'>('admin')
  const [staffStatusMsg, setStaffStatusMsg] = useState<{ text: string; error: boolean } | null>(null)
  const [staffLoading, setStaffLoading] = useState(false)

  const currentRole = (user.role as UserRole) || 'student'
  const config = ROLE_CONFIGS[currentRole] || ROLE_CONFIGS.student

  useEffect(() => {
    let cancelled = false
    if (!config.canLaunchAuction) return
    Promise.all([
      apiFetch(`${API}/bicycles/`).then((r) => {
        if (!r.ok) throw new Error('Could not load dashboard data.')
        return r.json()
      }),
      apiFetch(`${API}/auctions/`).then((r) => {
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
  }, [user.id, config.canLaunchAuction])

  useEffect(() => {
    if (!config.canManageStaff) return
    Promise.all([apiData<Hostel[]>('/auth/hostels'), apiData<User[]>('/auth/users')])
      .then(([available, users]) => { setHostels(available); setDirectory(users) })
      .catch((err: Error) => setDirectoryError(err.message))
  }, [config.canManageStaff])

  async function assignHostel(id: number, hostelId: string) {
    setAssigning(true)
    setDirectoryError('')
    try {
      const updated = await apiData<User>(`/auth/users/${id}/role`,
        jsonRequest('PATCH', { role: 'admin', hostel_id: Number(hostelId) }))
      setDirectory((users) => users.map((u) => u.id === id ? updated : u))
    } catch (err) {
      setDirectoryError((err as Error).message)
    } finally {
      setAssigning(false)
    }
  }

  const activeCount = bicycles.filter((b) => b.status === 'active').length
  const assetCount = bicycles.filter((b) => b.status === 'asset').length
  const auctionableCount = bicycles.filter((b) => b.status === 'auctionable').length
  const soldCount = bicycles.filter((b) => b.status === 'sold').length

  const handleCreateStaff = async (e: FormEvent) => {
    e.preventDefault()
    setStaffStatusMsg(null)
    if (staffPassword !== staffConfirmation) {
      setStaffStatusMsg({ text: 'Passwords must match.', error: true })
      return
    }
    setStaffLoading(true)

    try {
      const created = await apiData<User>('/auth/staff', jsonRequest('POST', {
        full_name: staffName, email: staffEmail, password: staffPassword,
        password_confirmation: staffConfirmation, role: staffRole,
        hostel_id: staffRole === 'admin' ? Number(staffHostel) : null,
      }))
      setDirectory((users) => [...users, created])
      setStaffStatusMsg({ text: `Created account for ${created.email}.`, error: false })
      setStaffName('')
      setStaffEmail('')
      setStaffPassword('')
      setStaffConfirmation('')
      setStaffHostel('')
    } catch (err) {
      setStaffStatusMsg({ text: (err as Error).message, error: true })
    } finally {
      setStaffLoading(false)
    }
  }

  return (
    <div className="page-wide">
      <PageHeader
        badge={config.badge}
        title={config.title}
        role={user.role}
        onLogout={onLogout}
        links={[
          { to: '/bicycles', label: config.bicyclesNavLabel },
          { to: '/auctions', label: 'Auction Pool', visible: config.showAuctionsNav },
          { to: '/launch-auction', label: '+ Launch Auction', visible: config.canLaunchAuction },
        ]}
      />

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
            <PasswordField label="Temporary password" value={staffPassword} autoComplete="new-password"
              onChange={(e) => setStaffPassword(e.target.value)} disabled={staffLoading} />
            <PasswordField label="Confirm password" value={staffConfirmation} autoComplete="new-password"
              onChange={(e) => setStaffConfirmation(e.target.value)} disabled={staffLoading} />
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
            {staffRole === 'admin' && <label className="field">Hostel
              <HostelSelect hostels={hostels} value={staffHostel} disabled={staffLoading}
                onChange={(e) => setStaffHostel(e.target.value)} />
            </label>}
            <div>
              <button type="submit" className="btn-submit" disabled={staffLoading || (staffRole === 'admin' && !hostels.length)} style={{ width: '100%' }}>
                {staffLoading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {config.canManageStaff && (
        <div className="card-wide">
          <h3>Staff and users</h3>
          {directoryError && <p className="alert alert-error" role="alert">{directoryError}</p>}
          <div style={{ overflowX: 'auto' }}>
            <table className="simple-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Hostel</th></tr></thead>
              <tbody>{directory.map((account) => (
                <tr key={account.id}>
                  <td>{account.full_name}</td><td>{account.email}</td><td>{account.role}</td>
                  <td>{account.role === 'admin' ? (
                    <HostelSelect hostels={hostels} value={account.hostel_id ?? ''} disabled={assigning}
                      className="inline-select" aria-label={`Hostel for ${account.full_name}`}
                      onChange={(e) => { if (e.target.value) void assignHostel(account.id, e.target.value) }} />
                  ) : hostels.find((hostel) => hostel.id === account.hostel_id)?.name ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
      {config.canLaunchAuction && (
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
      )}
    </div>
  )
}