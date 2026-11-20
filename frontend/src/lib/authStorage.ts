import type { User } from '../types/user'

// Keep credentials in memory: navigating preserves login; reloading requires login.
let user: User | null = null
let token: string | null = null
const listeners = new Set<() => void>()

export const authStorage = {
  getUser: () => user,
  getToken: () => token,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  setSession: (nextUser: User, accessToken: string) => {
    user = nextUser
    token = accessToken
    listeners.forEach((listener) => listener())
  },
  clearUser: () => {
    user = null
    token = null
    listeners.forEach((listener) => listener())
  },
}
