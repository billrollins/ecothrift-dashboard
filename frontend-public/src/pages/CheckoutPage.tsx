import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { money, requestHold } from '../api'
import { useCart } from '../cart'
import { STORE } from '../data/content'
import { useSeo } from '../useSeo'

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `hold-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function CheckoutPage() {
  useSeo({ title: 'Request a hold', noindex: true })
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
    try {
      const result = await requestHold({
        items: lines.map((l) => ({ slug: l.slug, qty: l.qty })),
        customer_name: form.customer_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        note: form.note.trim(),
        idempotency_key: newIdempotencyKey(),
      })
      clear()
      const token =
        'status_token' in result
          ? result.status_token
          : result.holds?.[0]?.status_token
      if (!token) throw new Error('Hold created but no status link was returned.')
      navigate(`/hold/${token}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (lines.length === 0) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Hold request</div>
          <h1>Nothing selected</h1>
        </div>
        <p className="lead">Add items from the shop, then request a hold for in-store pickup.</p>
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
        <div className="eyebrow">Hold request</div>
        <h1>Request a hold</h1>
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

          <h3 className="fsec">Pickup policy</h3>
          <div className="pickupnote">
            <b>Pay and pick up in store</b> at {STORE.retail.name}, {STORE.retail.address}.{' '}
            {STORE.retail.hours}. No shipping, delivery, or online payment. {/* POLICY_COPY_OK */} Staff confirm holds;
            confirmed holds last until store close the next business day. Items are typically final sale.
          </div>

          <h3 className="fsec">Notes</h3>
          <label className="field">
            <textarea
              rows={3}
              placeholder="Anything we should know?"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </label>
        </div>

        <aside className="checkout-summary">
          <h3>Hold summary</h3>
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
            <span>Tax & payment</span>
            <span>At pickup in store</span>
          </div>
          <button className="btn btn--primary placeorder" type="submit" disabled={!canSubmit}>
            {submitting ? 'Requesting hold…' : 'Request a hold'}
          </button>
          <Link className="cartcontinue" to="/shop">
            Continue shopping
          </Link>
        </aside>
      </form>
    </div>
  )
}
