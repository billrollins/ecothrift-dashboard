import type { ReactNode } from 'react'
import type { HoldSummary } from '../../api'
import HoldRail from '../../components/HoldRail'
import { STORE } from '../../data/content'
import { useCountdown } from '../../lib/holdTime'
import { useStoreHoursLabel } from '../../lib/storeHours'

export function HoldShell({
  hold,
  children,
  showRail = true,
}: {
  hold: HoldSummary
  children: ReactNode
  showRail?: boolean
}) {
  return (
    <div className="wrap holdflow">
      {showRail && (
        <HoldRail stages={hold.stages} current={hold.stage ?? 0} />
      )}
      {children}
    </div>
  )
}

export function DeadlineLine({ hold }: { hold: HoldSummary }) {
  const live = useCountdown(hold.expires_at)
  const lead = live.lead || hold.expires_label || ''
  const secondary = live.secondary || hold.expires_secondary || ''
  if (!lead) return null
  return (
    <div className="holddeadline">
      <div className="holddeadline__lead">{lead}</div>
      {secondary ? <div className="holddeadline__sec">{secondary}</div> : null}
    </div>
  )
}

export function PickupCode({ code }: { code?: string | null }) {
  if (!code) return null
  return (
    <div className="holdcode">
      <div className="holdcode__label">Show this at the counter</div>
      <div className="holdcode__value" aria-label={`Pickup code ${code}`}>
        {code}
      </div>
    </div>
  )
}

export function DirectionsButton() {
  return (
    <a
      className="btn btn--primary btn--xl"
      href={STORE.retail.mapsPlaceUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      Get directions
    </a>
  )
}

export function StoreFacts() {
  const label = useStoreHoursLabel()
  return (
    <div className="holdstore">
      <div>{STORE.retail.name}</div>
      <div>{STORE.retail.address}</div>
      <div>{label}</div>
      <div>Pay in store - cash or card</div>
    </div>
  )
}

export function ItemCard({ hold }: { hold: HoldSummary }) {
  return (
    <div className="holditem">
      <div className="holditem__title">
        {hold.listing_title} × {hold.quantity}
      </div>
      {hold.unit_price ? <div className="holditem__price">${hold.unit_price}</div> : null}
      {hold.customer_name ? (
        <div className="holditem__name">Pickup name: {hold.customer_name}</div>
      ) : null}
    </div>
  )
}

export function mailAppHref(email?: string | null): string {
  // Best-effort deep link; most mobile browsers open the default mail client.
  if (!email) return 'mailto:'
  return `mailto:${encodeURIComponent(email)}`
}
