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
  status: CycleState | string
  owner_id?: number | null
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
