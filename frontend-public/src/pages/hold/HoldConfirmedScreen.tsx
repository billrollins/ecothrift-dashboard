import { Link } from 'react-router-dom'
import type { HoldSummary } from '../../api'
import { STORE } from '../../data/content'
import {
  DeadlineLine,
  DirectionsButton,
  HoldShell,
  ItemCard,
  PickupCode,
  StoreFacts,
} from './shared'

function calendarHref(hold: HoldSummary): string {
  const title = encodeURIComponent(`Pick up: ${hold.listing_title}`)
  const details = encodeURIComponent(
    `Show code ${hold.pickup_code || ''} at Eco-Thrift.\n${STORE.retail.address}`,
  )
  const location = encodeURIComponent(STORE.retail.address)
  if (!hold.expires_at) {
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`
  }
  const end = new Date(hold.expires_at)
  const start = new Date(end.getTime() - 60 * 60 * 1000)
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${title}&details=${details}&location=${location}` +
    `&dates=${fmt(start)}/${fmt(end)}`
  )
}

export default function HoldConfirmedScreen({ hold }: { hold: HoldSummary }) {
  return (
    <HoldShell hold={hold}>
      <h1 className="holdflow__h1">{hold.headline}</h1>
      <DeadlineLine hold={hold} />
      <PickupCode code={hold.pickup_code} />
      <p className="holdflow__next">{hold.next_step}</p>

      <DirectionsButton />
      <StoreFacts />

      <div className="holdflow__secs">
        <a className="btn btn--ghost" href={calendarHref(hold)} target="_blank" rel="noopener noreferrer">
          Add to calendar
        </a>
        <Link className="txt" to="/account">
          See all my holds
        </Link>
      </div>

      <ItemCard hold={hold} />
    </HoldShell>
  )
}
