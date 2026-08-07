import { Link } from 'react-router-dom'
import { money, type HoldSummary } from '../../api'
import HoldRail from '../../components/HoldRail'
import { retailMapsDirectionsUrl } from '../../data/content'
import { useCountdown } from '../../lib/holdTime'

function toneClass(tone?: string): string {
  if (tone === 'success') return 'statuspill--success'
  if (tone === 'muted') return 'statuspill--muted'
  if (tone === 'warn' || tone === 'warning') return 'statuspill--warn'
  return 'statuspill--info'
}

export default function HoldCard({ hold }: { hold: HoldSummary }) {
  const deadline = useCountdown(hold.expires_at)
  const unread = hold.thread?.customer_unread || 0
  const messageHref = hold.thread?.public_token
    ? `/account/messages?thread=${encodeURIComponent(hold.thread.public_token)}`
    : null

  return (
    <article className="holdcard">
      <div className="holdcard__media">
        {hold.listing_image?.url ? (
          <img
            src={hold.listing_image.url}
            alt={hold.listing_image.alt || hold.listing_title}
            width={96}
            height={96}
          />
        ) : (
          <div className="holdcard__ph" aria-hidden="true" />
        )}
      </div>
      <div className="holdcard__body">
        <div className="holdcard__top">
          <h3 className="holdcard__title">
            {hold.listing_title}
            {hold.quantity > 1 ? ` × ${hold.quantity}` : ''}
          </h3>
          {hold.unit_price ? (
            <div className="holdcard__price">{money(hold.unit_price)}</div>
          ) : null}
        </div>
        <div className="holdcard__meta">
          <span className={`statuspill ${toneClass(hold.tone)}`}>
            {hold.customer_status || hold.status_display || hold.status}
          </span>
          {deadline.lead ? (
            <span className="holdcard__deadline">{deadline.lead}</span>
          ) : null}
          {hold.pickup_code ? (
            <span className="holdcard__code" aria-label={`Pickup code ${hold.pickup_code}`}>
              {hold.pickup_code}
            </span>
          ) : null}
        </div>
        {hold.headline ? <p className="holdcard__headline">{hold.headline}</p> : null}
        <HoldRail stages={hold.stages} current={hold.stage ?? 0} variant="compact" />
        <div className="holdcard__actions">
          <Link className="btn btn--primary" to={`/hold/${hold.status_token}`}>
            View hold
          </Link>
          {hold.can_pickup ? (
            <a
              className="btn btn--ghost"
              href={retailMapsDirectionsUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Directions
            </a>
          ) : null}
          {messageHref ? (
            <Link className="btn btn--ghost" to={messageHref}>
              Message{unread > 0 ? ` (${unread})` : ''}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
