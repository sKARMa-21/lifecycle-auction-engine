import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiData } from '../lib/api'
import type { Bicycle } from '../types/bicycle'

export default function BicycleLookup({ autoFocus = false }: { autoFocus?: boolean }) {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function lookup(event: FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    const code = token.trim().match(/\/s\/([^/?#]+)/)?.[1] ?? token.trim()
    setError('')
    setLoading(true)
    try {
      const bicycle = await apiData<Bicycle>(`/bicycles/scan/lookup?token=${encodeURIComponent(code)}`)
      navigate(`/bicycles/${bicycle.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card-wide">
      <h3>Scan or find a bicycle</h3>
      <p className="subtitle">Scan the QR sticker or enter its token, asset tag, or serial number.</p>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <form className="form-inline" onSubmit={lookup}>
        <input aria-label="QR token, asset tag, or serial number" placeholder="QR token, asset tag, or serial number"
          autoFocus={autoFocus} autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} required />
        <button type="submit" className="btn-submit btn-sm" disabled={loading}>{loading ? 'Searching…' : 'Find bicycle'}</button>
      </form>
    </section>
  )
}
