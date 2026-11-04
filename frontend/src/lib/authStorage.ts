import type { User } from '../types/user'

const STORAGE_KEY = 'cycle_engine_user'

export const authStorage = {
  getUser: (): User | null => {
    try {
      const data = sessionStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  setUser: (user: User | null): void => {
    try {
      if (user) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      } else {
        sessionStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // storage quota or disabled
    }
  },
  clearUser: (): void => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}
