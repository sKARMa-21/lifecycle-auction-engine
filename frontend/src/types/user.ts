export type UserRole = 'admin' | 'student' | 'guard'

export interface User {
  id: number
  full_name: string
  email: string
  role: UserRole | string
  degree_type?: string | null
  enrollment_year?: number | null
  degree_duration_years?: number | null
  hostel_name?: string | null
  room_number?: string | null
}
