import { apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '../types/user'
import type { Bicycle } from '../types/bicycle'

const API = 'http://127.0.0.1:8000/api/v1'

interface BicyclesPageProps {
  user: User
  onLogout: () => void
}

export default function BicyclesPage({ user, onLogout }: BicyclesPageProps) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [users, setUsers] = useState<User[]>([])
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

  const isStudent = user.role === 'student'
  const isAuthority = user.role === 'admin' || user.role === 'super_admin'
  const studentUsers = users.filter((u) => u.role === 'student')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [bRes, uRes] = await Promise.all([
        apiFetch(`${API}/bicycles/`),
        apiFetch(`${API}/auth/users`),
      ])
      const b = await bRes.json()
      const u = await uRes.json()
      
      const loadedBikes: Bicycle[] = Array.isArray(b) ? b : []
      // If student, strictly guarantee only own bicycles are displayed
      const filteredBikes = isStudent
        ? loadedBikes.filter((bike) => bike.owner_id === user.id)
        : loadedBikes

      setBicycles(filteredBikes)
      setUsers(Array.isArray(u) ? u : [])
    } catch {
      setMsg({ text: 'Error connecting to backend services', isError: true })
    } finally {
      setLoading(false)
    }
  }, [user.id, isStudent])

  useEffect(() => {
    load()
  }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    
    // Students can only register bicycles under their own user account
    const assignedOwnerId = isStudent ? user.id : (form.owner_id ? Number(form.owner_id) : null)

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
        ]}
      />

      {msg && (
        <div className={`alert ${msg.isError ? 'alert-error' : 'alert-success'}`}>
          {msg.text}
        </div>
      )}

      {/* Add / Edit Bicycle Form */}
      <div className="card-wide">
        <h3>{editingId ? `Edit Bicycle #${editingId}` : (isStudent ? 'Register My Bicycle' : 'Register New Campus Bicycle')}</h3>
        <p className="subtitle">
          {isStudent
            ? 'Add your bicycle to the campus database. It will be protected under your active degree program.'
            : 'Guards and Admins cannot own bicycles. You may register found/campus fleet assets or assign them to enrolled students.'}
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

          {/* Non-students can pick an enrolled student as owner, or leave unowned */}
          {!isStudent && (
            <select
              value={form.owner_id}
              onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
            >
              <option value="">No Owner (Found / Impounded Asset)</option>
              {studentUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          )}

          <button type="submit" className="btn-submit btn-sm">
            {editingId ? 'Save Changes' : (isStudent ? '+ Register My Bicycle' : '+ Register Bicycle')}
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
      </div>

      {/* Inventory & Lifecycle Table */}
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
                  <th>Lifecycle Status</th>
                  <th>Owner (Transfer)</th>
                  <th>Lifecycle Engine</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bicycles.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px' }}>
                      {isStudent
                        ? 'You have not registered any bicycles yet. Use the form above to register your cycle.'
                        : 'No bicycles registered yet.'}
                    </td>
                  </tr>
                ) : (
                  bicycles.map((b) => {
                    const isOwner = b.owner_id === user.id
                    const canTransfer = isAuthority || isOwner
                    const ownerUser = users.find((u) => u.id === b.owner_id)

                    return (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.asset_tag}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID #{b.id}</div>
                        </td>
                        <td>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</td>
                        <td>{b.color || '—'}</td>
                        <td>
                          <span className={`status-badge status-${b.status.toLowerCase()}`}>
                            {b.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {canTransfer ? (
                            <select
                              className="inline-select"
                              value={b.owner_id ? String(b.owner_id) : ''}
                              onChange={(e) => transfer(b.id, e.target.value)}
                            >
                              <option value="">No Owner (Unclaimed)</option>
                              {studentUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name} {u.id === user.id ? '(You)' : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {ownerUser ? ownerUser.full_name : 'No Owner'} (Locked)
                            </span>
                          )}
                        </td>
                        <td>
                          <Link to={`/bicycles/${b.id}`} className="btn-lifecycle-link">
                            Manage State →
                          </Link>
                        </td>
                        <td>
                          {(isOwner || isAuthority) ? (
                            <>
                              <button
                                type="button"
                                className="btn-link"
                                onClick={() => {
                                  setEditingId(b.id)
                                  setForm({
                                    asset_tag: b.asset_tag || '',
                                    brand: b.brand || '',
                                    model: b.model || '',
                                    color: b.color || '',
                                    owner_id: b.owner_id ? String(b.owner_id) : '',
                                    found_location: b.found_location || '',
                                  })
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-link btn-danger"
                                onClick={() => remove(b.id)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
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
