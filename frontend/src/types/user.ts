export type UserRole = 'super_admin' | 'admin' | 'guard' | 'student'

export interface Hostel {
  id: number
  code: string
  name: string
}

export interface StudentSummary {
  id: number
  full_name: string
}

export interface User extends StudentSummary {
  email: string
  role: UserRole | string
  is_active?: boolean | null
  hostel_id?: number | null
  roll_number?: string | null
  degree_course?: string | null
  phone_number?: string | null
  profile_complete: boolean
}
