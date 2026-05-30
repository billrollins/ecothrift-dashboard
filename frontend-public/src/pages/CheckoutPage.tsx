import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { checkout, money, type CheckoutInput } from '../api'
import { useCart } from '../cart'
import { STORE } from '../data/content'
import { useSeo } from '../useSeo'

export default function CheckoutPage() {
  useSeo({ title: 'Checkout', noindex: true })
  const navigate = useNavigate()
  const { lines, subtotal, clear } = useCart()

  const [form, setForm] = useState({
    customer_name: '',
    email: '',
    phone: '',
    note: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const canSubmit = useMemo(
    () => lines.length > 0 && form.customer_name.trim() && form.email.trim() && !submitting,
    [lines.length, form.customer_name, form.email, submitting],
  )

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const payload: CheckoutInput = {
      items: lines.map((l) => ({ slug: l.slug, qty: l.qty })),
      customer_name: form.customer_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      fulfillment: 'pickup',
      note: form.note.trim(),
    }
    try {
      const order = await checkout(payload)
      clear()
      navigate(`/order/${order.order_number}`, { state: { payment: order.payment } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (lines.length === 0) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Checkout</div>
          <h1>Your cart is empty</h1>
        </div>
        <p className="lead">Add a few finds and they&rsquo;ll show up here.</p>
        <div className="hbtns" style={{ marginTop: 18, marginBottom: 60 }}>
          <Link className="btn btn--primary" to="/shop">
            Browse the shop
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Checkout</div>
        <h1>Almost there</h1>
      </div>

      <form className="checkout" onSubmit={onSubmit}>
        <div className="checkout-form">
          {error && <div className="formerror">{error}</div>}

          <h3 className="fsec">Contact</h3>
          <div className="formgrid">
            <label className="field span2">
              <span>Full name *</span>
              <input
                value={form.customer_name}
                onChange={(e) => set('customer_name', e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Email *</span>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </label>
          </div>

          <h3 className="fsec">Pickup</h3>
          <div className="pickupnote">
            <b>Free in-store pickup</b> at {STORE.retail.name}, {STORE.retail.address}.{' '}
            {STORE.retail.hours}. Call ahead and we&rsquo;ll stage your order.
          </div>

          <h3 className="fsec">Order notes</h3>
          <label className="field">
            <textarea
              rows={3}
              placeholder="Anything we should know?"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </label>

          <div className="paynote">
            <b>Online payment is coming soon.</b> Place your order now and we&rsquo;ll follow up — pay
            in store when you pick up.
          </div>
        </div>

        <aside className="checkout-summary">
          <h3>Order summary</h3>
          <div className="sumlines">
            {lines.map((l) => (
              <div className="sumline" key={l.slug}>
                <span className="sumthumb">
                  {l.image ? <img src={l.image} alt={l.title} /> : <span className="ph g3" />}
                  <span className="sumqty">{l.qty}</span>
                </span>
                <span className="sumtitle">{l.title}</span>
                <span className="sumprice">{money(l.price * l.qty)}</span>
              </div>
            ))}
          </div>
          <div className="sumrow">
            <span>Subtotal</span>
            <b>{money(subtotal)}</b>
          </div>
          <div className="sumrow muted">
            <span>Tax</span>
            <span>Calculated at pickup</span>
          </div>
          <button className="btn btn--primary placeorder" type="submit" disabled={!canSubmit}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
          <Link className="cartcontinue" to="/shop">
            Continue shopping
          </Link>
        </aside>
      </form>
    </div>
  )
}
