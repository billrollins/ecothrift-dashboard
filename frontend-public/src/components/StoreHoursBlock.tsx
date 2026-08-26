import type { StoreStatus } from '../lib/storeHours'

/** Live status + full schedule. Both lines always render (no content shift). */
export default function StoreHoursBlock({
  status,
  label,
}: {
  status: StoreStatus
  label: string
}) {
  return (
    <div className="vrow">
      <b>Hours</b>
      <span>
        <span className={`store-status${status.open ? ' store-status--open' : ''}`}>
          <span
            className={`status-dot${status.open ? ' status-dot--open' : ''}`}
            aria-hidden="true"
          />
          <span className="store-status__copy">
            {status.open ? (
              <>
                <span className="store-status__lead">Open now</span>
                {status.text.replace(/^Open now/, '')}
              </>
            ) : (
              status.text
            )}
          </span>
        </span>
        <span className="vnear">{label}</span>
      </span>
    </div>
  )
}
