import type { User } from '../types/user'

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
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (session?.user && session?.token && !tokenExpired(session.token)) return session
  } catch {
  }
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  return null
}

function writeSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
  }
}

let session: Session | null = readSession()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

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
