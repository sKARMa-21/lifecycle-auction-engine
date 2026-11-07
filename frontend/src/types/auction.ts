export type AuctionStatus = 'active' | 'extended' | 'ended' | 'cancelled'

export interface Bid {
  id: number
  auction_id: number
  bidder_id: number
  amount: number
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
  ends_at: string
  status: AuctionStatus
  created_at: string
  bids?: Bid[]
}
