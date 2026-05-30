import { Link } from 'react-router-dom'
import { useSeo } from '../useSeo'

export default function NotFoundPage() {
  useSeo({ title: 'Page not found', noindex: true })
  return (
    <div className="wrap">
      <div className="pagehead" style={{ paddingBottom: 60 }}>
        <span className="eyebrow">404</span>
        <h1>We couldn&rsquo;t find that page</h1>
        <p className="lead">
          The page you were looking for may have moved. Let&rsquo;s get you back on track.
        </p>
        <div className="hbtns" style={{ marginTop: 24 }}>
          <Link className="btn btn--primary" to="/">
            Back to home
          </Link>
          <Link className="btn btn--ghost" to="/shop">
            Browse the shop
          </Link>
        </div>
      </div>
    </div>
  )
}
