import { Link } from 'react-router-dom'
import { useSeo } from '../useSeo'

/** Legacy order confirmation route - holds replace online ordering. */
export default function OrderConfirmationPage() {
  useSeo({ title: 'Hold required', noindex: true })
  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Orders</div>
        <h1>Request a hold instead</h1>
      </div>
      <p className="lead">
        {/* POLICY_COPY_OK: negation prose */}
        Request a hold online, then pay and pick up in store. No shipping, delivery, or online
        payment.
      </p>
      <Link className="btn btn--primary" to="/shop">
        Browse the shop
      </Link>
    </div>
  )
}
