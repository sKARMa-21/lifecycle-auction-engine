import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { apiFetch } from '../lib/api'
import { AUCTION_API, isAuctionLive, money, nextBid, poolBidders } from '../lib/auction'
import { useAuctionWebSocket } from '../lib/useAuctionWebSocket'
import type { Auction } from '../types/auction'
import type { User } from '../types/user'
import './AuctionPool.css'

function PoolIcon({ name }: { name: 'user' | 'gavel' | 'clock' | 'crown' | 'activity' | 'bike' }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    gavel: <><path d="m13 3 8 8-4 4-8-8zM11 13 3 21M3 6l5-5M16 19l7-7M13 22h9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    crown: <><path d="m3 6 4 4 5-7 5 7 4-4-2 12H5zM5 22h14" /></>,
    activity: <path d="M2 13h5l3-9 4 16 3-7h5" />,
    bike: <><circle cx="5" cy="17" r="4" /><circle cx="19" cy="17" r="4" /><path d="m5 17 5-9 5 9H5M8 5h4M10 8h7l2 9M16 4h3" /></>,
  }
  return <svg className="pool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function AuctionPoolPage(props: { user: User; onLogout: () => void }) {
  const { id } = useParams()
  return <Pool key={id} id={Number(id)} {...props} />
}

function Pool({ id, user, onLogout }: { id: number; user: User; onLogout: () => void }) {
  const [auction, setAuction] = useState<Auction | null>(null)
  const [revision, refresh] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const live = auction !== null && isAuctionLive(auction, now)
  useAuctionWebSocket(live ? id : null, () => refresh(value => value + 1))
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const poll = window.setInterval(() => refresh(value => value + 1), 5000)
    return () => { clearInterval(clock); clearInterval(poll) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await apiFetch(`${AUCTION_API}/${id}`, { signal: controller.signal })
        if (!response.ok) throw new Error(response.status === 404 ? 'Auction not found.' : 'Unable to update this auction.')
        setAuction(await response.json())
        setError('')
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Connection lost. Retrying shortly.')
      }
    }
    if (Number.isInteger(id) && id > 0) void load()
    else setError('Auction not found.')
    return () => controller.abort()
  }, [id, revision])

  async function placeBid() {
    if (!auction || !isAuctionLive(auction) || busy) return
    setBusy(true)
    setNotice('')
    try {
      const joined = await apiFetch(`${AUCTION_API}/${id}/participants`, { method: 'POST' })
      if (!joined.ok) throw new Error((await joined.json()).detail || 'Could not join auction.')
      const response = await apiFetch(`${AUCTION_API}/${id}/bids`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: nextBid(auction) }),
      })
      if (!response.ok) throw new Error((await response.json()).detail || 'Could not place bid.')
      setNotice('Your bid was accepted.')
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not confirm your bid. Check the feed before retrying.') }
    finally { setBusy(false); refresh(value => value + 1) }
  }

  const bids = [...(auction?.bids || [])].sort((a, b) => b.amount - a.amount)
  const participants = poolBidders(bids, user.id)
  const leading = auction?.current_winner_id === user.id
  const seconds = Math.max(0, Math.ceil(((auction ? new Date(auction.ends_at).getTime() : now) - now) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor(seconds / 3600) % 24
  const minutes = Math.floor(seconds / 60) % 60
  const countdown = `${days ? `${days}d ` : ''}${days || hours ? `${hours}h ` : ''}${minutes}m ${seconds % 60}s left`
  const viewing = user.role !== 'student' || user.id === auction?.created_by_id
  return <div className="auction-shell"><div className="page-wide">
    <PageHeader title={auction?.title || 'Auction pool'} role={user.role} onLogout={onLogout}
      action={auction ? { to: `/bicycles/${auction.bicycle_id}`, label: 'Inspect bicycle' } : undefined} />
    {error && <p className="pool-notice" role="alert">{error}</p>}
    {!auction ? <p>{error ? 'Return to the auction catalog or try again shortly.' : 'Loading auction…'}</p> : !live ? <section className="pool-unavailable">
      <h3>{new Date(auction.starts_at).getTime() > now ? 'This auction hasn’t started yet.' : 'This auction is closed.'}</h3>
      <p className="pool-muted">The pool is available only while bidding is live.</p><Link to="/auctions" className="btn-toggle">Back to auctions</Link>
    </section> : <>
      <div className="pool-meta">
        <span className="pool-status"><span />{auction.status === 'extended' ? 'Live · extended' : 'Live'}</span>
        <span className={`pool-time ${seconds < 300 ? 'pool-urgent' : ''}`}><PoolIcon name="clock" /><span role="timer">{countdown}</span></span>
      </div>
      <div className="pool-room-layout">
        <section className="pool-leader" aria-label="Leading bidder and bidding controls">
          {auction.current_winner_id != null && <span className="pool-crown" aria-label="Highest bidder"><PoolIcon name="crown" /></span>}
          <span className={`pool-avatar pool-leader-avatar pool-color-${(auction.current_winner_id ?? 0) % 4}`}><PoolIcon name="user" /></span>
          <h1 className="pool-leader-name">{auction.current_winner_id == null ? 'No bids yet' : leading ? 'You' : `Bidder #${auction.current_winner_id}`}</h1>
          <span className="pool-muted">{auction.current_winner_id == null ? 'Starting price' : 'Highest bid'}</span>
          <strong className="pool-price">{money(auction.current_highest_bid)}</strong>
          <button className="pool-bid-button" onClick={placeBid} disabled={busy || !!error || leading || viewing}>
            <PoolIcon name={leading ? 'crown' : 'gavel'} />
            {busy ? 'Placing bid…' : leading ? 'You’re leading' : viewing ? 'Viewing only' : `Place bid · ${money(nextBid(auction))}`}
          </button>
          {notice && <p className="pool-feedback" role="status">{notice}</p>}
        </section>
        <section className="pool-standings" aria-label="You and the top five bidders">
          <div className="pool-list-heading"><h2>Bidders</h2></div>
          <ul className="pool-people">
            {[...participants].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1)).map(person => {
              const you = person.id === user.id
              const winner = person.id === auction.current_winner_id
              return <li key={person.id} className={`pool-person ${winner ? 'pool-person-leading' : ''}`}>
                <span className={`pool-avatar pool-color-${person.id % 4} ${you ? 'pool-avatar-you' : ''}`}><PoolIcon name="user" /></span>
                <div className="pool-person-name"><strong>{you ? 'You' : `Bidder #${person.id}`}</strong></div>
                {winner && <span className="pool-list-crown" aria-label="Highest bidder"><PoolIcon name="crown" /></span>}
                <strong className="pool-person-amount">{person.amount === null ? '—' : money(person.amount)}</strong>
              </li>
            })}
          </ul>
        </section>
      </div>
      <p className="pool-deadline">Ends {new Date(auction.ends_at).toLocaleString()}</p>
    </>}
  </div></div>
}
