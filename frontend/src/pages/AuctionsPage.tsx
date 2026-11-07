import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { Auction } from '../types/auction'
import type { User } from '../types/user'

const API = 'http://127.0.0.1:8000/api/v1'

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

  const loadAuctions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/auctions/`)
      if (res.ok) {
        const data = await res.json()
        setAuctions(Array.isArray(data) ? data : [])
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
      <header className="bar">
        <div>
          <span className="brand-badge">Auction Engine</span>
          <h2>Campus Bicycle Auctions</h2>
        </div>
        <div className="bar-actions">
          <span className="role-pill">{user.role}</span>
          <Link to="/bicycles" className="btn-toggle">
            Bicycles
          </Link>
          <Link to="/dashboard" className="btn-toggle">
            Dashboard
          </Link>
          <button type="button" className="btn-toggle" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

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
              🔄 Refresh
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
                      {isExtended ? '⚡ EXTENDED' : auction.status.toUpperCase()}
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
                    <span>Deadline:</span>
                    <strong>{endsDate.toLocaleString()}</strong>
                  </div>

                  {isWinner && (
                    <div className="winner-tag">
                      🎯 You currently hold the highest bid!
                    </div>
                  )}

                  <div className="auction-actions">
                    <Link
                      to={`/bicycles/${auction.bicycle_id}`}
                      className="btn-toggle"
                      style={{ fontSize: '0.82rem' }}
                    >
                      Inspect Cycle #{auction.bicycle_id}
                    </Link>

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
