import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from './types/user'
import type { Bicycle } from './types/bicycle'

const API = 'http://127.0.0.1:8000/api/v1'

export default function LaunchAuctionPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate()
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    bicycle_id: '',
    title: '',
    starting_price: '',
    ends_at: '',
    min_bid_increment: '20',
  })

  useEffect(() => {
    fetch(`${API}/bicycles/`)
      .then((r) => r.json())
      .then((data) => {
        setBicycles(Array.isArray(data) ? data : [])
      })
      .catch(() => setError('Failed to load bicycles'))
  }, [])

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
      ends_at: new Date(form.ends_at).toISOString(),
      anti_snipe_trigger_window: 5,
      anti_snipe_extension_minutes: 5,
    }

    try {
      const res = await fetch(`${API}/auctions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setMsg('Auction launched successfully! Redirecting...')
        setTimeout(() => navigate('/dashboard'), 1000)
      } else {
        const err = await res.json()
        setError(err.detail || 'Failed to launch auction')
      }
    } catch {
      setError('Network error while launching auction')
    }
  }

  // Auto-fill title when a bicycle is picked
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
      <header className="bar">
        <div>
          <span className="brand-badge">CycleEngine</span>
          <h2>Launch New Auction</h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <Link to="/dashboard" className="btn-toggle">Dashboard</Link>
          <Link to="/bicycles" className="btn-toggle">Bicycles</Link>
          <button type="button" className="btn-toggle" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      {msg && <div className="alert">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card-wide" style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h3>Auction Configuration</h3>
        <p className="subtitle">Select a bicycle and define auction rules for campus bidding.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="field">
            <label>Select Bicycle *</label>
            <select
              value={form.bicycle_id}
              onChange={(e) => handleBicycleChange(e.target.value)}
              className="select-input"
              required
            >
              <option value="">-- Choose a Bicycle ({bicycles.length} available) --</option>
              {bicycles.map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.id} — Tag: {b.asset_tag} | {[b.brand, b.model, b.color].filter(Boolean).join(' ') || 'Bicycle'} [Status: {b.status}]
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
              Launch Auction
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
