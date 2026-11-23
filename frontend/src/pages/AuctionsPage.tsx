import { API_BASE, apiData, apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import AuctionCountdownTimer from '../components/AuctionCountdownTimer'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isAuctionLive } from '../lib/auction'
import type { Auction, AuctionBidEvent } from '../types/auction'
import type { User } from '../types/user'
import { useAuctionSubscriptions } from '../lib/useAuctionWebSocket'

interface AuctionsPageProps {
  user: User
  onLogout: () => void
}

type FilterTab = 'all' | 'live' | 'upcoming' | 'upcoming_3days' | 'past'

export default function AuctionsPage({ user, onLogout }: AuctionsPageProps) {
  const navigate = useNavigate()
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [outbidNotice, setOutbidNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

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
      const res = await apiFetch(`${API_BASE}/auctions/`)
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

  const threeDaysFromNow = useMemo(() => now + 3 * 24 * 60 * 60 * 1000, [now])

  const liveAuctions = useMemo(
    () => auctions.filter((a) => isAuctionLive(a, now)),
    [auctions, now]
  )

  const upcomingAuctions = useMemo(
    () => auctions.filter((a) => a.status === 'scheduled' && new Date(a.starts_at).getTime() > now),
    [auctions, now]
  )

  const upcoming3DaysAuctions = useMemo(
    () => upcomingAuctions.filter((a) => new Date(a.starts_at).getTime() <= threeDaysFromNow),
    [upcomingAuctions, threeDaysFromNow]
  )

  const pastAuctions = useMemo(
    () => auctions.filter((a) => a.status === 'settled' || a.status === 'cancelled' || (!isAuctionLive(a, now) && a.status !== 'scheduled')),
    [auctions, now]
  )

  const displayedAuctions = useMemo(() => {
    switch (activeTab) {
      case 'live':
        return liveAuctions
      case 'upcoming':
        return upcomingAuctions
      case 'upcoming_3days':
        return upcoming3DaysAuctions
      case 'past':
        return pastAuctions
      default:
        return auctions
    }
  }, [activeTab, auctions, liveAuctions, upcomingAuctions, upcoming3DaysAuctions, pastAuctions])

  const renderAuctionCard = (auction: Auction) => {
    const isExtended = auction.status === 'extended'
    const isWinner = auction.current_winner_id === user.id
    const live = isAuctionLive(auction, now)
    const upcoming = auction.status === 'scheduled' && new Date(auction.starts_at).getTime() > now
    const startsIn3Days = upcoming && new Date(auction.starts_at).getTime() <= threeDaysFromNow

    return (
      <div
        key={auction.id}
        className={`auction-card-box ${isWinner ? 'auction-card-leading' : ''}`}
        style={{ cursor: 'pointer' }}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('a, button, input')) {
            navigate(`/auctions/${auction.id}`)
          }
        }}
      >
        <div className="auction-top">
          <h4>
            <Link to={`/auctions/${auction.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {auction.title}
            </Link>
          </h4>
          <span className={`status-badge status-${auction.status}`}>
            {live
              ? isExtended ? 'EXTENDED' : 'LIVE'
              : upcoming
              ? startsIn3Days ? 'STARTS <3D' : 'SCHEDULED'
              : auction.status === 'settled' ? 'SETTLED' : auction.status === 'cancelled' ? 'CANCELLED' : 'CLOSED'}
          </span>
        </div>

        <div className="auction-pricing">
          <div className="price-item">
            <span className="price-label">
              {auction.status === 'settled'
                ? 'Final sold price'
                : auction.current_winner_id == null
                ? 'Starting price'
                : 'Highest bid'}
            </span>
            <span className="price-val">₹{auction.current_highest_bid}</span>
          </div>
        </div>

        <div className="auction-info-row">
          <span>{upcoming ? 'Starts' : live ? 'Time left' : 'Ended'}</span>
          {live ? (
            <AuctionCountdownTimer endsAt={auction.ends_at} isExtended={isExtended} />
          ) : (
            <strong>
              {new Date(upcoming ? auction.starts_at : auction.ends_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </strong>
          )}
        </div>

        <div className="auction-actions">
          {live ? (
            <Link
              to={`/auctions/${auction.id}`}
              className="btn-submit btn-sm"
              style={{ width: 'auto', textAlign: 'center', textDecoration: 'none' }}
            >
              Enter auction pool
            </Link>
          ) : (
            <Link
              to={`/auctions/${auction.id}`}
              className="btn-toggle btn-sm"
              style={{ width: 'auto', textAlign: 'center', textDecoration: 'none' }}
            >
              {upcoming ? 'View Scheduled' : auction.status === 'settled' ? 'View Result (Settled)' : 'View Result (Closed)'}
            </Link>
          )}
          {upcoming && isAdmin && (
            <Link to={`/launch-auction?edit=${auction.id}`} className="btn-toggle" style={{ textDecoration: 'none' }}>
              Edit
            </Link>
          )}
          {(upcoming || live) && isSuperAdmin && (
            <button type="button" className="btn-link btn-danger" onClick={() => cancelAuction(auction)}>
              Cancel auction
            </button>
          )}
        </div>
      </div>
    )
  }

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
              Campus Cycle Bidding & Catalog
              {activeAuctionIds.length > 0 && (
                <span className="live-pill" style={{ marginLeft: '10px' }}>
                  <span className="live-dot"></span>
                  {activeAuctionIds.length} Live Room{activeAuctionIds.length > 1 ? 's' : ''}
                </span>
              )}
            </h3>
            <p className="subtitle">
              Pessimistic locking against concurrent bids, real-time WebSockets, and 8-minute settlement.
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

        {/* Filter Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '18px 0 24px' }}>
          {[
            { id: 'all', label: `All (${auctions.length})` },
            { id: 'live', label: `🔴 Live Now (${liveAuctions.length})` },
            { id: 'upcoming', label: `📅 All Upcoming (${upcomingAuctions.length})` },
            { id: 'upcoming_3days', label: `⏱ Starting in 3 Days (${upcoming3DaysAuctions.length})` },
            { id: 'past', label: `🏁 Past / Settled (${pastAuctions.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as FilterTab)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === tab.id ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                background: activeTab === tab.id ? '#eff6ff' : '#fff',
                color: activeTab === tab.id ? '#1d4ed8' : '#475569',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && auctions.length === 0 ? (
          <p style={{ padding: '24px', textAlign: 'center' }}>Loading auctions...</p>
        ) : auctions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p className="subtitle">There are currently no cycle auctions.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Approved auction requests and unclaimed impounded bicycles enter the auction pool, and hostel admins launch auctions from there.
            </p>
            <Link to="/bicycles" className="btn-submit" style={{ display: 'inline-block', width: 'auto', marginTop: '16px' }}>
              View Bicycles
            </Link>
          </div>
        ) : activeTab === 'all' ? (
          <div>
            {/* 1. Live Auctions Section */}
            {liveAuctions.length > 0 && (
              <section style={{ marginBottom: '32px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#16a34a' }}>
                  <span>🔴</span> Live Bidding Now ({liveAuctions.length})
                </h4>
                <div className="auction-grid">
                  {liveAuctions.map(renderAuctionCard)}
                </div>
              </section>
            )}

            {/* 2. Upcoming Auctions Section */}
            {upcomingAuctions.length > 0 && (
              <section style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#1e293b' }}>
                    <span>📅</span> Upcoming Auctions ({upcomingAuctions.length})
                  </h4>
                  {upcoming3DaysAuctions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('upcoming_3days')}
                      style={{
                        fontSize: '0.78rem',
                        color: '#92400e',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ⚡ {upcoming3DaysAuctions.length} starting within next 3 days
                    </button>
                  )}
                </div>
                <div className="auction-grid">
                  {upcomingAuctions.map(renderAuctionCard)}
                </div>
              </section>
            )}

            {/* 3. Past / Settled Auctions Section */}
            {pastAuctions.length > 0 && (
              <section>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--text-muted)' }}>
                  <span>🏁</span> Past & Settled Auctions ({pastAuctions.length})
                </h4>
                <div className="auction-grid">
                  {pastAuctions.map(renderAuctionCard)}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>
                {activeTab === 'live' && `🔴 Live Auctions (${liveAuctions.length})`}
                {activeTab === 'upcoming' && `📅 All Upcoming Auctions (${upcomingAuctions.length})`}
                {activeTab === 'upcoming_3days' && `⏱ Upcoming Auctions (Starting in 3 Days) (${upcoming3DaysAuctions.length})`}
                {activeTab === 'past' && `🏁 Past & Settled Auctions (${pastAuctions.length})`}
              </h4>
              <button
                type="button"
                className="btn-toggle"
                onClick={() => setActiveTab('all')}
                style={{ fontSize: '0.85rem' }}
              >
                Reset to All
              </button>
            </div>
            {displayedAuctions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                No auctions found in this category.
              </div>
            ) : (
              <div className="auction-grid">
                {displayedAuctions.map(renderAuctionCard)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
