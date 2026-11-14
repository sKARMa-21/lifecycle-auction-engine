import type { Bicycle } from '../types/bicycle'

interface LifecycleTimelineProps {
  bicycle: Bicycle
}

export default function LifecycleTimeline({ bicycle }: LifecycleTimelineProps) {
  const steps = [
    { key: 'active', label: '1. Active', desc: 'Registered & in-use on campus' },
    { key: 'asset', label: '2. Tagged Asset', desc: 'Impounded with 30-day grace period' },
    { key: 'auctionable', label: '3. Auctionable', desc: 'Ready or listed on live auction' },
    { key: 'sold', label: '4. Sold', desc: 'Auction closed & transferred' },
  ]

  const statusOrder: Record<string, number> = {
    active: 0,
    asset: 1,
    auctionable: 2,
    sold: 3,
  }

  const currentIdx = statusOrder[bicycle.status.toLowerCase()] ?? 0

  // Calculate Grace Period
  let graceRemainingDays: number | null = null
  let graceExpired = false

  if (bicycle.status === 'asset' && bicycle.asset_tagged_at) {
    const taggedDate = new Date(bicycle.asset_tagged_at)
    const now = new Date()
    const diffMs = now.getTime() - taggedDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const totalGraceDays = 30
    graceRemainingDays = Math.max(0, totalGraceDays - diffDays)
    graceExpired = diffDays >= totalGraceDays
  }

  return (
    <div className="lifecycle-timeline-container">
      <div className="timeline-steps">
        {steps.map((s, idx) => {
          const isDone = idx < currentIdx
          const isCurrent = idx === currentIdx
          const isUpcoming = idx > currentIdx

          let stepClass = 'timeline-step'
          if (isDone) stepClass += ' step-done'
          if (isCurrent) stepClass += ' step-current'
          if (isUpcoming) stepClass += ' step-upcoming'

          return (
            <div key={s.key} className={stepClass}>
              <div className="step-circle">
                {isDone ? '✓' : idx + 1}
              </div>
              <div className="step-content">
                <span className="step-label">{s.label}</span>
                <span className="step-desc">{s.desc}</span>
              </div>
              {idx < steps.length - 1 && <div className="step-connector" />}
            </div>
          )
        })}
      </div>

      {bicycle.status === 'asset' && (
        <div className={`grace-box ${graceExpired ? 'grace-expired' : 'grace-active'}`}>
          <div className="grace-title">
            {graceExpired ? '30-Day Grace Period Has Expired' : '30-Day Grace Period in Progress'}
          </div>
          <div className="grace-text">
            {graceExpired ? (
              <p>
                The cycle has completed the statutory 30-day grace period since being impounded on{' '}
                <strong>{new Date(bicycle.asset_tagged_at!).toLocaleDateString()}</strong>.
                It can now be promoted to <strong>Auctionable</strong>.
              </p>
            ) : (
              <p>
                Impounded on <strong>{new Date(bicycle.asset_tagged_at!).toLocaleDateString()}</strong>.{' '}
                <strong>{graceRemainingDays} day(s)</strong> remaining for the registered student owner to reclaim this cycle before it becomes auctionable.
              </p>
            )}
          </div>
        </div>
      )}

      {bicycle.status === 'sold' && (
        <div className="sold-summary-box">
          <div className="sold-title">Lifecycle Complete — Cycle Sold</div>
          <div className="sold-grid">
            {bicycle.sold_price !== null && bicycle.sold_price !== undefined && (
              <div>
                <span className="summary-label">Final Sold Price:</span>
                <strong>₹{bicycle.sold_price}</strong>
              </div>
            )}
            {bicycle.market_value !== null && bicycle.market_value !== undefined && (
              <div>
                <span className="summary-label">Est. Market Value:</span>
                <span>₹{bicycle.market_value}</span>
              </div>
            )}
            {bicycle.years_used !== null && bicycle.years_used !== undefined && (
              <div>
                <span className="summary-label">Years In Service:</span>
                <span>{bicycle.years_used} yr(s)</span>
              </div>
            )}
            {bicycle.cycle_condition && (
              <div>
                <span className="summary-label">Condition:</span>
                <span>{bicycle.cycle_condition}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
