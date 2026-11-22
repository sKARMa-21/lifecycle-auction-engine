import { apiData, apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { StudentSummary, User } from '../types/user'
import type { Bicycle } from '../types/bicycle'

const API = 'http://127.0.0.1:8000/api/v1'

interface BicyclesPageProps {
  user: User
  onLogout: () => void
}

export default function BicyclesPage({ user, onLogout }: BicyclesPageProps) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [users, setUsers] = useState<StudentSummary[]>([])
  const [form, setForm] = useState({
    asset_tag: '',
    brand: '',
    model: '',
    color: '',
    owner_id: '',
    found_location: '',
  })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  const navigate = useNavigate()
  const [lookupToken, setLookupToken] = useState('')
  const isStudent = user.role === 'student'
  const isGuard = user.role === 'guard'
  const isAuthority = user.role === 'admin' || user.role === 'super_admin'
  const studentUsers = users

  const load = useCallback(async () => {
    if (isGuard) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const [bRes, uRes] = await Promise.all([
        apiFetch(`${API}/bicycles/`),
        isStudent ? Promise.resolve(null) : apiFetch(`${API}/auth/students`),
      ])
      if (!bRes.ok) throw new Error('Could not load bicycles')
      const b = await bRes.json()
      const u = uRes ? await uRes.json() : []
      
      const loadedBikes: Bicycle[] = Array.isArray(b) ? b : []
      const filteredBikes = isStudent
        ? loadedBikes.filter((bike) => (bike.current_owner_id ?? bike.owner_id) === user.id)
        : loadedBikes

      setBicycles(filteredBikes)
      setUsers(Array.isArray(u) ? u : [])
    } catch {
      setMsg({ text: 'Error connecting to backend services', isError: true })
    } finally {
      setLoading(false)
    }
  }, [user.id, isStudent, isGuard])

  useEffect(() => {
    load()
  }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    
    const assignedOwnerId = form.owner_id ? Number(form.owner_id) : null

    const payload = {
      asset_tag: form.asset_tag,
      brand: form.brand || null,
      model: form.model || null,
      color: form.color || null,
      found_location: form.found_location || null,
      owner_id: assignedOwnerId,
    }

    try {
      const res = await apiFetch(editingId ? `${API}/bicycles/${editingId}` : `${API}/bicycles/`, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setMsg({ text: editingId ? 'Bicycle updated successfully' : 'Bicycle registered successfully', isError: false })
        setForm({ asset_tag: '', brand: '', model: '', color: '', owner_id: '', found_location: '' })
        setEditingId(null)
        load()
      } else {
        const err = await res.json()
        setMsg({ text: err.detail || 'Error saving bicycle record', isError: true })
      }
    } catch {
      setMsg({ text: 'Failed to communicate with server', isError: true })
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Are you sure you want to delete this bicycle?')) return
    try {
      const res = await apiFetch(`${API}/bicycles/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setMsg({ text: 'Bicycle deleted', isError: false })
        load()
      } else {
        const err = await res.json()
        setMsg({ text: err.detail || 'Delete failed', isError: true })
      }
    } catch {
      setMsg({ text: 'Delete failed', isError: true })
    }
  }

  const transfer = async (id: number, newOwnerId: string) => {
    try {
      const res = await apiFetch(`${API}/bicycles/${id}/transfer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_owner_id: newOwnerId ? Number(newOwnerId) : null,
          actor_id: user.id,
        }),
      })
      if (res.ok) {
        setMsg({ text: 'Ownership transferred successfully', isError: false })
        load()
      } else {
        const err = await res.json()
        setMsg({ text: err.detail || 'Ownership transfer failed', isError: true })
      }
    } catch {
      setMsg({ text: 'Ownership transfer failed', isError: true })
    }
  }

  const lookup = (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    apiData<Bicycle>(`/bicycles/scan/lookup?token=${encodeURIComponent(lookupToken.trim())}`)
      .then((bike) => navigate(`/bicycles/${bike.id}`)).catch((err: Error) => setMsg({ text: err.message, isError: true }))
  }

  const lookupCard = (
    <div className="card-wide">
      <h3>Find a Bicycle</h3>
      <p className="subtitle">Scan or type a QR token, asset tag, or chassis / serial number. Looking up a bicycle never changes it.</p>
      <form onSubmit={lookup} className="form-inline">
        <input placeholder="QR token / asset tag / serial number *" value={lookupToken} onChange={(e) => setLookupToken(e.target.value)} required />
        <button type="submit" className="btn-submit btn-sm">Find Bicycle</button>
      </form>
    </div>
  )

  if (isGuard) return (
    <div className="page-wide">
      <PageHeader badge="Guard" title="Bicycle Lookup" role={user.role} onLogout={onLogout} links={[{ to: '/dashboard', label: 'Dashboard' }]} />
      {msg && <div className="alert alert-error">{msg.text}</div>}
      {lookupCard}
    </div>
  )

  return (
    <div className="page-wide">
      <PageHeader
        badge={isStudent ? 'My Cycles' : 'Campus Fleet'}
        title={isStudent ? 'My Registered Bicycles' : 'Bicycles & Asset Registry'}
        role={user.role}
        onLogout={onLogout}
        links={[
          { to: '/auctions', label: 'Auctions' },
          { to: '/dashboard', label: 'Dashboard' },
          { to: '/bicycles/registrations', label: isStudent ? 'Register New Cycle' : 'Review Registrations', visible: isStudent || isAuthority },
        ]}
      />

      {msg && (
        <div className={`alert ${msg.isError ? 'alert-error' : 'alert-success'}`}>
          {msg.text}
        </div>
      )}

      {isAuthority && lookupCard}

      {!isStudent && <div className="card-wide">
        <h3>{editingId ? `Edit Bicycle #${editingId}` : 'Register New Campus Bicycle'}</h3>
        <p className="subtitle">
          Register a found or campus fleet bicycle.
        </p>
        <form onSubmit={save} className="form-inline">
          <input
            placeholder="Asset Tag (e.g. BIKE-001) *"
            value={form.asset_tag}
            onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
            required
          />
          <input
            placeholder="Brand (e.g. Trek, Hero)"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
          <input
            placeholder="Model (e.g. Sprint 200)"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <input
            placeholder="Color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
          <input
            placeholder="Found Location / Hostel Stand"
            value={form.found_location}
            onChange={(e) => setForm({ ...form, found_location: e.target.value })}
          />

          <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
            <option value="">No Owner (Found / Impounded Asset)</option>
            {studentUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>

          <button type="submit" className="btn-submit btn-sm">
            {editingId ? 'Save Changes' : '+ Register Bicycle'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn-toggle"
              onClick={() => {
                setEditingId(null)
                setForm({ asset_tag: '', brand: '', model: '', color: '', owner_id: '', found_location: '' })
              }}
            >
              Cancel
            </button>
          )}
        </form>
      </div>}

      <div className="card-wide">
        <div className="detail-header-flex">
          <div>
            <h3>{isStudent ? 'My Registered Fleet' : 'Bicycle Fleet Directory'}</h3>
            <p className="subtitle">
              {isStudent
                ? 'Only bicycles registered to your student account are displayed here.'
                : 'Select any cycle to view its detailed lifecycle engine timeline, manage state transitions, or submit to auction.'}
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Total: {bicycles.length} {isStudent ? 'owned' : 'registered'}
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: '24px', textAlign: 'center' }}>Loading bicycles...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Tag / ID</th>
                  <th>Make & Model</th>
                  <th>Color</th>
                  <th>{isAuthority ? 'Lifecycle Status' : 'Status'}</th>
                  {isAuthority && <th>Owner (Transfer)</th>}
                  <th>Lifecycle Engine</th>
                  {isAuthority && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {bicycles.length === 0 ? (
                  <tr>
                    <td colSpan={isAuthority ? 7 : 5} style={{ textAlign: 'center', padding: '32px' }}>
                      {isStudent
                        ? 'You have not registered any bicycles yet. Use Register New Cycle to submit a request.'
                        : 'No bicycles registered yet.'}
                    </td>
                  </tr>
                ) : (
                  bicycles.map((b) => {

                    return (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.asset_tag}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID #{b.id}</div>
                        </td>
                        <td>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</td>
                        <td>{b.color || '—'}</td>
                        <td>
                          {isAuthority ? (
                            <span className={`status-badge status-${b.status}`}>
                              {b.status?.toUpperCase()}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.85rem' }}>{b.message || 'Registered'}</span>
                          )}
                        </td>
                        {isAuthority && (
                        <td>
                          <select className="inline-select" value={b.owner_id ? String(b.owner_id) : ''} onChange={(e) => transfer(b.id, e.target.value)}>
                            <option value="">No Owner</option>
                            {studentUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                          </select>
                        </td>
                        )}
                        <td>
                          <Link to={`/bicycles/${b.id}`} className="btn-lifecycle-link">
                            {isAuthority ? 'Manage State →' : 'View Details →'}
                          </Link>
                        </td>
                        {isAuthority && (
                        <td>
                          <button type="button" className="btn-link" onClick={() => {
                            setEditingId(b.id)
                            setForm({ asset_tag: b.asset_tag || '', brand: b.brand || '', model: b.model || '', color: b.color || '',
                              owner_id: b.owner_id ? String(b.owner_id) : '', found_location: b.found_location || '' })
                          }}>Edit</button>
                          <button type="button" className="btn-link btn-danger" onClick={() => remove(b.id)}>Delete</button>
                        </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}