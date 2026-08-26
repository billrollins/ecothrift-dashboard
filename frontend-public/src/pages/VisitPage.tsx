import { Link } from 'react-router-dom'
import StoreHoursBlock from '../components/StoreHoursBlock'
import StoreMap from '../components/StoreMap'
import { retailMapsDirectionsUrl, STORE, storeJsonLd } from '../data/content'
import { usePublicHours } from '../lib/storeHours'
import { useJsonLd, useSeo } from '../useSeo'

export default function VisitPage() {
  const { hours, status, label } = usePublicHours()
  useSeo({
    title: 'Visit',
    description: `Visit Eco-Thrift at ${STORE.retail.address}. Open ${label}.`,
    path: '/visit',
  })
  useJsonLd(storeJsonLd(hours))
  return (
    <>
      <div className="wrap">
        <div className="pagehead">
          <span className="eyebrow">Visit</span>
          <h1>Come see us at Canfield</h1>
          <p className="lead">
            Dig through the latest arrivals in person. New finds hit the floor all week.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="wrap">
          <div className="visit">
            <StoreMap />
            <div className="vinfo">
              <h3>Retail store</h3>
              <div className="vrow">
                <b>Address</b>
                <span>
                  {STORE.retail.name}
                  <br />
                  {STORE.retail.address}
                </span>
              </div>
              <StoreHoursBlock status={status} label={label} />
              <div className="vrow">
                <b>Phone</b>
                <span>
                  <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
                </span>
              </div>
              <div className="vrow">
                <b>Pickup</b>
                <span>Free, usually ready the same day. Call ahead and we&rsquo;ll stage it.</span>
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <a
                  className="btn btn--primary"
                  href={retailMapsDirectionsUrl()}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get directions
                </a>
                <Link className="btn btn--ghost" to="/shop">
                  Browse online
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
