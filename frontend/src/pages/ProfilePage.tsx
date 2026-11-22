import { useEffect, useState, type FormEvent } from 'react'
import HostelSelect from '../components/HostelSelect'
import { apiData, jsonRequest } from '../lib/api'
import type { Hostel, User } from '../types/user'

interface Props {
  user: User
  onSave: (user: User) => void
  onLogout: () => void
}

export default function ProfilePage({ user, onSave, onLogout }: Props) {
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [hostelId, setHostelId] = useState(String(user.hostel_id ?? ''))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    apiData<Hostel[]>('/auth/hostels').then(setHostels).catch((err: Error) => setError(err.message))
  }, [attempt])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try {
      onSave(await apiData<User>('/auth/me/profile', jsonRequest('PUT', fields)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Complete your student profile</h2>
        <p className="subtitle">Fill in your details to access the dashboard.</p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form onSubmit={save}>
          <label className="field">Roll number
            <input required name="roll_number" maxLength={30} defaultValue={user.roll_number ?? ''} />
          </label>
          <label className="field">Degree course
            <input required name="degree_course" maxLength={100} defaultValue={user.degree_course ?? ''} />
          </label>
          <label className="field">Hostel
            <HostelSelect name="hostel_id" hostels={hostels} value={hostelId} onChange={(event) => setHostelId(event.target.value)} />
          </label>
          <label className="field">Phone number
            <input required type="tel" name="phone_number" defaultValue={user.phone_number ?? ''} placeholder="+919876543210" />
          </label>
          <button className="btn-submit" disabled={saving || !hostels.length}>Save and continue</button>
        </form>
        {error && !hostels.length && <button className="btn-link" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry hostel lookup</button>}
        <button className="btn-link" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  )
}