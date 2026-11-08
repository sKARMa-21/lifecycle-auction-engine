import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import type { Bicycle } from '../types/bicycle'
import type { User } from '../types/user'
import LifecycleTimeline from '../components/LifecycleTimeline'

const API = 'http://127.0.0.1:8000/api/v1'

interface BicycleDetailPageProps {
  user: User
  onLogout: () => void
}

export default function BicycleDetailPage({ user, onLogout }: BicycleDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [bicycle, setBicycle] = useState<Bicycle | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Modals / forms state
  const [showAuctionModal, setShowAuctionModal] = useState(false)
  const [auctionForm, setAuctionForm] = useState({
    title: '',
    starting_price: 500,
    min_bid_increment: 50,
    ends_at: '',
  })

  const [showSoldModal, setShowSoldModal] = useState(false)
  const [soldForm, setSoldForm] = useState({
    cycle_condition: 'Good',
    market_value: 1200,
    years_used: 2,
    base_price_set: 600,
    sold_price: 850,
  })

  const fetchBicycle = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const [resB, resU] = await Promise.all([
        fetch(`${API}/bicycles/${id}`),
        fetch(`${API}/auth/users`),
      ])

      if (!resB.ok) {
        throw new Error(`Bicycle with ID #${id} not found.`)
      }

      const bData = await resB.json()
      const uData = await resU.json()

      setBicycle(bData)
      setUsers(Array.isArray(uData) ? uData : [])

      // Set default auction title
      setAuctionForm((prev) => ({
        ...prev,
        title: `${bData.brand || ''} ${bData.model || 'Bicycle'} [Tag #${bData.asset_tag}]`.trim(),
        ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16),
      }))
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message)
      } else {
        setErrorMsg('Failed to load bicycle details')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchBicycle()
  }, [fetchBicycle])

  // Lifecycle Action Handlers
  const handleTagAsAsset = async () => {
    if (!confirm('Tag this bicycle as an impounded campus asset? This will start a 30-day grace period.')) return
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API}/bicycles/${id}/tag-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccessMsg('Successfully tagged as ASSET. The 30-day grace period has begun.')
        fetchBicycle()
      } else {
        setErrorMsg(data.detail || 'Failed to tag as asset.')
      }
    } catch {
      setErrorMsg('Failed to communicate with server.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReclaim = async () => {
    if (!confirm('Reclaim this bicycle back to ACTIVE status?')) return
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API}/bicycles/${id}/reclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccessMsg('Bicycle successfully reclaimed to ACTIVE status!')
        fetchBicycle()
      } else {
        setErrorMsg(data.detail || 'Failed to reclaim bicycle.')
      }
    } catch {
      setErrorMsg('Failed to communicate with server.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetAuctionable = async () => {
    if (!confirm('Voluntarily surrender or mark this bicycle as AUCTIONABLE for campus bidding?')) return
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API}/bicycles/${id}/set-auctionable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccessMsg('Bicycle transitioned directly to AUCTIONABLE.')
        fetchBicycle()
      } else {
        setErrorMsg(data.detail || 'Failed to transition to auctionable.')
      }
    } catch {
      setErrorMsg('Failed to communicate with server.')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePromoteAuctionable = async () => {
    if (!confirm('Promote this asset to AUCTIONABLE? (Requires 30 days to have elapsed).')) return
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API}/bicycles/${id}/promote-auctionable`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSuccessMsg('Asset promoted to AUCTIONABLE successfully!')
        fetchBicycle()
      } else {
        setErrorMsg(data.detail || 'Failed to promote asset to auctionable.')
      }
    } catch {
      setErrorMsg('Failed to communicate with server.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateAuction = async (e: FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API}/auctions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bicycle_id: Number(id),
          created_by_id: user.id,
          title: auctionForm.title,
          starting_price: Number(auctionForm.starting_price),
          min_bid_increment: Number(auctionForm.min_bid_increment),
          ends_at: new Date(auctionForm.ends_at).toISOString(),
          anti_snipe_trigger_window: 5,
          anti_snipe_extension_minutes: 5,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setShowAuctionModal(false)
        setSuccessMsg('Auction created successfully!')
        navigate('/auctions')
      } else {
        setErrorMsg(data.detail || 'Failed to create auction.')
      }
    } catch {
      setErrorMsg('Failed to communicate with server.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMarkSold = async (e: FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API}/bicycles/${id}/mark-sold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycle_condition: soldForm.cycle_condition,
          market_value: Number(soldForm.market_value),
          years_used: Number(soldForm.years_used),
          base_price_set: Number(soldForm.base_price_set),
          sold_price: Number(soldForm.sold_price),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setShowSoldModal(false)
        setSuccessMsg('Bicycle marked as SOLD and recorded in analytics.')
        fetchBicycle()
      } else {
        setErrorMsg(data.detail || 'Failed to mark as sold.')
      }
    } catch {
      setErrorMsg('Failed to communicate with server.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-wide">
        <div className="card-wide" style={{ textAlign: 'center', padding: '60px' }}>
          <h3>Loading Bicycle Details...</h3>
        </div>
      </div>
    )
  }

  if (!bicycle) {
    return (
      <div className="page-wide">
        <div className="card-wide" style={{ textAlign: 'center', padding: '60px' }}>
          <h2>Bicycle Not Found</h2>
          <p className="subtitle">{errorMsg}</p>
          <Link to="/bicycles" className="btn-submit" style={{ display: 'inline-block', width: 'auto', marginTop: '20px' }}>
            ← Back to Bicycles
          </Link>
        </div>
      </div>
    )
  }

  const owner = users.find((u) => u.id === bicycle.owner_id)
  const isOwner = user.id === bicycle.owner_id
  const isAdmin = user.role === 'admin'
  const isGuard = user.role === 'guard'
  const canTagAsAsset = (isAdmin || isGuard) && bicycle.status === 'active'
  const canReclaim = (isOwner || isAdmin) && bicycle.status === 'asset'
  const canSetAuctionable = (isOwner || isAdmin) && bicycle.status === 'active'
  const canPromoteAuctionable = isAdmin && bicycle.status === 'asset'
  const canMarkSold = isAdmin && bicycle.status === 'auctionable'
  const canCreateAuction = (isAdmin || isOwner) && bicycle.status === 'auctionable'

  return (
    <div className="page-wide">
      {/* Top Navbar */}
      <header className="bar">
        <div>
          <span className="brand-badge">Lifecycle Engine</span>
          <h2>
            Bicycle #{bicycle.id}: {bicycle.asset_tag}
          </h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <Link to="/bicycles" className="btn-toggle">
            ← Bicycles
          </Link>
          <Link to="/auctions" className="btn-toggle">
            Auctions
          </Link>
          <Link to="/dashboard" className="btn-toggle">
            Dashboard
          </Link>
          <button type="button" className="btn-toggle" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Notifications */}
      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Lifecycle Progress Flow */}
      <div className="card-wide">
        <div className="detail-header-flex">
          <div>
            <h3>Lifecycle State Tracking</h3>
            <p className="subtitle">
              Engine rule validations: Active degree protection, 30-day grace period, and verified ownership.
            </p>
          </div>
          <div>
            <span className={`status-badge status-${bicycle.status.toLowerCase()}`}>
              {bicycle.status.toUpperCase()}
            </span>
          </div>
        </div>

        <LifecycleTimeline bicycle={bicycle} />
      </div>

      <div className="detail-two-col">
        {/* Left Column: Bicycle Metadata */}
        <div className="card-wide">
          <h3>Bicycle Specifications</h3>
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-label">Asset Tag:</span>
              <span className="meta-val"><strong>{bicycle.asset_tag}</strong></span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Brand & Model:</span>
              <span className="meta-val">
                {[bicycle.brand, bicycle.model].filter(Boolean).join(' ') || 'Not specified'}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Color:</span>
              <span className="meta-val">{bicycle.color || 'Not specified'}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Serial Number:</span>
              <span className="meta-val">{bicycle.serial_number || 'None'}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Found Location:</span>
              <span className="meta-val">{bicycle.found_location || 'Not recorded'}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Registered On:</span>
              <span className="meta-val">{new Date(bicycle.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="divider" />

          <h3>Registered Ownership</h3>
          {owner ? (
            <div className="owner-card">
              <div className="owner-title">{owner.full_name}</div>
              <div className="owner-email">{owner.email} ({owner.role})</div>
              {owner.degree_type && (
                <div className="owner-degree">
                  🎓 Enrolled: {owner.degree_type} ({owner.enrollment_year || 'N/A'} - Duration: {owner.degree_duration_years || 'N/A'} yrs)
                </div>
              )}
              {isOwner && <span className="tag-you">You are the registered owner</span>}
            </div>
          ) : (
            <p className="subtitle">No registered owner linked (Unclaimed/Found Asset).</p>
          )}
        </div>

        {/* Right Column: Engine Actions */}
        <div className="card-wide">
          <h3>Lifecycle Engine Actions</h3>
          <p className="subtitle">Execute state transitions based on your role ({user.role}):</p>

          <div className="actions-stack">
            {/* Active State Actions */}
            {canTagAsAsset && (
              <div className="action-card">
                <div className="action-info">
                  <strong>Tag as Abandoned Asset (Guard/Admin)</strong>
                  <p>Move cycle to ASSET state. Validates degree duration and initiates 30-day grace period.</p>
                </div>
                <button
                  type="button"
                  className="btn-action btn-warning"
                  onClick={handleTagAsAsset}
                  disabled={actionLoading}
                >
                  Tag as Asset
                </button>
              </div>
            )}

            {canSetAuctionable && (
              <div className="action-card">
                <div className="action-info">
                  <strong>Directly Mark Auctionable (Owner)</strong>
                  <p>Voluntarily submit your bicycle to the campus auction pool.</p>
                </div>
                <button
                  type="button"
                  className="btn-action btn-primary"
                  onClick={handleSetAuctionable}
                  disabled={actionLoading}
                >
                  Mark Auctionable
                </button>
              </div>
            )}

            {/* Asset State Actions */}
            {canReclaim && (
              <div className="action-card">
                <div className="action-info">
                  <strong>Reclaim Bicycle (Owner)</strong>
                  <p>Claim back impounded cycle during the active grace period and restore to ACTIVE.</p>
                </div>
                <button
                  type="button"
                  className="btn-action btn-success"
                  onClick={handleReclaim}
                  disabled={actionLoading}
                >
                  Reclaim Cycle
                </button>
              </div>
            )}

            {canPromoteAuctionable && (
              <div className="action-card">
                <div className="action-info">
                  <strong>Promote Asset to Auctionable (Admin)</strong>
                  <p>Transitions unclaimed asset to AUCTIONABLE once the 30-day grace period has passed.</p>
                </div>
                <button
                  type="button"
                  className="btn-action btn-primary"
                  onClick={handlePromoteAuctionable}
                  disabled={actionLoading}
                >
                  Promote to Auctionable
                </button>
              </div>
            )}

            {/* Auctionable State Actions */}
            {canCreateAuction && (
              <div className="action-card">
                <div className="action-info">
                  <strong>Launch Live Auction</strong>
                  <p>Create a live bidding listing with anti-sniping protection.</p>
                </div>
                <button
                  type="button"
                  className="btn-action btn-accent"
                  onClick={() => setShowAuctionModal(true)}
                  disabled={actionLoading}
                >
                  Create Auction
                </button>
              </div>
            )}

            {canMarkSold && (
              <div className="action-card">
                <div className="action-info">
                  <strong>Mark as Sold (Admin)</strong>
                  <p>Finalize auction outcome, transition to SOLD state, and log sale metrics.</p>
                </div>
                <button
                  type="button"
                  className="btn-action btn-dark"
                  onClick={() => setShowSoldModal(true)}
                  disabled={actionLoading}
                >
                  Mark as Sold
                </button>
              </div>
            )}

            {!canTagAsAsset &&
              !canReclaim &&
              !canSetAuctionable &&
              !canPromoteAuctionable &&
              !canCreateAuction &&
              !canMarkSold && (
                <div className="empty-actions">
                  <p>No actionable lifecycle transitions available for your role ({user.role}) in this bicycle's current state ({bicycle.status}).</p>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Modal: Create Auction */}
      {showAuctionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Create Live Auction</h3>
            <p className="subtitle">Configure auction parameters and anti-sniping protection.</p>
            <form onSubmit={handleCreateAuction}>
              <div className="field">
                <label>Auction Title</label>
                <input
                  type="text"
                  value={auctionForm.title}
                  onChange={(e) => setAuctionForm({ ...auctionForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Starting Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={auctionForm.starting_price}
                  onChange={(e) => setAuctionForm({ ...auctionForm, starting_price: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="field">
                <label>Minimum Bid Increment (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={auctionForm.min_bid_increment}
                  onChange={(e) => setAuctionForm({ ...auctionForm, min_bid_increment: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="field">
                <label>Auction Deadline (Ends At)</label>
                <input
                  type="datetime-local"
                  value={auctionForm.ends_at}
                  onChange={(e) => setAuctionForm({ ...auctionForm, ends_at: e.target.value })}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-toggle" onClick={() => setShowAuctionModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit btn-sm" disabled={actionLoading}>
                  {actionLoading ? 'Creating...' : 'Launch Auction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Mark as Sold */}
      {showSoldModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Record Sale & Finalize Lifecycle</h3>
            <p className="subtitle">Set condition and sale numbers for historical campus records.</p>
            <form onSubmit={handleMarkSold}>
              <div className="field">
                <label>Cycle Condition</label>
                <input
                  type="text"
                  value={soldForm.cycle_condition}
                  onChange={(e) => setSoldForm({ ...soldForm, cycle_condition: e.target.value })}
                  placeholder="e.g. Good, Refurbished, Fair"
                />
              </div>
              <div className="field">
                <label>Estimated Market Value (₹)</label>
                <input
                  type="number"
                  value={soldForm.market_value}
                  onChange={(e) => setSoldForm({ ...soldForm, market_value: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Years Used</label>
                <input
                  type="number"
                  value={soldForm.years_used}
                  onChange={(e) => setSoldForm({ ...soldForm, years_used: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Base Price Set (₹)</label>
                <input
                  type="number"
                  value={soldForm.base_price_set}
                  onChange={(e) => setSoldForm({ ...soldForm, base_price_set: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Final Sold Price (₹) *</label>
                <input
                  type="number"
                  value={soldForm.sold_price}
                  onChange={(e) => setSoldForm({ ...soldForm, sold_price: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-toggle" onClick={() => setShowSoldModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit btn-sm" disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Finalize Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
