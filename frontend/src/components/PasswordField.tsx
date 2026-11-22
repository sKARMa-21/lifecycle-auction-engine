import { useId, useState, type ComponentProps } from 'react'

export default function PasswordField({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input {...props} id={id} type={shown ? 'text' : 'password'} required />
        <button type="button" className="btn-link" onClick={() => setShown(!shown)}
          aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={id}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" />
            <circle cx="12" cy="12" r="2.5" />
            {shown && <path d="m3 3 18 18" />}
          </svg>
        </button>
      </div>
    </div>
  )
}