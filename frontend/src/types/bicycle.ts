export interface Bicycle {
  id: number
  asset_tag: string
  serial_number?: string | null
  brand?: string | null
  model?: string | null
  color?: string | null
  description?: string | null
  found_location?: string | null
  status: string
  owner_id?: number | null
  created_at?: string
  updated_at?: string
}

