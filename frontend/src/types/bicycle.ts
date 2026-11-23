export type CycleState = 'active' | 'asset' | 'auctionable' | 'sold' | 'dead'

export interface Bicycle {
  id: number
  asset_tag: string
  serial_number?: string | null
  brand?: string | null
  model?: string | null
  color?: string | null
  description?: string | null
  found_location?: string | null
  status?: CycleState | string
  claim_deadline?: string | null
  case_hostel_id?: number | null
  actions: string[]
  message?: string | null
  owner_id?: number | null
  current_owner_id?: number | null
  reported_by_id?: number | null
  asset_tagged_at?: string | null
  qr_token?: string | null
  cycle_condition?: string | null
  market_value?: number | string | null
  years_used?: number | null
  base_price_set?: number | string | null
  sold_price?: number | string | null
  created_at: string
  updated_at: string
}

export interface LifecycleEvent {
  id: number
  bicycle_id: number
  actor_id?: number | null
  actor_name?: string | null
  from_state: string
  to_state: string
  location?: string | null
  notes?: string | null
  proof_image_url?: string | null
  created_at: string
}
