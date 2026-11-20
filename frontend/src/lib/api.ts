import { authStorage } from './authStorage'

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = authStorage.getToken()
  if (!token) {
    authStorage.clearUser()
    throw new Error('Please log in.')
  }
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...options, headers })
  // An old request must not log out a newly signed-in session.
  if (response.status === 401 && authStorage.getToken() === token) {
    authStorage.clearUser()
  }
  return response
}
