import type { Bicycle } from '../types/bicycle'

interface LifecycleTimelineProps {
  bicycle: Bicycle
}

export default function LifecycleTimeline({ bicycle }: LifecycleTimelineProps) {
  const steps = [
    { key: 'active', label: '1. Active', desc: 'Registered & in-use on campus' },
    { key: 'asset', label: '2. Tagged Asset', desc: 'Impounded with 15-day grace period' },
    { key: 'auctionable', label: '3. Auctionable', desc: 'Ready or listed on live auction' },
    { key: 'sold', label: '4. Sold', desc: 'Auction closed & transferred' },
  ]

  const statusOrder: Record<string, number> = {
    active: 0,
    asset: 1,
    auctionable: 2,
    sold: 3,
  }

  const currentIdx = statusOrder[(bicycle.status || '').toLowerCase()] ?? 0

  let graceRemainingDays: number | null = null
  let graceExpired = false
  const deadline = bicycle.claim_deadline ? new Date(bicycle.claim_deadline) : null

  if (bicycle.status === 'asset' && deadline) {
    const remainingMs = deadline.getTime() - new Date().getTime()
    graceRemainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)))
    graceExpired = remainingMs <= 0
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
            {graceExpired ? '15-Day Claim Period Has Ended' : '15-Day Claim Period in Progress'}
          </div>
          <div className="grace-text">
            {graceExpired ? (
              <p>
                The claim deadline <strong>{deadline?.toLocaleString()}</strong> has passed.
                The expiry worker moves it to the <strong>auction pool</strong> within a minute.
              </p>
            ) : (
              <p>
                Impounded on <strong>{new Date(bicycle.asset_tagged_at!).toLocaleDateString()}</strong>.{' '}
                <strong>{graceRemainingDays} day(s)</strong> left for the owner to claim this cycle, until <strong>{deadline?.toLocaleString()}</strong>.
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
