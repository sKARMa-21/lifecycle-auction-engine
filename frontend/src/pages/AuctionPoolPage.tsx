import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
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
  const [showUpiModal, setShowUpiModal] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)

  const live = auction !== null && isAuctionLive(auction, now)
  useAuctionWebSocket(auction ? id : null, () => refresh(value => value + 1))

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const poll = window.setInterval(() => refresh(value => value + 1), 4000)
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

  async function completeUpiPayment() {
    if (!auction || paymentBusy) return
    setPaymentBusy(true)
    setError('')
    try {
      const res = await apiFetch(`${AUCTION_API}/${auction.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'upi', transaction_ref: `UPI-${Date.now().toString().slice(-6)}` })
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Payment processing failed.')
      }
      setShowUpiModal(false)
      setNotice('Payment confirmed! Bicycle is now active in your bicycle list.')
      refresh(v => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setPaymentBusy(false)
    }
  }

  async function declinePayment() {
    if (!auction || paymentBusy) return
    if (!confirm('Are you sure you want to pass on this bicycle? It will immediately be offered to the 2nd highest bidder.')) return
    setPaymentBusy(true)
    setError('')
    try {
      const res = await apiFetch(`${AUCTION_API}/${auction.id}/decline-payment`, {
        method: 'POST'
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Could not pass to runner-up.')
      }
      setNotice('You passed on this bicycle. It was offered to the 2nd highest bidder.')
      refresh(v => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error declining payment.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const bids = [...(auction?.bids || [])].sort((a, b) => b.amount - a.amount)
  const participants = poolBidders(bids, user.id)
  const leading = auction?.current_winner_id === user.id
  const isWinner = auction?.current_winner_id === user.id
  const isSettled = auction?.status === 'settled'
  const isEnded = auction?.status === 'ended' || (auction !== null && new Date(auction.ends_at).getTime() <= now)
  const isPendingPayment = !isSettled && isEnded && auction?.current_winner_id != null
  const isRunnerUp = auction?.bids?.some(b => b.status === 'forfeited') ?? false

  const paymentDeadlineMs = auction?.payment_deadline ? new Date(auction.payment_deadline).getTime() : 0
  const paymentRemainingSeconds = Math.max(0, Math.ceil((paymentDeadlineMs - now) / 1000))
  const paymentMinutes = Math.floor(paymentRemainingSeconds / 60)
  const paymentSecs = paymentRemainingSeconds % 60

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
    {notice && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{notice}</div>}

    {!auction ? (
      <p>{error ? 'Return to the auction catalog or try again shortly.' : 'Loading auction…'}</p>
    ) : new Date(auction.starts_at).getTime() > now ? (
      <section className="pool-unavailable">
        <h3>This auction hasn’t started yet.</h3>
        <p className="pool-muted">Starts on {new Date(auction.starts_at).toLocaleString()}</p>
        <Link to="/auctions" className="btn-toggle">Back to auctions</Link>
      </section>
    ) : isSettled ? (
      <section className="card-wide" style={{ textAlign: 'center', padding: '36px 24px' }}>
        <span style={{ fontSize: '2.5rem' }}>🏁</span>
        <h2 style={{ color: '#16a34a', margin: '8px 0 12px' }}>Auction Settled</h2>
        <p style={{ fontSize: '1.15rem', marginBottom: '20px' }}>
          Sold for <strong>{money(auction.current_highest_bid)}</strong> to{' '}
          <strong>{isWinner ? 'You' : `Bidder #${auction.current_winner_id}`}</strong>.
        </p>
        {isWinner ? (
          <div>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '16px', borderRadius: '8px', maxWidth: '440px', margin: '0 auto 20px', fontWeight: 600 }}>
              ✅ Payment confirmed! You are the official owner. This bicycle is now active in your bicycle list.
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Link to={`/bicycles/${auction.bicycle_id}`} className="btn-submit" style={{ width: 'auto', textDecoration: 'none' }}>
                View in My Bicycles
              </Link>
              <Link to="/auctions" className="btn-toggle" style={{ textDecoration: 'none' }}>
                Back to Auctions
              </Link>
            </div>
          </div>
        ) : (
          <Link to="/auctions" className="btn-toggle" style={{ textDecoration: 'none' }}>
            Back to Auctions
          </Link>
        )}
      </section>
    ) : isPendingPayment ? (
      <div className="card-wide">
        {isWinner ? (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <span style={{ fontSize: '3rem' }}>{isRunnerUp ? '🚲' : '🎉'}</span>
            {isRunnerUp ? (
              <h2 style={{ marginTop: '8px', color: '#0d9488' }}>Runner-Up Offer: Claim This Cycle!</h2>
            ) : (
              <h2 style={{ marginTop: '8px', color: '#1d4ed8' }}>Congratulations! You Won the Auction!</h2>
            )}
            <p style={{ fontSize: '1.15rem', margin: '12px 0' }}>
              Bicycle: <strong>{auction.title}</strong> · Price: <strong>{money(auction.current_highest_bid)}</strong>
            </p>

            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '480px',
              margin: '20px auto',
              color: '#991b1b',
            }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
                ⏱ 8-Minute UPI Payment Window
              </div>
              <div style={{ fontSize: '1.4rem', fontFamily: 'monospace', fontWeight: 700 }}>
                {String(paymentMinutes).padStart(2, '0')}:{String(paymentSecs).padStart(2, '0')} remaining
              </div>
              <p style={{ fontSize: '0.82rem', marginTop: '8px', color: '#7f1d1d' }}>
                {isRunnerUp ? (
                  'As the runner-up bidder, you have been offered this bicycle at your bid price. Please complete payment before the timer expires.'
                ) : (
                  'Please complete payment before the timer expires. If you won multiple cycles or do not wish to complete this purchase, you can choose to pass to the 2nd highest bidder.'
                )}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-submit"
                style={{ width: 'auto', padding: '12px 28px', fontSize: '1.05rem' }}
                onClick={() => setShowUpiModal(true)}
                disabled={paymentBusy || paymentRemainingSeconds <= 0}
              >
                📱 Pay {money(auction.current_highest_bid)} via UPI
              </button>
              {!isRunnerUp && (
                <button
                  type="button"
                  className="btn-toggle"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={declinePayment}
                  disabled={paymentBusy}
                >
                  Pass to 2nd Highest Bidder
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 20px' }}>
            <span style={{ fontSize: '2.5rem' }}>⏳</span>
            <h3 style={{ marginTop: '8px' }}>Bidding Closed · Awaiting Payment</h3>
            <p className="pool-muted" style={{ margin: '12px 0' }}>
              Leading Bidder <strong>#{auction.current_winner_id}</strong> has an 8-minute window to complete UPI payment.
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 20px' }}>
              If they decline or fail to pay before the window closes, this bicycle will immediately be offered to the runner-up bidder!
            </p>
            <Link to="/auctions" className="btn-toggle" style={{ textDecoration: 'none' }}>
              Back to Auctions
            </Link>
          </div>
        )}
      </div>
    ) : !live ? (
      <section className="pool-unavailable">
        <h3>This auction is closed.</h3>
        <p className="pool-muted">Bidding has ended.</p>
        <Link to="/auctions" className="btn-toggle">Back to auctions</Link>
      </section>
    ) : <>
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
      <p className="pool-deadline">
        Ends {new Date(auction.ends_at).toLocaleString()}
        {auction.status === 'extended' && ` (Extended by ${auction.anti_snipe_extension_minutes ?? 1}m anti-snipe)`}
      </p>
    </>}

    {showUpiModal && auction && (
      <div className="modal-overlay" onClick={() => setShowUpiModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center', padding: '28px' }}>
          <h3 style={{ marginBottom: '6px' }}>Scan & Pay via UPI</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Pay to <strong>campuscycles@iitb</strong>
          </p>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <QRCodeSVG
              value={`upi://pay?pa=campuscycles@iitb&pn=CampusCycles&am=${auction.current_highest_bid}&tn=Auction_${auction.id}`}
              size={176}
            />
          </div>
          <div style={{ margin: '16px 0 4px', fontSize: '1.3rem', fontWeight: 700 }}>
            Amount: {money(auction.current_highest_bid)}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Supports GPay, PhonePe, Paytm, or BHIM.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              className="btn-submit"
              onClick={completeUpiPayment}
              disabled={paymentBusy}
            >
              {paymentBusy ? 'Verifying payment…' : 'Simulate / Confirm UPI Payment'}
            </button>
            <button
              type="button"
              className="btn-toggle"
              onClick={() => setShowUpiModal(false)}
              disabled={paymentBusy}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
  </div></div>
}
