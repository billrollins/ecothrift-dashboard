import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchHold, type HoldSummary } from '../api'
import { STORE } from '../data/content'
import { useSeo } from '../useSeo'

export default function HoldStatusPage() {
  useSeo({ title: 'Hold status', noindex: true })
  const { token = '' } = useParams()
  const [hold, setHold] = useState<HoldSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchHold(token)
      .then((data) => {
        if (active) setHold(data)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Hold not found')
      })
    return () => {
      active = false
    }
  }, [token])

  if (error) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Hold status</div>
          <h1>Hold not found</h1>
        </div>
        <p className="lead">{error}</p>
        <Link className="btn btn--primary" to="/shop">
          Back to shop
        </Link>
      </div>
    )
  }

  if (!hold) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <span className="skline" style={{ width: 220 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Hold status</div>
        <h1>{hold.status_display || hold.status}</h1>
      </div>
      <p className="lead">
        {hold.listing_title} × {hold.quantity}
      </p>
      <div className="pickupnote" style={{ marginBottom: 24 }}>
        {hold.policy}
      </div>
      <dl className="orderfacts">
        <div>
          <dt>Status</dt>
          <dd>{hold.status_display}</dd>
        </div>
        {hold.expires_at && (
          <div>
            <dt>Expires</dt>
            <dd>{new Date(hold.expires_at).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>Pickup</dt>
          <dd>
            {STORE.retail.name} — {STORE.retail.address}. {STORE.retail.hours}.
          </dd>
        </div>
      </dl>
      <p style={{ marginTop: 24 }}>
        Save this page link. Pay in store at pickup — no shipping, delivery, or online payment.
      </p>
      <div className="hbtns" style={{ marginTop: 18, marginBottom: 60 }}>
        <Link className="btn btn--primary" to="/shop">
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
