import { apiData, jsonRequest } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import type { Bicycle, LifecycleEvent } from '../types/bicycle'
import type { StudentSummary, User } from '../types/user'
import LifecycleTimeline from '../components/LifecycleTimeline'
import BicycleQrSticker from '../components/BicycleQrSticker'

const shrinkPhoto = (file: File) => new Promise<string>((resolve, reject) => {
  const img = new Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    URL.revokeObjectURL(url)
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    resolve(canvas.toDataURL('image/jpeg', 0.8))
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error('This photo could not be read. Try another one, or take it with the camera.'))
  }
  img.src = url
})

interface BicycleDetailPageProps {
  user: User
  onLogout: () => void
}

export default function BicycleDetailPage({ user, onLogout }: BicycleDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [bicycle, setBicycle] = useState<Bicycle | null>(null)
  const [users, setUsers] = useState<StudentSummary[]>([])
  const [events, setEvents] = useState<LifecycleEvent[]>([])
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
    anti_snipe_extension_minutes: 1,
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
      const isAdm = user.role === 'admin' || user.role === 'super_admin'
      const [bData, uData, evData] = await Promise.all([
        apiData<Bicycle>(`/bicycles/${id}`),
        user.role === 'student' ? [] : apiData<StudentSummary[]>('/auth/students'),
        isAdm ? apiData<LifecycleEvent[]>(`/bicycles/${id}/events`).catch(() => []) : [],
      ])
      setBicycle(bData)
      setUsers(uData)
      setEvents(evData || [])
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
      anti_snipe_trigger_window: 5, anti_snipe_extension_minutes: Number(auctionForm.anti_snipe_extension_minutes) || 1,
    }, 'Auction created successfully!', () => { setShowAuctionModal(false); navigate('/auctions') })
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
  const specifications = [
    { label: 'Brand & model', value: [bicycle.brand, bicycle.model].filter(Boolean).join(' ') },
    { label: 'Color', value: bicycle.color },
    { label: 'Serial number', value: bicycle.serial_number },
    ...(isAdmin ? [
      { label: 'Found location', value: bicycle.found_location },
      { label: 'Registered on', value: new Date(bicycle.created_at).toLocaleString() },
    ] : []),
  ].filter(({ value }) => value)

  const actions = ([
    ['tag_asset', 'btn-warning', 'Tag as Asset', () => setShowTagAssetModal(true)],
    ['request_auction', 'btn-primary', 'Request Auction', handleRequestAuction],
    ['reclaim', 'btn-success', 'Return to Owner', handleReclaim],
    ['promote', 'btn-primary', 'Promote to Auctionable', handlePromoteAuctionable],
    ['launch_auction', 'btn-accent', 'Create Auction', () => setShowAuctionModal(true)],
  ] as const).filter(([action]) => can(action))

  return (
    <div className="page-wide">
      <PageHeader
        title={`Bicycle #${bicycle.id}: ${bicycle.asset_tag}`}
        role={user.role}
        onLogout={onLogout}
        action={user.role === 'guard' ? { to: '/auctions', label: 'Browse auctions' } : undefined}
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
          <h3>Lifecycle</h3>
          <span className={`status-badge status-${bicycle.status}`}>
            {bicycle.status?.toUpperCase()}
          </span>
        </div>

        <LifecycleTimeline bicycle={bicycle} />
      </div>
      )}

      <div className={actions.length ? 'detail-two-col' : undefined}>
        <div className="card-wide">
          {specifications.length > 0 && <>
            <h3>Bicycle Details</h3>
            <div className="meta-list">
              {specifications.map(({ label, value }) => (
                <div className="meta-row" key={label}>
                  <span className="meta-label">{label}</span>
                  <span className="meta-val">{value}</span>
                </div>
              ))}
            </div>
            <div className="divider" />
          </>}

          <h3>Owner</h3>
          {owner ? (
            <div className="owner-card">
              <div className="owner-title">{owner.full_name}{isOwner && ' (you)'}</div>
            </div>
          ) : (
            <p className="subtitle">{ownerId ? 'Owner details unavailable.' : 'No registered owner.'}</p>
          )}
        </div>

        {actions.length > 0 && (
          <div className="card-wide">
            <h3>Actions</h3>
            <div className="form-inline">
              {actions.map(([action, style, label, onClick]) => (
                <button key={action} type="button" className={`btn-action ${style}`} onClick={onClick} disabled={actionLoading}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {bicycle.qr_token && <BicycleQrSticker assetTag={bicycle.asset_tag} token={bicycle.qr_token} />}

      {isAdmin && (
        <div className="card-wide" style={{ marginTop: '24px' }}>
          <div className="detail-header-flex">
            <div>
              <h3>Lifecycle & Ownership Transfer History</h3>
              <p className="subtitle">
                Complete audit trail of ownership transfers, lifecycle milestones, and auction settlements.
              </p>
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {events.length} event(s) recorded
            </span>
          </div>

          {events.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '12px' }}>
              No lifecycle events recorded yet.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '16px' }}>
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Lifecycle Transition</th>
                    <th>Handled By</th>
                    <th>Details & Transaction Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                        {new Date(ev.created_at).toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span className="status-badge status-active" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          {ev.from_state} → {ev.to_state}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        {ev.actor_name || (ev.actor_id ? `User #${ev.actor_id}` : 'System')}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {ev.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showTagAssetModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Tag Bicycle as Asset</h3>
            <p className="subtitle">Starts the owner's 15-day claim period.</p>
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
                <label>Proof Photo * <span style={{ fontWeight: 400, fontSize: '0.82em' }}>(take a photo or choose one)</span></label>
                <input type="file" accept="image/*" required onChange={async (e) => {
                  const input = e.target
                  const file = input.files?.[0]
                  if (!file) return
                  try {
                    const photo = await shrinkPhoto(file)
                    setTagAssetForm((prev) => ({ ...prev, proof_image_url: photo }))
                  } catch (err) {
                    input.value = ''
                    setTagAssetForm((prev) => ({ ...prev, proof_image_url: '' }))
                    alert((err as Error).message)
                  }
                }} />
                {tagAssetForm.proof_image_url && (
                  <img src={tagAssetForm.proof_image_url} alt="Proof photo preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 180, marginTop: 8, borderRadius: 6 }} />
                )}
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
              <div className="field">
                <label>Anti-Snipe Extension Window</label>
                <select
                  value={auctionForm.anti_snipe_extension_minutes}
                  onChange={(e) => setAuctionForm({ ...auctionForm, anti_snipe_extension_minutes: Number(e.target.value) })}
                  className="select-input"
                >
                  <option value={1}>1 minute (Fast Demo / Flash)</option>
                  <option value={2}>2 minutes</option>
                  <option value={5}>5 minutes (Standard Campus Auction)</option>
                  <option value={10}>10 minutes</option>
                </select>
                <small style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                  Extends auction deadline if a bid is placed near the end.
                </small>
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
    </div>
  )
}
