import type { Auction, Bid } from '../types/auction'
import { API_BASE } from './api'

export const AUCTION_API = `${API_BASE}/auctions`
export const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
export const isAuctionLive = (auction: Auction, now = Date.now()) =>
    ['scheduled', 'active', 'extended'].includes(auction.status) &&
    new Date(auction.starts_at).getTime() <= now && now < new Date(auction.ends_at).getTime()
export const nextBid = (auction: Auction) => auction.current_winner_id != null
    ? Math.round((auction.current_highest_bid + auction.min_bid_increment) * 100) / 100
    : auction.starting_price

export function poolBidders(bids: Bid[], userId: number) {
    const best = new Map<number, number>()
    for (const bid of bids) best.set(bid.bidder_id, Math.max(best.get(bid.bidder_id) ?? 0, bid.amount))
    const leaders = [...best].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return [
        { id: userId, amount: best.get(userId) ?? null },
        ...leaders.filter(([id]) => id !== userId).map(([id, amount]) => ({ id, amount })),
    ]
}