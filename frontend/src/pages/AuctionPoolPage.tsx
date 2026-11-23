import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import PageHeader from '../components/PageHeader'
import { apiData, apiFetch, jsonRequest } from '../lib/api'
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

const upiAccount = 'campuscycles@iitb'

function PaymentTime({ remaining }: { remaining: number }) {
  const countdown = [Math.floor(remaining / 60), remaining % 60]
    .map((part) => String(part).padStart(2, '0')).join(':')

  return (
    <span className={`pool-time ${remaining < 60 ? 'pool-urgent' : ''}`}>
      <PoolIcon name="clock" />
      <span role="timer" aria-label="Time left to pay">{countdown}</span>
    </span>
  )
}

function PaymentDialog({ auction, remaining, busy, error, onConfirm, onClose }: {
  auction: Auction
  remaining: number
  busy: boolean
  error: string
  onConfirm: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    backRef.current?.focus()
    return () => dialog?.close()
  }, [])

  const upiDetails = new URLSearchParams({
    pa: upiAccount,
    pn: 'CampusCycles',
    am: String(auction.current_highest_bid),
    tn: `Auction_${auction.id}`,
  })

  return (
    <dialog ref={dialogRef} className="pool-payment-dialog" aria-labelledby="pool-payment-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={({ target, currentTarget, clientX, clientY }) => {
        const { left, right, top, bottom } = currentTarget.getBoundingClientRect()
        if (!busy && target === currentTarget && (clientX < left || clientX > right || clientY < top || clientY > bottom)) {
          onClose()
        }
      }}>
      <header className="pool-result-heading">
        <h2 id="pool-payment-title">UPI payment</h2>
        <PaymentTime remaining={remaining} />
      </header>
      <p className="pool-payment-amount">{money(auction.current_highest_bid)}</p>
      <div className="pool-payment-qr">
        <QRCodeSVG value={`upi://pay?${upiDetails}`} size={176} marginSize={4} title="UPI payment QR code" />
      </div>
      <p className="pool-muted">{upiAccount}</p>
      <p className="pool-muted">Demo only. Do not send money.</p>
      {error && <p className="pool-result-error" role="alert">{error}</p>}
      <div className="pool-result-actions">
        <button type="button" className="pool-bid-button" onClick={onConfirm} disabled={busy}>
          {busy ? 'Confirming…' : 'Confirm demo payment'}
        </button>
        <button type="button" className="pool-text-action" onClick={onClose} disabled={busy} ref={backRef}>Back</button>
      </div>
    </dialog>
  )
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
  const [paymentError, setPaymentError] = useState('')
  const [paymentNotice, setPaymentNotice] = useState('')

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
        const nextAuction: Auction = await response.json()
        if (!controller.signal.aborted) {
          setAuction(nextAuction)
          setError('')
        }
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
    if (!auction || !canPay || paymentBusy) return
    setPaymentBusy(true)
    setPaymentError('')
    try {
      const settled = await apiData<Auction>(`/auctions/${auction.id}/pay`, jsonRequest('POST', {
        payment_method: 'upi', transaction_ref: `UPI-${Date.now().toString().slice(-6)}`,
      }))
      setShowUpiModal(false)
      setAuction(settled)
      refresh(v => v + 1)
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setPaymentBusy(false)
    }
  }

  async function declinePayment() {
    if (!auction || !canDecline || paymentBusy) return
    if (!confirm('Pass on this bicycle?')) return
    setPaymentBusy(true)
    setPaymentError('')
    try {
      const updated = await apiData<Auction>(`/auctions/${auction.id}/decline-payment`, { method: 'POST' })
      setAuction(updated)
      setPaymentNotice('You passed on this bicycle.')
      refresh(v => v + 1)
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Could not decline payment.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const bids = [...(auction?.bids || [])].sort((a, b) => b.amount - a.amount)
  const participants = poolBidders(bids, user.id)
  const leading = auction?.current_winner_id === user.id
  const isSettled = auction?.status === 'settled'
  const awaitingPayment = auction?.status === 'ended' && auction.current_winner_id != null
  const isRunnerUp = auction?.bids?.some(b => b.status === 'forfeited') ?? false
  const upcoming = auction?.status === 'scheduled' && Date.parse(auction.starts_at) > now

  const paymentDeadlineMs = auction?.payment_deadline ? Date.parse(auction.payment_deadline) : 0
  const paymentRemainingSeconds = Math.max(0, Math.ceil((paymentDeadlineMs - now) / 1000))
  const canPay = awaitingPayment && leading && paymentRemainingSeconds > 0
  const canDecline = canPay && !isRunnerUp
  const paymentDialogOpen = showUpiModal && canPay

  let resultTitle = auction?.status === 'cancelled' ? 'Auction cancelled' : 'Auction closed'
  if (isSettled) resultTitle = leading ? 'Payment confirmed' : 'Auction settled'
  if (awaitingPayment) {
    resultTitle = 'Awaiting payment'
    if (leading) resultTitle = canPay ? (isRunnerUp ? 'Runner-up offer' : 'You won') : 'Payment window closed'
  }

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

    {!auction ? (
      error ? <Link to="/auctions" className="pool-text-action">Back to auctions</Link> : <p role="status">Loading auction…</p>
    ) : upcoming ? (
      <section className="pool-unavailable">
        <h2>Auction scheduled</h2>
        <p className="pool-muted">Starts {new Date(auction.starts_at).toLocaleString()}</p>
        <Link to="/auctions" className="pool-text-action">Back to auctions</Link>
      </section>
    ) : !live ? (
      <section className="pool-result" aria-labelledby="auction-result-title">
        <header className="pool-result-heading">
          <h2 id="auction-result-title">{resultTitle}</h2>
          {awaitingPayment && paymentRemainingSeconds > 0 && <PaymentTime remaining={paymentRemainingSeconds} />}
        </header>

        {(isSettled || awaitingPayment) && (
          <dl className="pool-result-facts">
            <div>
              <dt className="pool-muted">{isSettled ? 'Sold for' : canPay ? 'Amount due' : 'Winning bid'}</dt>
              <dd className="pool-price">{money(auction.current_highest_bid)}</dd>
            </div>
            {!leading && auction.current_winner_id != null && (
              <div>
                <dt className="pool-muted">{isSettled ? 'Buyer' : 'Winning bidder'}</dt>
                <dd>Bidder #{auction.current_winner_id}</dd>
              </div>
            )}
          </dl>
        )}

        {paymentNotice && <p className="pool-muted" role="status">{paymentNotice}</p>}
        {paymentError && !paymentDialogOpen && <p className="pool-result-error" role="alert">{paymentError}</p>}

        <div className="pool-result-actions">
          {canPay && (
            <button type="button" className="pool-bid-button" disabled={paymentBusy} onClick={() => {
              setPaymentError('')
              setShowUpiModal(true)
            }}>Pay with UPI</button>
          )}
          {canDecline && (
            <button type="button" className="pool-text-action" onClick={declinePayment} disabled={paymentBusy}>
              Pass on bicycle
            </button>
          )}
          {isSettled && leading && (
            <Link to={`/bicycles/${auction.bicycle_id}`} className="pool-bid-button">View bicycle</Link>
          )}
          {!canPay && <Link to="/auctions" className="pool-text-action">Back to auctions</Link>}
        </div>
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

    {paymentDialogOpen && auction && (
      <PaymentDialog auction={auction} remaining={paymentRemainingSeconds} busy={paymentBusy} error={paymentError}
        onConfirm={completeUpiPayment}
        onClose={() => { setShowUpiModal(false); setPaymentError('') }} />
    )}
  </div></div>
}
