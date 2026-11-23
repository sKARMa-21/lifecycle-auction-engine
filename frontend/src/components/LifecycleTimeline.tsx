import type { Bicycle } from '../types/bicycle'

interface LifecycleTimelineProps {
  bicycle: Bicycle
}

export default function LifecycleTimeline({ bicycle }: LifecycleTimelineProps) {
  const steps = [
    { key: 'active', label: 'Active' },
    { key: 'asset', label: 'Tagged Asset' },
    { key: 'auctionable', label: 'Auctionable' },
    { key: 'sold', label: 'Sold' },
  ]

  const statusOrder: Record<string, number> = {
    active: 0,
    asset: 1,
    auctionable: 2,
    sold: 3,
  }

  const currentIdx = statusOrder[(bicycle.status || '').toLowerCase()] ?? 0

  const deadline = bicycle.claim_deadline ? new Date(bicycle.claim_deadline) : null
  const graceExpired = deadline !== null && deadline.getTime() <= Date.now()

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
              <span className="step-label">{s.label}</span>
              {idx < steps.length - 1 && <div className="step-connector" />}
            </div>
          )
        })}
      </div>

      {bicycle.status === 'asset' && deadline && (
        <div className={`grace-box ${graceExpired ? 'grace-expired' : 'grace-active'}`}>
          <div className="grace-title">{graceExpired ? 'Claim deadline passed' : 'Claim deadline'}</div>
          <p>{deadline.toLocaleString()}</p>
        </div>
      )}

      {(bicycle.status === 'sold' || (bicycle.status === 'active' && bicycle.sold_price !== null && bicycle.sold_price !== undefined)) && (
        <div className="sold-summary-box">
          <div className="sold-title">
            {bicycle.status === 'sold' ? 'Lifecycle Complete — Cycle Sold' : 'Auction Sale Record'}
          </div>
          <div className="sold-grid">
            {bicycle.sold_price !== null && bicycle.sold_price !== undefined && (
              <div>
                <span className="summary-label">Final Sold Price:</span>
                <strong>₹{bicycle.sold_price}</strong>
              </div>
            )}
            {bicycle.base_price_set !== null && bicycle.base_price_set !== undefined && (
              <div>
                <span className="summary-label">Base/Starting Price:</span>
                <span>₹{bicycle.base_price_set}</span>
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
