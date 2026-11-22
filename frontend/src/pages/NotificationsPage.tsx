import { apiData } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '../types/user'

interface Notification {
  id: number
  bicycle_id?: number | null
  message: string
  is_read: boolean
  created_at: string
}

export default function NotificationsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [error, setError] = useState('')
  const load = useCallback(() => apiData<Notification[]>('/notifications').then(setNotifications)
    .catch(() => setError('Could not load notifications.')), [])

  useEffect(() => { load() }, [load])

  const markRead = (id: number) => apiData(`/notifications/${id}/read`, { method: 'POST' }).then(load)
    .catch(() => setError('Could not mark the notification as read.'))

  return (
    <div className="page-wide">
      <PageHeader title="Notifications" role={user.role} onLogout={onLogout} />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card-wide">
        {notifications.length === 0 ? <p className="subtitle">You have no notifications.</p> : (
          <table className="simple-table">
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} style={{ fontWeight: n.is_read ? 400 : 600 }}>
                  <td>{n.message}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString()}</td>
                  <td>{n.bicycle_id && <Link to={`/bicycles/${n.bicycle_id}`} className="btn-link">View bicycle</Link>}</td>
                  <td>{!n.is_read && <button type="button" className="btn-link" onClick={() => markRead(n.id)}>Mark as read</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
