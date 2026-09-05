import { formatHolidayLine } from '../lib/hoursLabel'
import type { StoreStatus } from '../lib/storeHours'
import type { StoreHoursPublic } from '../api'

/** Live status + full schedule. Holiday lines are dated so they look temporary. */
export default function StoreHoursBlock({
  status,
  label,
  hours,
}: {
  status: StoreStatus
  label: string
  hours?: StoreHoursPublic | null
}) {
  const overrides = hours?.overrides || []
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
        {overrides.length > 0 ? (
          <span className="holiday-hours">
            <span className="holiday-hours__tag">Holiday hours</span>
            {overrides.map((row) => (
              <span key={row.id} className="holiday-hours__line">
                {formatHolidayLine(row)}
                {row.note ? ` — ${row.note}` : ''}
              </span>
            ))}
            {hours?.resume_label ? (
              <span className="holiday-hours__resume">{hours.resume_label}</span>
            ) : null}
            <span className="holiday-hours__note">
              Holiday hours may differ from regular hours.
            </span>
          </span>
        ) : null}
      </span>
    </div>
  )
}
