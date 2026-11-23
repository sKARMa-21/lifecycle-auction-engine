import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AuctionCountdownTimer from '../components/AuctionCountdownTimer'
import PageHeader from '../components/PageHeader'
import { apiData } from '../lib/api'
import { isAuctionLive, money } from '../lib/auction'
import { useAuctionSubscriptions } from '../lib/useAuctionWebSocket'
import type { Auction, AuctionBidEvent } from '../types/auction'
import type { User } from '../types/user'

interface AuctionsPageProps {
  user: User
  onLogout: () => void
}

type Filter = 'all' | 'live' | 'upcoming' | 'nextThreeDays' | 'past'
const threeDays = 3 * 24 * 60 * 60 * 1000

const auctionDate = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export default function AuctionsPage({ user, onLogout }: AuctionsPageProps) {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const [outbidNotice, setOutbidNotice] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<Filter>('all')

  const isSuperAdmin = user.role === 'super_admin'
  const isAdmin = isSuperAdmin || user.role === 'admin'

  const { live, upcoming, past } = useMemo(() => {
    const live: Auction[] = []
    const upcoming: Auction[] = []
    const past: Auction[] = []
    for (const auction of auctions) {
      if (isAuctionLive(auction, now)) live.push(auction)
      else if (auction.status === 'scheduled' && Date.parse(auction.starts_at) > now) upcoming.push(auction)
      else past.push(auction)
    }
    return { live, upcoming, past }
  }, [auctions, now])

  const handleLiveBid = useCallback((auctionId: number, event: AuctionBidEvent) => {
    setAuctions((previous) => previous.map((auction) => {
      if (auction.id !== auctionId) return auction
      if (auction.current_winner_id === user.id && event.bidder_id !== user.id) {
        setOutbidNotice(`Outbid on ${auction.title}. Highest bid: ${money(event.amount)}.`)
      }
      return {
        ...auction,
        current_highest_bid: event.amount,
        current_winner_id: event.bidder_id,
        ends_at: event.ends_at,
        status: event.extended ? 'extended' : auction.status,
      }
    }))
  }, [user.id])

  useAuctionSubscriptions(live.map((auction) => auction.id), handleLiveBid)

  const loadAuctions = useCallback(async () => {
    setLoading(true)
    try {
      setAuctions(await apiData<Auction[]>('/auctions/'))
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load auctions.')
    } finally {
      setLoading(false)
    }
  }, [])

  async function cancelAuction(auction: Auction) {
    if (!confirm(`Cancel "${auction.title}"? Bidding stops and the bicycle returns to the auction pool.`)) return
    try {
      await apiData(`/auctions/${auction.id}/cancel`, { method: 'POST' })
      setMsg({ text: `Auction "${auction.title}" was cancelled.`, isError: false })
      void loadAuctions()
    } catch (error) {
      setMsg({ text: (error as Error).message, isError: true })
    }
  }

  useEffect(() => {
    void loadAuctions()
    const timer = window.setInterval(loadAuctions, 10000)
    return () => window.clearInterval(timer)
  }, [loadAuctions])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  const filters: Record<Filter, { label: string; items: Auction[] }> = {
    all: { label: 'All', items: auctions },
    live: { label: 'Live', items: live },
    upcoming: { label: 'Upcoming', items: upcoming },
    nextThreeDays: {
      label: 'Next 3 days',
      items: upcoming.filter((auction) => Date.parse(auction.starts_at) <= now + threeDays),
    },
    past: { label: 'Past', items: past },
  }

  const sections = activeFilter === 'all'
    ? [
        { id: 'live', title: 'Live auctions', items: live },
        { id: 'upcoming', title: 'Upcoming auctions', items: upcoming },
        { id: 'past', title: 'Past auctions', items: past },
      ].filter(({ items }) => items.length)
    : [{ id: activeFilter, title: null, items: filters[activeFilter].items }]

  function renderAuctionCard(auction: Auction) {
    const isLive = isAuctionLive(auction, now)
    const isUpcoming = auction.status === 'scheduled' && Date.parse(auction.starts_at) > now
    const isSettled = auction.status === 'settled'
    const isCancelled = auction.status === 'cancelled'
    const hasBid = auction.current_winner_id != null
    const isLeading = isLive && auction.current_winner_id === user.id

    const state = isLive ? 'Live' : isUpcoming ? 'Scheduled' : isSettled ? 'Settled' : isCancelled ? 'Cancelled' : 'Closed'
    const priceLabel = isSettled ? 'Sold for' : hasBid ? 'Highest bid' : 'Starting price'
    const dateLabel = isLive ? 'Time left' : isUpcoming ? 'Starts' : isCancelled ? 'Scheduled end' : 'Ended'
    const date = isUpcoming ? auction.starts_at : auction.ends_at
    const action = isLive ? 'Enter auction' : isUpcoming || isCancelled ? 'View auction' : 'View results'
    const CardHeading = activeFilter === 'all' ? 'h3' : 'h2'

    return (
      <article className="auction-card-box" data-phase={state.toLowerCase()} key={auction.id}>
        <div className="auction-card-heading">
          <CardHeading>{auction.title}</CardHeading>
          <span className="auction-card-state">{state}</span>
        </div>

        {isLeading && <p className="auction-card-leading">You’re leading</p>}

        <dl className="auction-card-facts">
          <div>
            <dt>{priceLabel}</dt>
            <dd className="auction-card-price">{money(hasBid || isSettled ? auction.current_highest_bid : auction.starting_price)}</dd>
          </div>
          <div>
            <dt>{dateLabel}</dt>
            <dd>{isLive ? (
              <AuctionCountdownTimer
                endsAt={auction.ends_at}
                isExtended={auction.status === 'extended'}
                extensionMinutes={auction.anti_snipe_extension_minutes}
              />
            ) : (
              <time dateTime={date}>{auctionDate.format(new Date(date))}</time>
            )}</dd>
          </div>
        </dl>

        <div className="auction-card-actions">
          <Link
            to={`/auctions/${auction.id}`}
            className="auction-card-open"
            aria-label={`${action}: ${auction.title}`}
          >
            {action}
          </Link>
          {isUpcoming && isAdmin && <Link to={`/launch-auction?edit=${auction.id}`}>Edit</Link>}
          {(isUpcoming || isLive) && isSuperAdmin && (
            <button type="button" className="auction-card-cancel" onClick={() => cancelAuction(auction)}>
              Cancel auction
            </button>
          )}
        </div>
      </article>
    )
  }

  return (
    <main className="page-wide auctions-page">
      <PageHeader title="Auctions" role={user.role} onLogout={onLogout}
        action={{ label: 'Refresh', onClick: loadAuctions, disabled: loading }} />

      {outbidNotice && (
        <div className="outbid-banner">
          <p role="status">{outbidNotice}</p>
          <button type="button" onClick={() => setOutbidNotice(null)}>Dismiss</button>
        </div>
      )}

      {msg && <p className={`alert ${msg.isError ? 'alert-error' : 'alert-success'}`} role={msg.isError ? 'alert' : 'status'}>{msg.text}</p>}
      {loadError && <p className="alert alert-error" role="alert">{loadError}</p>}

      <div className="auctions-filters" role="group" aria-label="Filter auctions">
        {Object.entries(filters).map(([id, { label, items }]) => (
          <button key={id} type="button" aria-pressed={activeFilter === id} onClick={() => setActiveFilter(id as Filter)}>
            {label} <span className="auctions-filter-count">{items.length}</span>
          </button>
        ))}
      </div>

      {auctions.length === 0 ? (
        loading && !loadError ? <p className="auctions-empty" role="status">Loading auctions…</p> :
          !loadError && <p className="auctions-empty">No auctions yet.</p>
      ) : sections.map(({ id, title, items }) => (
        <section key={id} className="auctions-section" aria-label={title ?? filters[activeFilter].label}>
          {title && <h2>{title}</h2>}
          {items.length > 0 ? (
            <div className="auction-grid">{items.map(renderAuctionCard)}</div>
          ) : (
            <p className="auctions-empty">No auctions in this view.</p>
          )}
        </section>
      ))}
    </main>
  )
}
