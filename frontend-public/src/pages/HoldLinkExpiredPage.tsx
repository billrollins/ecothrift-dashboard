import { Link } from 'react-router-dom'
import { useSeo } from '../useSeo'

export default function HoldLinkExpiredPage() {
  useSeo({ title: 'Link expired', noindex: true })
  return (
    <div className="wrap holdflow">
      <h1 className="holdflow__h1">That confirmation link is no longer valid</h1>
      <p className="holdflow__next">
        Open the hold status page from your email, or request a hold again from the shop.
        We can send a fresh code from the status page.
      </p>
      <Link className="btn btn--primary btn--xl" to="/shop">
        Shop
      </Link>
    </div>
  )
}
