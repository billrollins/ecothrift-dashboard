import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../../api'
import { useAccountData } from './accountData'

type Filter = 'all' | 'picked_up' | 'ended'

function outcomeLabel(status: string): string {
  if (status === 'completed') return 'Picked up'
  return 'Ended'
}

function outcomeClass(status: string): string {
  if (status === 'completed') return 'statuspill--success'
  return 'statuspill--muted'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AccountHistoryPage() {
  const { pastHolds, currentPastHolds, archiveHold } = useAccountData()
  const [filter, setFilter] = useState<Filter>('all')
  const [showOlder, setShowOlder] = useState(false)
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const olderCount = pastHolds.length - currentPastHolds.length
  const visible = showOlder ? pastHolds : currentPastHolds

  const rows = useMemo(() => {
    if (filter === 'picked_up') return visible.filter((h) => h.status === 'completed')
    if (filter === 'ended') {
      return visible.filter((h) => ['declined', 'cancelled', 'expired'].includes(h.status))
    }
    return visible
  }, [visible, filter])

  const onArchive = async (token: string) => {
    setBusyToken(token)
    setError(null)
    try {
      await archiveHold(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive')
    } finally {
      setBusyToken(null)
    }
  }

  return (
    <section className="acctcard">
      <div className="acctcard__head">
        <h2>History</h2>
      </div>
      <div className="acct__filters" role="group" aria-label="Filter history">
        {(
          [
            ['all', 'All'],
            ['picked_up', 'Picked up'],
            ['ended', 'Ended'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`filterchip${filter === key ? ' filterchip--on' : ''}`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="formerror">{error}</div> : null}

      {rows.length === 0 ? (
        <div className="acct__empty">
          <p>
            {pastHolds.length === 0
              ? 'No past holds yet.'
              : 'Nothing matches this filter.'}
          </p>
          {pastHolds.length === 0 ? (
            <Link className="btn btn--primary" to="/shop">
              Browse the shop
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="histlist">
          {rows.map((h) => (
            <li key={h.status_token} className="histitem">
              <Link className="histrow" to={`/hold/${h.status_token}`}>
                <div className="histrow__media">
                  {h.listing_image?.url ? (
                    <img
                      src={h.listing_image.url}
                      alt=""
                      width={64}
                      height={64}
                    />
                  ) : (
                    <div className="holdcard__ph" aria-hidden="true" />
                  )}
                </div>
                <div className="histrow__body">
                  <div className="histrow__top">
                    <span className="histrow__title">
                      {h.listing_title}
                      {h.quantity > 1 ? ` × ${h.quantity}` : ''}
                    </span>
                    {h.unit_price ? (
                      <span className="histrow__price">{money(h.unit_price)}</span>
                    ) : null}
                  </div>
                  <div className="histrow__meta">
                    <span className={`statuspill ${outcomeClass(h.status)}`}>
                      {outcomeLabel(h.status)}
                    </span>
                    <span className="histrow__date">{formatDate(h.created_at)}</span>
                  </div>
                  {h.release_reason && h.status !== 'completed' ? (
                    <p className="histrow__reason">{h.release_reason}</p>
                  ) : null}
                </div>
              </Link>
              <button
                type="button"
                className="txt histitem__archive"
                disabled={busyToken === h.status_token}
                onClick={() => void onArchive(h.status_token)}
              >
                {busyToken === h.status_token ? 'Archiving…' : 'Archive'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {olderCount > 0 ? (
        <div className="acct__more">
          <button
            type="button"
            className="txt"
            onClick={() => setShowOlder((v) => !v)}
          >
            {showOlder
              ? 'Hide older holds'
              : `Show ${olderCount} older hold${olderCount === 1 ? '' : 's'}`}
          </button>
          {!showOlder ? (
            <p className="acct__morenote">
              Ended holds older than 90 days are tucked away. Everything you
              picked up stays here.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
