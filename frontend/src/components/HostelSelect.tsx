import type { ComponentProps } from 'react'
import type { Hostel } from '../types/user'

export default function HostelSelect({ hostels, ...props }: ComponentProps<'select'> & { hostels: Hostel[] }) {
  return (
    <select {...props} required>
      <option value="">Select hostel</option>
      {hostels.map((hostel) => <option key={hostel.id} value={hostel.id}>{hostel.name}</option>)}
    </select>
  )
}