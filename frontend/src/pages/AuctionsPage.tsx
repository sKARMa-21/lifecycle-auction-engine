import PageHeader from '../components/PageHeader'
import AuctionCountdownTimer from '../components/AuctionCountdownTimer'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Auction, AuctionBidEvent } from '../types/auction'
import type { User } from '../types/user'
import { useAuctionSubscriptions } from '../lib/useAuctionWebSocket'

const API = 'http://127.0.0.1:8000/api/v1'

interface LiveBidItem {
  bidderId: number
  amount: number
  time: string
  extended: boolean
}

interface AuctionsPageProps {
  user: User
  onLogout: () => void
}

export default function AuctionsPage({ user, onLogout }: AuctionsPageProps) {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [bidAmounts, setBidAmounts] = useState<Record<number, string>>({})
  const [biddingId, setBiddingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [liveFeeds, setLiveFeeds] = useState<Record<number, LiveBidItem[]>>({})

  const activeAuctionIds = useMemo(
    () => auctions.filter((a) => a.status === 'active' || a.status === 'extended').map((a) => a.id),
    [auctions]
  )

  const handleLiveBid = useCallback((auctionId: number, event: AuctionBidEvent) => {
    setAuctions((prev) =>
      prev.map((auc) => {
        if (auc.id !== auctionId) return auc
        return {
          ...auc,
          current_highest_bid: event.amount,
          current_winner_id: event.bidder_id,
          ends_at: event.ends_at,
          status: event.extended ? 'extended' : auc.status,
        }
      })
    )

    setLiveFeeds((prev) => {
      const existing = prev[auctionId] || []
      const item: LiveBidItem = {
        bidderId: event.bidder_id,
        amount: event.amount,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        extended: event.extended,
      }
      return {
        ...prev,
        [auctionId]: [item, ...existing.slice(0, 3)],
      }
    })
  }, [])

  useAuctionSubscriptions(activeAuctionIds, handleLiveBid)

  const loadAuctions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/auctions/`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        setAuctions(list)
        setLiveFeeds((prev) => {
          const updated = { ...prev }
          list.forEach((auc: Auction) => {
            if (auc.bids && auc.bids.length > 0 && !updated[auc.id]) {
              updated[auc.id] = auc.bids.slice(0, 4).map((b) => ({
                bidderId: b.bidder_id,
                amount: b.amount,
                time: new Date(b.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                extended: false,
              }))
            }
          })
          return updated
        })
      }
    } catch {
      setMsg({ text: 'Unable to connect to auction server.', isError: true })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAuctions()
    const timer = setInterval(loadAuctions, 10000)
    return () => clearInterval(timer)
  }, [loadAuctions])

  const handlePlaceBid = async (auction: Auction) => {
    if (user.role !== 'student') {
      setMsg({
        text: 'Only enrolled students can place bids in cycle auctions. Staff and Admins cannot own or bid on cycles.',
        isError: true,
      })
      return
    }

    const rawVal = bidAmounts[auction.id]
    const amount = Number(rawVal)
    const minRequired =
      auction.current_winner_id !== null && auction.current_winner_id !== undefined
        ? auction.current_highest_bid + auction.min_bid_increment
        : auction.starting_price

    if (!amount || amount < minRequired) {
      setMsg({
        text: `Bid must be at least ₹${minRequired} (Min increment: ₹${auction.min_bid_increment})`,
        isError: true,
      })
      return
    }

    setBiddingId(auction.id)
    setMsg(null)

    try {
      const res = await fetch(`${API}/auctions/${auction.id}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidder_id: user.id,
          amount: amount,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setMsg({ text: `Success! Placed leading bid of ₹${amount}.`, isError: false })
        setBidAmounts((prev) => ({ ...prev, [auction.id]: '' }))
        loadAuctions()
      } else {
        setMsg({ text: data.detail || 'Could not place bid.', isError: true })
      }
    } catch {
      setMsg({ text: 'Error placing bid. Server might be offline.', isError: true })
    } finally {
      setBiddingId(null)
    }
  }

  return (
    <div className="page-wide">
      <PageHeader
        badge="Auction Engine"
        title="Campus Bicycle Auctions"
        role={user.role}
        onLogout={onLogout}
        links={[
          { to: '/bicycles', label: 'Bicycles' },
          { to: '/dashboard', label: 'Dashboard' },
        ]}
      />

      {msg && (
        <div className={`alert ${msg.isError ? 'alert-error' : 'alert-success'}`}>
          {msg.text}
        </div>
      )}

      <div className="card-wide">
        <div className="detail-header-flex">
          <div>
            <h3>Active Bidding Catalog</h3>
            <p className="subtitle">
              Features pessimistic locking against concurrent bids and automatic 5-min anti-snipe deadline extensions.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="btn-toggle"
              onClick={loadAuctions}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        {loading && auctions.length === 0 ? (
          <p style={{ padding: '24px', textAlign: 'center' }}>Loading auctions...</p>
        ) : auctions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p className="subtitle">There are currently no active cycle auctions.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              When bicycles are marked AUCTIONABLE, you or campus admins can launch auctions directly from the Bicycle details page.
            </p>
            <Link to="/bicycles" className="btn-submit" style={{ display: 'inline-block', width: 'auto', marginTop: '16px' }}>
              View Bicycles
            </Link>
          </div>
        ) : (
          <div className="auction-grid">
            {auctions.map((auction) => {
              const endsDate = new Date(auction.ends_at)
              const isExtended = auction.status === 'extended'
              const isWinner = auction.current_winner_id === user.id
              const minRequired =
                auction.current_winner_id !== null && auction.current_winner_id !== undefined
                  ? auction.current_highest_bid + auction.min_bid_increment
                  : auction.starting_price

              return (
                <div key={auction.id} className="auction-card-box">
                  <div className="auction-top">
                    <h4>{auction.title}</h4>
                    <span className={`status-badge status-${auction.status}`}>
                      {isExtended ? 'EXTENDED' : auction.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="auction-pricing">
                    <div className="price-item">
                      <span className="price-label">Current Bid</span>
                      <span className="price-val">₹{auction.current_highest_bid}</span>
                    </div>
                    <div className="price-item">
                      <span className="price-label">Min Next Bid</span>
                      <span className="price-val">₹{minRequired}</span>
                    </div>
                  </div>

                  <div className="auction-info-row">
                    <span>Time Left:</span>
                    <AuctionCountdownTimer endsAt={auction.ends_at} isExtended={isExtended} />
                  </div>

                  <div className="auction-info-row">
                    <span>Deadline:</span>
                    <strong>{endsDate.toLocaleString()}</strong>
                  </div>

                  {isWinner && (
                    <div className="winner-tag">
                      You currently hold the highest bid.
                    </div>
                  )}

                  <div className="auction-live-feed">
                    <span className="feed-title">Live Bid Feed</span>
                    {(!liveFeeds[auction.id] || liveFeeds[auction.id].length === 0) ? (
                      <span className="feed-empty">No live bids yet</span>
                    ) : (
                      <ul className="feed-list">
                        {liveFeeds[auction.id].map((item, idx) => (
                          <li key={idx} className="feed-item">
                            <span>Bidder #{item.bidderId}: <strong>₹{item.amount}</strong></span>
                            <span className="feed-time">{item.time}</span>
                            {item.extended && <span className="feed-tag">+5m</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="auction-actions">
                    <Link
                      to={`/bicycles/${auction.bicycle_id}`}
                      className="btn-toggle"
                      style={{ fontSize: '0.82rem' }}
                    >
                      Inspect Cycle #{auction.bicycle_id}
                    </Link>

                    {user.role === 'student' ? (
                      <div className="bid-inline-form">
                        <input
                          type="number"
                          placeholder={`Min ₹${minRequired}`}
                          value={bidAmounts[auction.id] || ''}
                          onChange={(e) =>
                            setBidAmounts({ ...bidAmounts, [auction.id]: e.target.value })
                          }
                          disabled={biddingId === auction.id}
                        />
                        <button
                          type="button"
                          className="btn-submit btn-sm"
                          onClick={() => handlePlaceBid(auction)}
                          disabled={biddingId === auction.id}
                        >
                          {biddingId === auction.id ? 'Bidding...' : 'Bid'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                        Bidding reserved for students
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
