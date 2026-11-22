import { authStorage } from './authStorage'

export const API_BASE = 'http://127.0.0.1:8000/api/v1'

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

export async function apiData<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_BASE}${path}`, options)
  const data = await response.json()
  if (!response.ok) {
    const detail = data.detail
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((issue: { loc: string[]; msg: string }) => `${issue.loc.at(-1)}: ${issue.msg}`).join(', ')
      : 'The request could not be completed.')
  }
  return data
}

export const jsonRequest = (method: string, data: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
})