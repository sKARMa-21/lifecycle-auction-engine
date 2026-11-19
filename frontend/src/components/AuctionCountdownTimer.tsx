import { useState, useEffect } from 'react'

interface Props {
  endsAt: string
  isExtended?: boolean
  onExpire?: () => void
}

export default function AuctionCountdownTimer({ endsAt, isExtended, onExpire }: Props) {
  const [timeLeft, setTimeLeft] = useState(() => {
    return Math.max(0, new Date(endsAt).getTime() - Date.now())
  })

  useEffect(() => {
    const updateTimer = () => {
      const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now())
      setTimeLeft(remaining)
      if (remaining <= 0 && onExpire) {
        onExpire()
      }
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [endsAt, onExpire])

  if (timeLeft <= 0) {
    return <span className="timer-badge timer-ended">Ended</span>
  }

  const hours = Math.floor(timeLeft / (1000 * 60 * 60))
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)

  const formatted = `${hours > 0 ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const isUrgent = timeLeft < 5 * 60 * 1000

  return (
    <div className="timer-wrap">
      <span className={`timer-badge ${isUrgent ? 'timer-urgent' : 'timer-normal'}`}>
        ⏱ {formatted}
      </span>
      {isExtended && <span className="timer-pill-extended">+5m Anti-Snipe</span>}
    </div>
  )
}
