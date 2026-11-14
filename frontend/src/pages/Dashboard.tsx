import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '../types/user'
import type { Bicycle } from '../types/bicycle'
import type { Auction } from '../types/auction'

const API = 'http://127.0.0.1:8000/api/v1'

interface DashboardProps {
  user: User
  onLogout: () => void
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/bicycles/`).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/auctions/`).then((r) => r.ok ? r.json() : []),
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

  return (
    <div className="page-wide">
      {/* Top Navbar */}
      <header className="bar">
        <div>
          <span className="brand-badge">CycleEngine Portal</span>
          <h2>Campus Operations Dashboard</h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <Link to="/bicycles" className="btn-toggle">
            Bicycles
          </Link>
          <Link to="/auctions" className="btn-toggle">
            Auctions
          </Link>
          <Link to="/launch-auction" className="btn-toggle">
            + Launch Auction
          </Link>
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
              You have access to manage bicycle lifecycles, monitor 30-day grace periods, and participate in campus auctions.
            </p>
          </div>
          <div className="welcome-actions">
            <Link to="/bicycles" className="btn-submit btn-sm" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Fleet Registry →
            </Link>
            <Link to="/auctions" className="btn-secondary btn-sm" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Live Auctions →
            </Link>
            <Link to="/launch-auction" className="btn-toggle btn-sm" style={{ textDecoration: 'none', textAlign: 'center' }}>
              + Launch Auction
            </Link>
          </div>
        </div>
      </div>

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
              <strong>Pessimistic Concurrency Locking</strong>
              <p>
                All auction bids utilize transactional database row locks (<code>with_for_update</code>) to prevent race conditions during simultaneous bids.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
