import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { User } from './types/user'
import type { Bicycle } from './types/bicycle'
import type { Auction } from './types/auction'

const API = 'http://127.0.0.1:8000/api/v1'

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [msg, setMsg] = useState('')

  const [bidModal, setBidModal] = useState<{ id: number; min: number; title: string } | null>(null)
  const [bidAmount, setBidAmount] = useState('')

  const load = async () => {
    try {
      const [b, a, u] = await Promise.all([
        fetch(`${API}/bicycles/`).then((r) => r.json()),
        fetch(`${API}/auctions/`).then((r) => r.json()),
        fetch(`${API}/auth/users`).then((r) => r.json()),
      ])
      setBicycles(Array.isArray(b) ? b : [])
      setAuctions(Array.isArray(a) ? a : [])
      setUsers(Array.isArray(u) ? u : [])
    } catch {
      setMsg('Failed to load data')
    }
  }

  useEffect(() => { load() }, [])

  const myBicycles = bicycles.filter((b) => b.owner_id === user.id)
  const liveAuctions = auctions.filter((a) => a.status === 'active' || a.status === 'extended')
  const assetCount = bicycles.filter((b) => b.status === 'asset').length

  const placeBid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bidModal) return
    const res = await fetch(`${API}/auctions/${bidModal.id}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidder_id: user.id, amount: parseFloat(bidAmount) }),
    })
    if (res.ok) {
      setMsg('Bid placed!')
      setBidModal(null)
      setBidAmount('')
      load()
    } else {
      const err = await res.json()
      setMsg(err.detail || 'Bid rejected')
    }
  }

  const getUserName = (id?: number | null) => {
    const f = users.find((u) => u.id === id)
    return f ? f.full_name : id ? `User #${id}` : 'None'
  }

  return (
    <div className="page-wide">
      {/* Top Header */}
      <header className="bar">
        <div>
          <span className="brand-badge">CycleEngine</span>
          <h2>Campus Dashboard</h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user.full_name}</span>
          <Link to="/bicycles" className="btn-toggle">Bicycles</Link>
          <Link to="/launch-auction" className="btn-toggle">+ Launch Auction</Link>
          <button type="button" className="btn-toggle" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      {msg && <div className="alert">{msg}</div>}

      {/* Overview Stat Cards */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Total Bicycles</span>
          <span className="stat-num">{bicycles.length}</span>
          <span className="stat-sub">{myBicycles.length} owned by you</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Live Auctions</span>
          <span className="stat-num">{liveAuctions.length}</span>
          <span className="stat-sub">Active bidding</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Campus Assets</span>
          <span className="stat-num">{assetCount}</span>
          <span className="stat-sub">Under 30-day grace period</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Registered Students</span>
          <span className="stat-num">{users.length}</span>
          <span className="stat-sub">Campus users</span>
        </div>
      </div>

      {/* User Welcome & Quick Action Card */}
      <div className="card-wide">
        <div className="split-header">
          <div>
            <h3>Welcome back, {user.full_name}</h3>
            <p className="subtitle" style={{ margin: 0 }}>
              {user.email} {user.hostel_name ? `• ${user.hostel_name} Room ${user.room_number || '—'}` : ''}
            </p>
          </div>
          <div className="bar-actions">
            <Link to="/bicycles" className="btn-submit btn-sm" style={{ textDecoration: 'none' }}>
              Manage Bicycles →
            </Link>
            <Link to="/launch-auction" className="btn-secondary" style={{ textDecoration: 'none' }}>
              + Launch Auction
            </Link>
          </div>
        </div>
      </div>

      {/* Live Auctions Table */}
      <div className="card-wide">
        <div className="split-header">
          <h3>Live Auctions</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="count-pill">{liveAuctions.length} Active</span>
            <Link to="/launch-auction" className="btn-link" style={{ padding: 0 }}>+ Create Auction</Link>
          </div>
        </div>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Bicycle</th>
              <th>Leading Bid</th>
              <th>Top Bidder</th>
              <th>Ends At</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {liveAuctions.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>No active auctions right now. Click "+ Launch Auction" to start one!</td></tr>
            ) : (
              liveAuctions.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.title}</strong></td>
                  <td>Cycle #{a.bicycle_id}</td>
                  <td>₹{a.current_highest_bid}</td>
                  <td>{getUserName(a.current_winner_id)}</td>
                  <td>{new Date(a.ends_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className="role-pill">{a.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        const min = a.current_highest_bid + (a.min_bid_increment || 20)
                        setBidModal({ id: a.id, min, title: a.title })
                        setBidAmount(String(min))
                      }}
                    >
                      Bid
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* User's Own Bicycles */}
      <div className="card-wide">
        <div className="split-header">
          <h3>My Registered Bicycles</h3>
          <Link to="/bicycles" className="btn-link" style={{ padding: 0 }}>View All Bicycles →</Link>
        </div>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Brand / Model</th>
              <th>Color</th>
              <th>Status</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {myBicycles.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No bicycles registered to your account.</td></tr>
            ) : (
              myBicycles.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.asset_tag}</strong></td>
                  <td>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</td>
                  <td>{b.color || '—'}</td>
                  <td><span className="role-pill">{b.status}</span></td>
                  <td>{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Place Bid Modal */}
      {bidModal && (
        <div className="modal-overlay">
          <div className="auth-card modal-card">
            <span className="brand-badge">Place Bid</span>
            <h3>{bidModal.title}</h3>
            <p className="subtitle">Minimum required bid is ₹{bidModal.min}</p>
            <form onSubmit={placeBid}>
              <div className="field">
                <label>Bid Amount (₹)</label>
                <input
                  type="number"
                  min={bidModal.min}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  required
                />
              </div>
              <div className="btn-row">
                <button type="submit" className="btn-submit">Submit Bid</button>
                <button type="button" className="btn-secondary" onClick={() => setBidModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
