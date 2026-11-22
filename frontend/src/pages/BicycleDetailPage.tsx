import { apiData, jsonRequest } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import type { Bicycle } from '../types/bicycle'
import type { StudentSummary, User } from '../types/user'
import LifecycleTimeline from '../components/LifecycleTimeline'

interface BicycleDetailPageProps {
  user: User
  onLogout: () => void
}

export default function BicycleDetailPage({ user, onLogout }: BicycleDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [bicycle, setBicycle] = useState<Bicycle | null>(null)
  const [users, setUsers] = useState<StudentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [showAuctionModal, setShowAuctionModal] = useState(false)
  const [auctionForm, setAuctionForm] = useState({
    title: '',
    starting_price: 500,
    min_bid_increment: 50,
    starts_at: '',
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

  const [showTagAssetModal, setShowTagAssetModal] = useState(false)
  const [tagAssetForm, setTagAssetForm] = useState({
    location: '',
    notes: '',
    proof_image_url: '',
  })

  const fetchBicycle = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const [bData, uData] = await Promise.all([apiData<Bicycle>(`/bicycles/${id}`),
        user.role === 'student' ? [] : apiData<StudentSummary[]>('/auth/students')])
      setBicycle(bData)
      setUsers(uData)
      setAuctionForm((prev) => ({
        ...prev,
        title: `${bData.brand || ''} ${bData.model || 'Bicycle'} [Tag #${bData.asset_tag}]`.trim(),
        ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16),
      }))
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to load bicycle details')
    } finally {
      setLoading(false)
    }
  }, [id, user.role])

  useEffect(() => {
    fetchBicycle()
  }, [fetchBicycle])

  const act = async (path: string, body: unknown, success: string | ((data: Bicycle) => string), after: () => unknown = fetchBicycle) => {
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const data = await apiData<Bicycle>(path, body === undefined ? { method: 'POST' } : jsonRequest('POST', body))
      setSuccessMsg(typeof success === 'string' ? success : success(data))
      after()
    } catch (err) {
      setErrorMsg((err as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  const handleTagAsAsset = (e: FormEvent) => {
    e.preventDefault()
    act(`/bicycles/${id}/tag-asset`, { actor_id: user.id, ...tagAssetForm },
      (data) => data.message || 'Bicycle impounded. The owner has been notified and has 15 days to claim it.', () => {
        setShowTagAssetModal(false)
        setTagAssetForm({ location: '', notes: '', proof_image_url: '' })
        fetchBicycle()
      })
  }
  const handleReclaim = () => {
    if (confirm(isAdmin ? 'Return this bicycle to its owner?' : 'Claim your bicycle back?'))
      act(`/bicycles/${id}/reclaim`, { actor_id: user.id }, isAdmin ? 'The bicycle is back with its owner.' : 'Your bicycle is back with you.')
  }
  const handleRequestAuction = () => {
    if (confirm('Ask your hostel admin to put this bicycle up for auction?'))
      act('/auction-requests', { bicycle_id: Number(id) }, 'Request sent. Track it under My Auctions.')
  }
  const handlePromoteAuctionable = () => {
    if (confirm('Move this asset to the auction pool? (Allowed once the owner\'s claim deadline has passed.)'))
      act(`/bicycles/${id}/promote-auctionable`, undefined, 'Asset promoted to AUCTIONABLE successfully!')
  }
  const handleCreateAuction = (e: FormEvent) => {
    e.preventDefault()
    act('/auctions/', {
      bicycle_id: Number(id), created_by_id: user.id, title: auctionForm.title,
      starting_price: Number(auctionForm.starting_price), min_bid_increment: Number(auctionForm.min_bid_increment),
      starts_at: new Date(auctionForm.starts_at).toISOString(), ends_at: new Date(auctionForm.ends_at).toISOString(),
      anti_snipe_trigger_window: 5, anti_snipe_extension_minutes: 5,
    }, 'Auction created successfully!', () => { setShowAuctionModal(false); navigate('/auctions') })
  }
  const handleMarkSold = (e: FormEvent) => {
    e.preventDefault()
    act(`/bicycles/${id}/mark-sold`, {
      cycle_condition: soldForm.cycle_condition, market_value: Number(soldForm.market_value), years_used: Number(soldForm.years_used),
      base_price_set: Number(soldForm.base_price_set), sold_price: Number(soldForm.sold_price),
    }, 'Bicycle marked as SOLD and recorded in analytics.', () => { setShowSoldModal(false); fetchBicycle() })
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

  const ownerId = bicycle.current_owner_id ?? bicycle.owner_id
  const isOwner = user.id === ownerId
  const owner = isOwner ? user : users.find((u) => u.id === ownerId)

  const can = (action: string) => bicycle.actions.includes(action)
  const canClaim = can('claim')

  return (
    <div className="page-wide">
      <PageHeader
        badge="Lifecycle Engine"
        title={`Bicycle #${bicycle.id}: ${bicycle.asset_tag}`}
        role={user.role}
        onLogout={onLogout}
        links={[
          { to: '/bicycles', label: '← Bicycles' },
          { to: '/auctions', label: 'Auctions' },
          { to: '/dashboard', label: 'Dashboard' },
        ]}
      />

      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {bicycle.message && (
        <div className="card-wide" style={{ borderLeft: '4px solid #d97706' }}>
          <h3 style={{ marginBottom: canClaim ? '12px' : 0 }}>{bicycle.message}</h3>
          {canClaim && (
            <button type="button" className="btn-submit" style={{ width: 'auto' }} onClick={handleReclaim} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Claim Cycle'}
            </button>
          )}
        </div>
      )}

      {isAdmin && (
      <div className="card-wide">
        <div className="detail-header-flex">
          <div>
            <h3>Lifecycle State Tracking</h3>
            <p className="subtitle">
              {bicycle.status === 'asset' && bicycle.claim_deadline
                ? `Claim deadline: ${new Date(bicycle.claim_deadline).toLocaleString()}`
                : 'Lifecycle tracking includes the 15-day claim period and ownership history.'}
            </p>
          </div>
          <div>
            <span className={`status-badge status-${bicycle.status}`}>
              {bicycle.status?.toUpperCase()}
            </span>
          </div>
        </div>

        <LifecycleTimeline bicycle={bicycle} />
      </div>
      )}

      <div className="detail-two-col">
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
            {isAdmin && (
              <div className="meta-row">
                <span className="meta-label">Found Location:</span>
                <span className="meta-val">{bicycle.found_location || 'Not recorded'}</span>
              </div>
            )}
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
              {isOwner && <span className="tag-you">You are the registered owner</span>}
            </div>
          ) : (
            <p className="subtitle">{ownerId ? 'Owner details are unavailable.' : 'No registered owner linked.'}</p>
          )}
        </div>

        <div className="card-wide">
          <h3>Lifecycle Engine Actions</h3>
          <p className="subtitle">Execute state transitions based on your role ({user.role}):</p>

          <div className="actions-stack">
            {([
              ['tag_asset', 'Tag as Abandoned Asset (Guard/Admin)', 'Impound this cycle with photo evidence. The owner is notified and gets 15 days to claim it.', 'btn-warning', 'Tag as Asset', () => setShowTagAssetModal(true)],
              ['request_auction', 'Request Auction', 'Ask your hostel admin to sell this bicycle through the campus auction.', 'btn-primary', 'Request Auction', handleRequestAuction],
              ['reclaim', 'Return to Owner (Admin)', 'Close the case and give the impounded cycle back to its owner before the claim deadline.', 'btn-success', 'Return to Owner', handleReclaim],
              ['promote', 'Promote Asset to Auctionable (Admin)', "Moves an unclaimed asset to the auction pool once the owner's claim deadline has passed.", 'btn-primary', 'Promote to Auctionable', handlePromoteAuctionable],
              ['launch_auction', 'Launch Live Auction', 'Create a live bidding listing with anti-sniping protection.', 'btn-accent', 'Create Auction', () => setShowAuctionModal(true)],
              ['mark_sold', 'Mark as Sold (Admin)', 'Finalize auction outcome, transition to SOLD state, and log sale metrics.', 'btn-dark', 'Mark as Sold', () => setShowSoldModal(true)],
            ] as const).filter(([action]) => can(action)).map(([action, title, text, style, label, onClick]) => (
              <div className="action-card" key={action}>
                <div className="action-info"><strong>{title}</strong><p>{text}</p></div>
                <button type="button" className={`btn-action ${style}`} onClick={onClick} disabled={actionLoading}>{label}</button>
              </div>
            ))}

            {bicycle.actions.filter((action) => action !== 'claim' && action !== 'edit').length === 0 && (
                <div className="empty-actions">
                  <p>No actions are available to you for this bicycle right now.</p>
                </div>
              )}
          </div>
        </div>
      </div>

      {showTagAssetModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Tag Bicycle as Asset</h3>
            <p className="subtitle">Location, notes, and proof photo required. Starts the owner's 15-day claim period.</p>
            <form onSubmit={handleTagAsAsset}>
              <div className="field">
                <label>Location *</label>
                <input type="text" placeholder="e.g. Hostel 3 Bicycle Stand" value={tagAssetForm.location} onChange={(e) => setTagAssetForm({ ...tagAssetForm, location: e.target.value })} required maxLength={150} />
              </div>
              <div className="field">
                <label>Notes *</label>
                <textarea placeholder="e.g. Found unlocked and unclaimed for 10+ days." value={tagAssetForm.notes} onChange={(e) => setTagAssetForm({ ...tagAssetForm, notes: e.target.value })} required rows={3} style={{ width: '100%', resize: 'vertical' }} />
              </div>
              <div className="field">
                <label>Proof Photo URL * <span style={{ fontWeight: 400, fontSize: '0.82em' }}>(https://...)</span></label>
                <input type="url" placeholder="https://example.com/photo.jpg" value={tagAssetForm.proof_image_url} onChange={(e) => setTagAssetForm({ ...tagAssetForm, proof_image_url: e.target.value })} required />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-toggle" onClick={() => { setShowTagAssetModal(false); setTagAssetForm({ location: '', notes: '', proof_image_url: '' }) }}>Cancel</button>
                <button type="submit" className="btn-action btn-warning btn-sm" disabled={actionLoading}>{actionLoading ? 'Tagging...' : 'Tag as Asset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <label>Auction Start Date & Time *</label>
                <input
                  type="datetime-local"
                  value={auctionForm.starts_at}
                  onChange={(e) => setAuctionForm({ ...auctionForm, starts_at: e.target.value })}
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