import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiData } from '../lib/api'
import type { Bicycle } from '../types/bicycle'

export default function BicycleLookup({ autoFocus = false, camera = false }: { autoFocus?: boolean; camera?: boolean }) {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function lookup(source: string | File) {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    const { signal } = controller
    setError('')
    setLoading(true)
    try {
      let identifier: string
      if (typeof source === 'string') {
        identifier = source.trim()
      } else {
        const { readQR } = await import('../lib/readQR')
        identifier = await readQR(source, signal)
      }
      if (!identifier || signal.aborted) return
      if (typeof source !== 'string') setToken(identifier)
      const bicycle = await apiData<Bicycle>(`/bicycles/scan/lookup?token=${encodeURIComponent(identifier)}`, { signal })
      if (!signal.aborted) navigate(`/bicycles/${bicycle.id}`)
    } catch (err) {
      if (!signal.aborted) setError((err as Error).message)
    } finally {
      request.current = null
      if (!signal.aborted) setLoading(false)
    }
  }

  return (
    <section className="card-wide">
      <h3>Scan or find a bicycle</h3>
      <p className="subtitle">{camera ? 'Take a photo of the QR sticker or enter its token, asset tag, or serial number.' :
        'Scan the QR sticker or enter its token, asset tag, or serial number.'}</p>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <form className="form-inline" onSubmit={(event) => { event.preventDefault(); void lookup(token) }}>
        {camera && <>
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => cameraInput.current?.click()}>Scan QR code</button>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => {
            const photo = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (photo) void lookup(photo)
          }} />
        </>}
        <input aria-label="QR token, asset tag, or serial number" placeholder="QR token, asset tag, or serial number"
          autoFocus={autoFocus} autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} required disabled={loading} />
        <button type="submit" className="btn-submit btn-sm" disabled={loading}>{loading ? 'Searching…' : 'Find bicycle'}</button>
      </form>
    </section>
  )
}
