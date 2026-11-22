import { apiData, jsonRequest } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { Hostel, User } from '../types/user'

interface AuctionRequest {
  id: number
  bicycle_id: number
  student_id: number
  hostel_id?: number | null
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  note?: string | null
  created_at: string
}

type Action = 'approve' | 'reject' | 'withdraw'

export default function RequestsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const isStudent = user.role === 'student'
  const [requests, setRequests] = useState<AuctionRequest[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [hostels, setHostels] = useState<Hostel[]>([])
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const load = useCallback(() => apiData<AuctionRequest[]>('/auction-requests').then(setRequests)
    .catch(() => setMsg({ text: 'Could not load auction requests.', isError: true })), [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!isStudent) apiData<Hostel[]>('/auth/hostels').then(setHostels).catch(() => setHostels([]))
  }, [isStudent])

  const act = async (id: number, action: Action, success: string) => {
    setMsg(null)
    try {
      await apiData(`/auction-requests/${id}/${action}`, jsonRequest('POST', action === 'withdraw' ? {} : { note: notes[id] || null }))
      setMsg({ text: success, isError: false })
      load()
    } catch (err) {
      setMsg({ text: (err as Error).message, isError: true })
    }
  }
  const button = (r: AuctionRequest, action: Action, label: string, success: string, danger = false) => (
    <button type="button" className={`btn-link${danger ? ' btn-danger' : ''}`} onClick={() => act(r.id, action, success)}>{label}</button>
  )

  return (
    <div className="page-wide">
      <PageHeader badge={isStudent ? 'My Auctions' : 'Approval Queue'} title={isStudent ? 'My Auction Requests' : 'Auction Requests'}
        role={user.role} onLogout={onLogout}
        links={[{ to: '/bicycles', label: isStudent ? 'My Bicycles' : 'Fleet Registry' }, { to: '/dashboard', label: 'Dashboard' }]} />
      {msg && <div className={`alert ${msg.isError ? 'alert-error' : 'alert-success'}`}>{msg.text}</div>}
      <div className="card-wide">
        <p className="subtitle">
          {isStudent
            ? 'Request an auction from your bicycle\'s page. You can withdraw a pending request, or take your bicycle back before an auction is launched.'
            : 'Approving moves the bicycle into the auction pool. You still launch the auction yourself.'}
        </p>
        {requests.length === 0 ? <p className="subtitle">No auction requests.</p> : (
          <table className="simple-table">
            <thead>
              <tr><th>Bicycle</th>{!isStudent && <th>Student / Hostel</th>}<th>Requested</th><th>Status</th><th>Note</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const pending = r.status === 'pending'
                return (
                  <tr key={r.id}>
                    <td><Link to={`/bicycles/${r.bicycle_id}`}>Bicycle #{r.bicycle_id}</Link></td>
                    {!isStudent && <td>Student #{r.student_id} · {hostels.find((h) => h.id === r.hostel_id)?.name ?? 'No hostel'}</td>}
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td><span className={`status-badge status-${r.status}`}>{r.status.toUpperCase()}</span></td>
                    <td>{!isStudent && pending
                      ? <input placeholder="Reason (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                      : r.note || '—'}</td>
                    <td>
                      {!isStudent && pending && <>
                        {button(r, 'approve', 'Approve', 'Approved. The bicycle is now in the auction pool.')}
                        {button(r, 'reject', 'Reject', 'Request rejected.', true)}
                      </>}
                      {isStudent && pending && button(r, 'withdraw', 'Withdraw', 'Request withdrawn.', true)}
                      {isStudent && r.status === 'approved' && button(r, 'withdraw', 'Take bicycle back', 'Your bicycle is back with you.')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
