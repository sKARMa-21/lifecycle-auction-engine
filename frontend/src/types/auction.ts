export type AuctionStatus = 'draft' | 'scheduled' | 'active' | 'extended' | 'ended' | 'settled' | 'cancelled'

export interface Bid {
  id: number
  auction_id: number
  bidder_id: number
  amount: number
  status?: string
  placed_at: string
}

export interface Auction {
  id: number
  bicycle_id: number
  created_by_id: number
  title: string
  starting_price: number
  current_highest_bid: number
  current_winner_id?: number | null
  min_bid_increment: number
  starts_at: string
  ends_at: string
  payment_deadline?: string | null
  anti_snipe_trigger_window?: number
  anti_snipe_extension_minutes?: number
  status: AuctionStatus
  created_at: string
  bids?: Bid[]
}

export interface AuctionBidEvent {
  type: 'NEW_BID'
  bidder_id: number
  amount: number
  ends_at: string
  extended: boolean
}
