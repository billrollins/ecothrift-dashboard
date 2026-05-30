import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { fetchOrder, money, type OrderPayment, type OrderSummary } from '../api'
import { STORE } from '../data/content'
import { useSeo } from '../useSeo'

export default function OrderConfirmationPage() {
  const { number = '' } = useParams()
  const location = useLocation()
  const payment = (location.state as { payment?: OrderPayment } | null)?.payment ?? null

  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useSeo({ title: order ? `Order ${order.order_number}` : 'Order', noindex: true })

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    fetchOrder(number)
      .then((data) => {
        if (active) setOrder(data)
      })
      .catch(() => {
        if (active) setNotFound(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [number])

  if (loading) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <span className="skline" style={{ width: 240 }} />
        </div>
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Order</div>
          <h1>We couldn&rsquo;t find that order</h1>
        </div>
        <p className="lead">
          Double-check the link in your confirmation email, or{' '}
          <a href={`mailto:${STORE.email}`}>email us</a> and we&rsquo;ll help.
        </p>
        <div className="hbtns" style={{ marginTop: 18, marginBottom: 60 }}>
          <Link className="btn btn--primary" to="/shop">
            Back to the shop
          </Link>
        </div>
      </div>
    )
  }

  const message =
    payment?.message ??
    (order.fulfillment === 'pickup'
      ? 'We’ll email you when your order is ready to pick up — pay in store at pickup.'
      : 'We’ll email you with next steps for your order.')

  return (
    <div className="wrap">
      <div className="confirm">
        <div className="confirm-badge">✓</div>
        <div className="eyebrow">Order {order.order_number}</div>
        <h1 className="confirm-title">Thank you, {order.customer_name.split(' ')[0]}!</h1>
        <p className="lead">{message}</p>
        <p className="confirm-email">A confirmation was sent to {order.email}.</p>

        <div className="confirm-card">
          <div className="confirm-rows">
            <div className="vrow">
              <b>Status</b>
              <span>
                {order.status_display} · {order.payment_status_display}
              </span>
            </div>
            <div className="vrow">
              <b>Fulfillment</b>
              <span>{order.fulfillment_display}</span>
            </div>
            {order.fulfillment === 'ship' && order.ship_address1 && (
              <div className="vrow">
                <b>Ship to</b>
                <span>
                  {order.ship_address1}
                  {order.ship_address2 ? `, ${order.ship_address2}` : ''}, {order.ship_city}{' '}
                  {order.ship_state} {order.ship_postal}
                </span>
              </div>
            )}
          </div>

          <div className="sumlines">
            {order.lines.map((l) => (
              <div className="sumline" key={l.id}>
                <span className="sumtitle">
                  {l.quantity}× {l.title}
                </span>
                <span className="sumprice">{money(l.line_total)}</span>
              </div>
            ))}
          </div>

          <div className="sumrow">
            <span>Subtotal</span>
            <span>{money(order.subtotal)}</span>
          </div>
          <div className="sumrow">
            <span>Shipping</span>
            <span>{order.shipping === '0.00' ? 'Free' : money(order.shipping)}</span>
          </div>
          <div className="sumrow">
            <span>Tax</span>
            <span>{money(order.tax)}</span>
          </div>
          <div className="sumrow total">
            <b>Total</b>
            <b>{money(order.total)}</b>
          </div>
        </div>

        <div className="hbtns" style={{ marginTop: 24 }}>
          <Link className="btn btn--primary" to="/shop">
            Keep shopping
          </Link>
          <a className="btn btn--ghost" href={`mailto:${STORE.email}`}>
            Questions? Email us
          </a>
        </div>
      </div>
    </div>
  )
}
