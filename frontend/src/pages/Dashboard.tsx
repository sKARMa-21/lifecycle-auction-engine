import { apiData, jsonRequest } from '../lib/api'
import BicycleLookup from '../components/BicycleLookup'
import PageHeader from '../components/PageHeader'
import HostelSelect from '../components/HostelSelect'
import PasswordField from '../components/PasswordField'
import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { isAuctionLive } from '../lib/auction'
import type { Hostel, User } from '../types/user'
import type { Bicycle } from '../types/bicycle'
import type { Auction } from '../types/auction'

const bicycleStats = [
  { status: 'active', label: 'Active' },
  { status: 'asset', label: 'Awaiting claim' },
  { status: 'auctionable', label: 'Ready for auction' },
  { status: 'sold', label: 'Sold' },
]

interface DashboardProps {
  user: User
  onLogout: () => void
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [bicycles, setBicycles] = useState<Bicycle[] | null>(null)
  const [auctionFeed, setAuctionFeed] = useState<{ items: Auction[]; checkedAt: number } | null>(null)
  const [bicycleError, setBicycleError] = useState(false)
  const [auctionError, setAuctionError] = useState(false)

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

  const isGuard = user.role === 'guard'
  const isSuperAdmin = user.role === 'super_admin'
  const isAdmin = isSuperAdmin || user.role === 'admin'

  useEffect(() => {
    if (isGuard) return
    const controller = new AbortController()
    const options = { signal: controller.signal }

    async function loadBicycles() {
      const list: Bicycle[] = []
      const limit = 100
      for (let skip = 0; ; skip += limit) {
        const page = await apiData<Bicycle[]>(`/bicycles/?managed=${isAdmin}&skip=${skip}&limit=${limit}`, options)
        list.push(...page)
        if (page.length < limit) break
      }
      return isAdmin ? list : list.filter((bike) => (bike.current_owner_id ?? bike.owner_id) === user.id)
    }

    loadBicycles().then(setBicycles).catch(() => { if (!options.signal.aborted) setBicycleError(true) })
    const loadAuctions = () => apiData<Auction[]>('/auctions/', options)
      .then((items) => { setAuctionFeed({ items, checkedAt: Date.now() }); setAuctionError(false) })
      .catch(() => { if (!options.signal.aborted) setAuctionError(true) })

    loadAuctions()
    const timer = window.setInterval(loadAuctions, 30000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [isGuard, isAdmin, user.id, user.hostel_id])

  useEffect(() => {
    if (isAdmin) {
      apiData<Hostel[]>('/auth/hostels').then(setHostels)
        .catch((err: Error) => { if (isSuperAdmin) setDirectoryError(err.message) })
    }
    if (isSuperAdmin) apiData<User[]>('/auth/users').then(setDirectory)
      .catch((err: Error) => setDirectoryError(err.message))
  }, [isAdmin, isSuperAdmin])

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

  const hostel = hostels.find(({ id }) => id === user.hostel_id)?.name
  const role = isSuperAdmin ? 'Super admin' : isAdmin ? 'Admin' : isGuard ? 'Guard' : 'Student'
  const now = auctionFeed?.checkedAt ?? 0
  const openAuctions = auctionFeed?.items.filter((auction) => isAuctionLive(auction, now) ||
    (auction.status === 'scheduled' && Date.parse(auction.starts_at) > now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))

  const shortcuts = [
    ...(!isGuard ? [
      { to: '/bicycles/registrations', title: isAdmin ? 'Review registrations' : 'Cycle registration',
        text: isAdmin ? 'Approve or reject registration requests.' : 'Register a bicycle or check your approval status.' },
      { to: '/requests', title: isAdmin ? 'Auction requests' : 'My auction requests',
        text: isAdmin ? 'Review bicycles submitted for auction.' : 'Check the status of the bicycles you submitted.' },
    ] : []),
    ...(isAdmin ? [{ to: '/launch-auction', title: 'Launch auction', text: 'Schedule bidding for an eligible bicycle.' }] : []),
    { to: '/notifications', title: 'Notifications', text: 'Read updates about bicycles and auctions.' },
  ]

  return (
    <div className="page-wide dashboard">
      <PageHeader title="Dashboard" subtitle={`Welcome, ${user.full_name} · ${role}${hostel && !isSuperAdmin ? ` · ${hostel}` : ''}`}
        role={user.role} onLogout={onLogout} />

      {isGuard && <BicycleLookup autoFocus camera />}
      {isAdmin && (
        <div className="kpi-grid" aria-label="Bicycle statistics">
          {bicycleStats.map(({ status, label }) => (
            <div className="kpi-card" key={status}>
              <h2 className="kpi-label">{label}</h2>
              <strong className={`kpi-num status-text-${status}`}>
                {bicycleError ? '—' : bicycles?.filter((bike) => bike.status === status).length ?? '…'}
              </strong>
            </div>
          ))}
        </div>
      )}

      {!isGuard && (
        <section className="card-wide">
          <div className="detail-header-flex">
            <h3>{isSuperAdmin ? 'Campus bicycles' : isAdmin ? 'Hostel bicycles' : 'My bicycles'}</h3>
            <Link to="/bicycles" className="btn-link">{isAdmin ? 'Full registry' : 'Manage my bicycles'}</Link>
          </div>
          {bicycleError ? <p className="alert alert-error" role="alert">Could not load bicycles.</p> :
            !bicycles ? <p role="status">Loading bicycles…</p> :
            !bicycles.length ? <p className="dashboard-note">{
              isAdmin && !isSuperAdmin
                ? user.hostel_id ? 'No bicycles for this hostel yet.' : 'No hostel is assigned to your account.'
                : isSuperAdmin ? 'No bicycles in the registry yet.' : 'You have no registered bicycles yet.'
            }</p> : (
              <div className="dashboard-table dashboard-bicycles">
                <table className="simple-table" role="table" aria-label="Bicycle list">
                  <thead role="rowgroup"><tr role="row">
                    <th role="columnheader" scope="col">Asset tag</th><th role="columnheader" scope="col">Bicycle</th><th role="columnheader" scope="col">Status</th>
                  </tr></thead>
                  <tbody role="rowgroup">{bicycles.map((bike) => (
                    <tr key={bike.id} role="row">
                      <td role="cell"><Link to={`/bicycles/${bike.id}`} className="btn-link">{bike.asset_tag}</Link></td>
                      <td role="cell">{[bike.brand, bike.model, bike.color].filter(Boolean).join(' · ') || '—'}</td>
                      <td role="cell">{isAdmin ? <span className={`status-badge status-${bike.status}`}>
                        {bicycleStats.find(({ status }) => status === bike.status)?.label ?? bike.status ?? '—'}
                      </span> : bike.message || 'Registered'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </section>
      )}

      {!isGuard && (
        <section className="card-wide">
          <div className="detail-header-flex">
            <h3>Campus auctions</h3>
            <Link to="/auctions" className="btn-link">Browse auctions</Link>
          </div>
          {auctionError ? <p className="alert alert-error" role="alert">Could not load auctions.</p> :
            !openAuctions ? <p role="status">Loading auctions…</p> :
            !openAuctions.length ? <p className="dashboard-note">No live or upcoming auctions.</p> : (
              <ul className="dashboard-list">{openAuctions.slice(0, 3).map((auction) => {
                const live = isAuctionLive(auction, now)
                const date = new Date(live ? auction.ends_at : auction.starts_at)
                return <li key={auction.id}>
                  {live ? <Link to={`/auctions/${auction.id}`} className="btn-link">{auction.title}</Link> : <strong>{auction.title}</strong>}
                  <span className={live ? 'status-text-active' : 'dashboard-note'}>
                    {live ? 'Live · Ends' : 'Starts'} {date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </li>
              })}</ul>
            )}
        </section>
      )}

      <div className="dashboard-actions">
        {shortcuts.map(({ to, title, text }) => (
          <Link key={to} to={to} className="card-wide">
            <h3>{title}</h3>
            <p className="dashboard-note">{text}</p>
          </Link>
        ))}
      </div>

      {isSuperAdmin && (
        <details className="card-wide staff-form">
          <summary>Add staff</summary>
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
        </details>
      )}

      {isSuperAdmin && (
        <div className="card-wide">
          <h3>Staff and users</h3>
          {directoryError && <p className="alert alert-error" role="alert">{directoryError}</p>}
          <div className="dashboard-table dashboard-directory">
            <table className="simple-table" role="table" aria-label="Staff and users">
              <thead role="rowgroup"><tr role="row">
                <th role="columnheader" scope="col">Name</th><th role="columnheader" scope="col">Email</th>
                <th role="columnheader" scope="col">Role</th><th role="columnheader" scope="col">Hostel</th>
              </tr></thead>
              <tbody role="rowgroup">{directory.map((account) => (
                <tr key={account.id} role="row">
                  <td role="cell">{account.full_name}</td><td role="cell">{account.email}</td><td role="cell">{account.role}</td>
                  <td role="cell">{account.role === 'admin' ? (
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
    </div>
  )
}
