import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { API_BASE, apiData, apiFetch, jsonRequest } from '../lib/api'
import type { User } from '../types/user'

const path = '/bicycle-registrations'
const photos = [
  ['chassis', 'Chassis number photo'],
  ['front', 'Whole bicycle from the front'],
  ['side', 'Whole bicycle from the side'],
] as const

interface Registration {
  id: number
  student_id: number
  hostel_id: number
  serial_number: string
  brand: string
  model: string
  color: string
  status: 'pending' | 'approved' | 'rejected'
  reason: string | null
  bicycle_id: number | null
}

function PhotoInput({ name, label }: { name: string; label: string }) {
  const [preview, setPreview] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  return (
    <label className="field">{label}
      <input name={name} type="file" accept="image/jpeg,image/png,image/webp" required
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.setCustomValidity(file && file.size > 2 * 1024 * 1024 ? 'Choose a photo of 2 MB or less.' : '')
          setPreview(file && file.size <= 2 * 1024 * 1024 ? URL.createObjectURL(file) : '')
        }} />
      {preview && <img src={preview} alt={label} style={{ width: '100%', maxWidth: 160, maxHeight: 100, objectFit: 'contain' }} />}
    </label>
  )
}

function ReviewPhotos({ id }: { id: number }) {
  const [images, setImages] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const urls: string[] = []
    Promise.all(photos.map(async ([kind]) => {
      const res = await apiFetch(`${API_BASE}${path}/${id}/photos/${kind}`, { signal: controller.signal })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      if (controller.signal.aborted) return [kind, '']
      const url = URL.createObjectURL(blob)
      urls.push(url)
      return [kind, url]
    })).then((entries) => {
      if (!controller.signal.aborted) setImages(Object.fromEntries(entries))
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => {
      controller.abort()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [id])
  if (failed) return <p className="alert alert-error" role="alert">Could not load the registration photos.</p>
  if (!Object.keys(images).length) return <p role="status">Loading photos…</p>
  return (
    <div className="form-inline">
      {photos.map(([kind, label]) => (
        <a key={kind} href={images[kind]} target="_blank" rel="noreferrer">
          <img src={images[kind]} alt={label} style={{ width: 190, height: 140, objectFit: 'contain' }} />
        </a>
      ))}
    </div>
  )
}

export default function RegistrationsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const student = user.role === 'student'
  const [requests, setRequests] = useState<Registration[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(student)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    apiData<Registration[]>(path, { signal: controller.signal }).then(setRequests).catch((err: Error) => {
      if (!controller.signal.aborted) setError(err.message)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function save(event: FormEvent<HTMLFormElement>, id?: number) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const decision = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updated = id === undefined
        ? await apiData<Registration>(path, { method: 'POST', body: fields })
        : await apiData<Registration>(`${path}/${id}`, jsonRequest('PATCH', { decision, reason: fields.get('reason') }))
      setRequests((current) => [updated, ...current.filter((request) => request.id !== updated.id)])
      if (id === undefined) setShowForm(false)
      setMessage(id === undefined ? 'Submitted to your hostel admin.' : 'Decision saved.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-wide">
      <PageHeader title={student ? 'Cycle registration' : 'Review cycle registrations'} role={user.role} onLogout={onLogout} />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      {student && !showForm && (
        <button type="button" className="btn-secondary" onClick={() => setShowForm(true)}>Register New Cycle</button>
      )}
      {student && showForm && (
        <div className="card-wide">
          <h3>Register New Cycle</h3>
          <p className="subtitle">Your hostel admin will review your details and photos. Each image can be up to 2 MB.</p>
          <form className="registration-form" onSubmit={(event) => void save(event)}>
            <div className="registration-fields">
              {[['serial_number', 'Chassis number', 120], ['brand', 'Brand', 100],
                ['model', 'Model', 100], ['color', 'Color', 60]].map(([name, label, length]) => (
                <label key={name} className="field">{label}<input name={String(name)} maxLength={Number(length)} required /></label>
              ))}
            </div>
            <div className="registration-uploads">
              {photos.map(([kind, label]) => <PhotoInput key={kind} name={kind} label={label} />)}
            </div>
            <button className="btn-submit btn-sm" disabled={busy}>{busy ? 'Submitting…' : 'Submit for approval'}</button>
          </form>
        </div>
      )}
      <div className="card-wide">
        <h3>{student ? 'My registration requests' : 'Registration requests'}</h3>
        {loading ? <p role="status">Loading requests…</p> : !requests.length && !error && <p>No requests yet.</p>}
        {requests.map((request) => (
          <div className="meta-list" key={request.id}>
            <div className="meta-row">
              <strong>{request.brand} {request.model} · {request.color} · {request.serial_number}</strong>
              <span>{request.status}</span>
            </div>
            {!student && <p>Student #{request.student_id} · Hostel #{request.hostel_id}</p>}
            {request.reason && <p>{request.reason}</p>}
            {request.bicycle_id && <Link to={`/bicycles/${request.bicycle_id}`}>View registered bicycle</Link>}
            {!student && (
              <button type="button" className="btn-link" aria-expanded={selected === request.id}
                onClick={() => setSelected(selected === request.id ? null : request.id)}>
                {selected === request.id ? 'Hide photos' : 'Review photos'}
              </button>
            )}
            {selected === request.id && (
              <>
                <ReviewPhotos id={request.id} />
                {request.status === 'pending' && (
                  <form onSubmit={(event) => void save(event, request.id)} className="form-inline">
                    <label className="field">Rejection reason <input name="reason" maxLength={500} /></label>
                    <button type="submit" value="approve" className="btn-submit btn-sm" disabled={busy}>Approve</button>
                    <button type="submit" value="reject" className="btn-secondary btn-sm" disabled={busy}>Reject</button>
                  </form>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
