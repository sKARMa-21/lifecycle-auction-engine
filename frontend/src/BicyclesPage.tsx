import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { User } from './types/user'
import type { Bicycle } from './types/bicycle'

const API = 'http://127.0.0.1:8000/api/v1'

export default function BicyclesPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ asset_tag: '', brand: '', model: '', color: '', owner_id: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const [b, u] = await Promise.all([
      fetch(`${API}/bicycles/`).then((r) => r.json()),
      fetch(`${API}/auth/users`).then((r) => r.json()),
    ])
    setBicycles(Array.isArray(b) ? b : [])
    setUsers(Array.isArray(u) ? u : [])
  }

  useEffect(() => { load() }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      asset_tag: form.asset_tag,
      brand: form.brand || null,
      model: form.model || null,
      color: form.color || null,
      owner_id: form.owner_id ? Number(form.owner_id) : null,
    }

    const res = await fetch(editingId ? `${API}/bicycles/${editingId}` : `${API}/bicycles/`, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setMsg(editingId ? 'Updated' : 'Added')
      setForm({ asset_tag: '', brand: '', model: '', color: '', owner_id: '' })
      setEditingId(null)
      load()
    } else {
      const err = await res.json()
      setMsg(err.detail || 'Error saving')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this bicycle?')) return
    await fetch(`${API}/bicycles/${id}`, { method: 'DELETE' })
    load()
  }

  const transfer = async (id: number, newOwnerId: string) => {
    await fetch(`${API}/bicycles/${id}/transfer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_id: newOwnerId ? Number(newOwnerId) : null }),
    })
    setMsg('Ownership updated')
    load()
  }

  return (
    <div className="page-wide">
      <header className="bar">
        <div>
          <span className="brand-badge">CycleEngine</span>
          <h2>Bicycles</h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <Link to="/dashboard" className="btn-toggle">Dashboard</Link>
          <button type="button" className="btn-toggle" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      {msg && <div className="alert">{msg}</div>}

      <div className="card-wide">
        <h3>{editingId ? `Edit Bicycle #${editingId}` : 'Add Bicycle'}</h3>
        <form onSubmit={save} className="form-inline">
          <input
            placeholder="Asset Tag *"
            value={form.asset_tag}
            onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
            required
          />
          <input
            placeholder="Brand"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
          <input
            placeholder="Model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <input
            placeholder="Color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
          <select
            value={form.owner_id}
            onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
          >
            <option value="">No Owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
            ))}
          </select>

          <button type="submit" className="btn-submit btn-sm">
            {editingId ? 'Save' : '+ Add'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn-toggle"
              onClick={() => {
                setEditingId(null)
                setForm({ asset_tag: '', brand: '', model: '', color: '', owner_id: '' })
              }}
            >
              Cancel
            </button>
          )}
        </form>
      </div>

      <div className="card-wide">
        <table className="simple-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tag</th>
              <th>Brand / Model</th>
              <th>Color</th>
              <th>Status</th>
              <th>Owner (Transfer)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bicycles.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>No bicycles found</td></tr>
            ) : (
              bicycles.map((b) => (
                <tr key={b.id}>
                  <td>#{b.id}</td>
                  <td><strong>{b.asset_tag}</strong></td>
                  <td>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</td>
                  <td>{b.color || '—'}</td>
                  <td><span className="role-pill">{b.status}</span></td>
                  <td>
                    <select
                      className="inline-select"
                      value={b.owner_id ? String(b.owner_id) : ''}
                      onChange={(e) => transfer(b.id, e.target.value)}
                    >
                      <option value="">No Owner</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
