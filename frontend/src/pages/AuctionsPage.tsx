import { apiData, apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isAuctionLive } from '../lib/auction'
import type { Auction, AuctionBidEvent } from '../types/auction'
import type { User } from '../types/user'
import { useAuctionSubscriptions } from '../lib/useAuctionWebSocket'

const API = '/api/v1'

interface AuctionsPageProps {
  user: User
  onLogout: () => void
}

export default function AuctionsPage({ user, onLogout }: AuctionsPageProps) {
  const navigate = useNavigate()
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [outbidNotice, setOutbidNotice] = useState<string | null>(null)
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  const isSuperAdmin = user.role === 'super_admin'

  const activeAuctionIds = useMemo(
    () => auctions.filter((a) => isAuctionLive(a, now)).map((a) => a.id),
    [auctions, now]
  )

  const handleLiveBid = useCallback((auctionId: number, event: AuctionBidEvent) => {
    setAuctions((prev) => {
      const current = prev.find((a) => a.id === auctionId)
      if (current && current.current_winner_id === user.id && event.bidder_id !== user.id) {
        setOutbidNotice(`You were outbid on "${current.title}"! Current bid is now ₹${event.amount}.`)
      }
      return prev.map((auc) => {
        if (auc.id !== auctionId) return auc
        return {
          ...auc,
          current_highest_bid: event.amount,
          current_winner_id: event.bidder_id,
          ends_at: event.ends_at,
          status: event.extended ? 'extended' : auc.status,
        }
      })
    })

  }, [user.id])

  useAuctionSubscriptions(activeAuctionIds, handleLiveBid)

  const loadAuctions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch(`${API}/auctions/`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        setAuctions(list)

      }
    } catch {
      setMsg({ text: 'Unable to connect to auction server.', isError: true })
    } finally {
      setLoading(false)
    }
  }, [])

  const cancelAuction = async (auction: Auction) => {
    if (!confirm(`Cancel "${auction.title}"? Bidding stops and the bicycle returns to the auction pool.`)) return
    apiData(`/auctions/${auction.id}/cancel`, { method: 'POST' })
      .then(() => { setMsg({ text: `Auction "${auction.title}" was cancelled.`, isError: false }); loadAuctions() })
      .catch((err: Error) => setMsg({ text: err.message, isError: true }))
  }

  useEffect(() => {
    loadAuctions()
    const timer = setInterval(loadAuctions, 10000)
    return () => clearInterval(timer)
  }, [loadAuctions])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])

  return (
    <div className="page-wide">
      <PageHeader
        title="Campus Bicycle Auctions"
        role={user.role}
        onLogout={onLogout}
      />

      {outbidNotice && (
        <div className="outbid-banner">
          <span>⚠️ {outbidNotice}</span>
          <button type="button" onClick={() => setOutbidNotice(null)}>✕</button>
        </div>
      )}

      {msg && (
        <div className={`alert ${msg.isError ? 'alert-error' : 'alert-success'}`}>
          {msg.text}
        </div>
      )}

      <div className="card-wide">
        <div className="detail-header-flex">
          <div>
            <h3>
              Active Bidding Catalog
              {activeAuctionIds.length > 0 && (
                <span className="live-pill">
                  <span className="live-dot"></span>
                  Live Feed Active
                </span>
              )}
            </h3>
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
              Approved auction requests and unclaimed impounded bicycles enter the auction pool, and hostel admins launch auctions from there.
            </p>
            <Link to="/bicycles" className="btn-submit" style={{ display: 'inline-block', width: 'auto', marginTop: '16px' }}>
              View Bicycles
            </Link>
          </div>
        ) : (
          <div className="auction-grid">
            {auctions.map((auction) => {
              const isExtended = auction.status === 'extended'
              const isWinner = auction.current_winner_id === user.id
              const live = isAuctionLive(auction, now)
              const upcoming = auction.status === 'scheduled' && new Date(auction.starts_at).getTime() > now

              return (
                <div key={auction.id} className={`auction-card-box ${isWinner ? 'auction-card-leading' : ''}`}
                  style={{ cursor: isAuctionLive(auction) ? 'pointer' : undefined }}
                  onClick={(event) => {
                    if (isAuctionLive(auction) && !(event.target as HTMLElement).closest('a, button, input')) {
                      navigate(`/auctions/${auction.id}`)
                    }
                  }}>
                  <div className="auction-top">
                    <h4>{isAuctionLive(auction) ? (
                      <Link to={`/auctions/${auction.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{auction.title}</Link>
                    ) : auction.title}</h4>
                    <span className={`status-badge status-${auction.status}`}>
                      {live ? (isExtended ? 'EXTENDED' : 'LIVE') : upcoming ? 'SCHEDULED' : 'CLOSED'}
                    </span>
                  </div>

                  <div className="auction-pricing">
                    <div className="price-item">
                      <span className="price-label">{auction.current_winner_id == null ? 'Starting price' : 'Highest bid'}</span>
                      <span className="price-val">₹{auction.current_highest_bid}</span>
                    </div>
                  </div>

                  <div className="auction-info-row">
                    <span>{upcoming ? 'Starts' : live ? 'Ends' : 'Ended'}</span>
                    <strong>{new Date(upcoming ? auction.starts_at : auction.ends_at).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}</strong>
                  </div>

                  <div className="auction-actions">
                    {live ? (
                      <Link to={`/auctions/${auction.id}`} className="btn-submit btn-sm" style={{ width: 'auto', textAlign: 'center', textDecoration: 'none' }}>
                        Enter auction pool
                      </Link>
                    ) : (
                      <button type="button" className="btn-toggle" disabled>
                        {upcoming ? 'Not started yet' : 'Bidding closed'}
                      </button>
                    )}
                    {upcoming && isAdmin && <Link to={`/launch-auction?edit=${auction.id}`} className="btn-toggle" style={{ textDecoration: 'none' }}>Edit</Link>}
                    {(upcoming || live) && isSuperAdmin && <button type="button" className="btn-link btn-danger" onClick={() => cancelAuction(auction)}>Cancel auction</button>}
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
