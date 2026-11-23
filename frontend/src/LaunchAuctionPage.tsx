import { API_BASE, apiData, apiFetch } from './lib/api'
import PageHeader from './components/PageHeader'
import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from './types/user'
import type { Bicycle } from './types/bicycle'
import type { Auction } from './types/auction'

const toLocalInput = (iso: string) => new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export default function LaunchAuctionPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    bicycle_id: '',
    title: '',
    starting_price: '',
    starts_at: '',
    ends_at: '',
    min_bid_increment: '20',
    anti_snipe_extension_minutes: '1',
  })

  useEffect(() => {
    if (editId) {
      apiData<Auction>(`/auctions/${editId}`).then(async (a) => {
        setBicycles([await apiData<Bicycle>(`/bicycles/${a.bicycle_id}`)])
        setForm({ bicycle_id: String(a.bicycle_id), title: a.title, starting_price: String(a.starting_price), starts_at: toLocalInput(a.starts_at),
          ends_at: toLocalInput(a.ends_at), min_bid_increment: String(a.min_bid_increment),
          anti_snipe_extension_minutes: String(a.anti_snipe_extension_minutes ?? 1) })
      }).catch(() => setError('Failed to load auction'))
      return
    }
    apiFetch(`${API_BASE}/bicycles/`)
      .then((r) => r.json())
      .then((data) => {
        setBicycles((Array.isArray(data) ? data as Bicycle[] : []).filter((b) => b.status === 'auctionable' && b.actions.includes('launch_auction')))
      })
      .catch(() => setError('Failed to load bicycles'))
  }, [editId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setError('')

    if (!form.bicycle_id) {
      setError('Please select a bicycle.')
      return
    }

    const payload = {
      bicycle_id: Number(form.bicycle_id),
      created_by_id: user.id,
      title: form.title.trim(),
      starting_price: parseFloat(form.starting_price) || 0,
      min_bid_increment: parseFloat(form.min_bid_increment) || 20,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      anti_snipe_trigger_window: 5,
      anti_snipe_extension_minutes: parseInt(form.anti_snipe_extension_minutes, 10) || 1,
    }

    try {
      const { bicycle_id: _bicycle, created_by_id: _creator, ...changes } = payload
      const res = await apiFetch(editId ? `${API_BASE}/auctions/${editId}` : `${API_BASE}/auctions/`, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? changes : payload),
      })
      if (res.ok) {
        setMsg(editId ? 'Auction updated! Redirecting...' : 'Auction launched successfully! Redirecting...')
        setTimeout(() => navigate(editId ? '/auctions' : '/dashboard'), 1000)
      } else {
        const err = await res.json()
        setError(err.detail || 'Failed to launch auction')
      }
    } catch {
      setError('Network error while launching auction')
    }
  }

  const handleBicycleChange = (bikeId: string) => {
    setForm((prev) => {
      const selectedBike = bicycles.find((b) => b.id === Number(bikeId))
      const autoTitle = selectedBike
        ? `${selectedBike.brand || ''} ${selectedBike.model || ''} (${selectedBike.asset_tag})`.trim()
        : prev.title
      return {
        ...prev,
        bicycle_id: bikeId,
        title: autoTitle || prev.title,
      }
    })
  }

  return (
    <div className="page-wide">
      <PageHeader
        title={editId ? 'Edit Scheduled Auction' : 'Launch New Auction'}
        role={user.role}
        onLogout={onLogout}
      />

      {msg && <div className="alert">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card-wide" style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h3>Auction Configuration</h3>
        <p className="subtitle">
          {editId
            ? 'Scheduled auctions can be edited until bidding opens.'
            : 'Choose a bicycle from the auction pool (approved requests and unclaimed impounded bicycles) and define auction rules.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="field">
            <label>Select Bicycle *</label>
            <select
              value={form.bicycle_id}
              onChange={(e) => handleBicycleChange(e.target.value)}
              className="select-input"
              required
              disabled={!!editId}
            >
              <option value="">-- Choose a Bicycle ({bicycles.length} in the pool) --</option>
              {bicycles.map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.id} — Tag: {b.asset_tag} | {[b.brand, b.model, b.color].filter(Boolean).join(' ') || 'Bicycle'}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Auction Title *</label>
            <input
              placeholder="e.g. Hero Sprint 26T in Good Condition"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Starting Price (₹) *</label>
              <input
                type="number"
                placeholder="500"
                min="0"
                step="1"
                value={form.starting_price}
                onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Minimum Bid Increment (₹)</label>
              <input
                type="number"
                min="5"
                step="5"
                value={form.min_bid_increment}
                onChange={(e) => setForm({ ...form, min_bid_increment: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Anti-Snipe Extension Window</label>
            <select
              value={form.anti_snipe_extension_minutes}
              onChange={(e) => setForm({ ...form, anti_snipe_extension_minutes: e.target.value })}
              className="select-input"
            >
              <option value="1">1 minute (Fast Demo / Flash)</option>
              <option value="2">2 minutes</option>
              <option value="5">5 minutes (Standard Campus Auction)</option>
              <option value="10">10 minutes</option>
            </select>
            <small style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
              If a bid is placed near the deadline, bidding time will automatically extend by this duration to prevent sniping.
            </small>
          </div>

          <div className="field">
            <label>Auction Start Date & Time *</label>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Auction End Date & Time *</label>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              required
            />
          </div>

          <div className="btn-row" style={{ marginTop: '8px' }}>
            <button type="submit" className="btn-submit">
              {editId ? 'Save Changes' : 'Launch Auction'}
            </button>
            <Link to="/dashboard" className="btn-secondary" style={{ textDecoration: 'none' }}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
