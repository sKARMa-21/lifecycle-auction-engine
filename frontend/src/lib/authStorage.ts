import type { User } from '../types/user'

// The session is persisted in localStorage so a page refresh keeps the user signed in.
// An expired token is discarded on load; any 401 from the API also clears the session (see api.ts).
const STORAGE_KEY = 'auth_session'

interface Session {
  user: User
  token: string
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (session?.user && session?.token && !tokenExpired(session.token)) return session
  } catch {
    // Corrupt or inaccessible storage: treat as signed out.
  }
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  return null
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (e.g. private mode): the session still works in memory.
  }
}

let session: Session | null = readSession()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

// Keep tabs in sync: logging in or out in one tab applies to the others.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  session = readSession()
  notify()
})

export const authStorage = {
  getUser: () => session?.user ?? null,
  getToken: () => session?.token ?? null,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  setSession: (nextUser: User, accessToken: string) => {
    session = { user: nextUser, token: accessToken }
    writeSession(session)
    notify()
  },
  clearUser: () => {
    session = null
    writeSession(null)
    notify()
  },
}
