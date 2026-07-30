import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchListing, money, type CatalogDetail } from '../api'
import { useCart } from '../cart'
import { SITE_URL, STORE } from '../data/content'
import { useJsonLd, useSeo } from '../useSeo'
import NotFoundPage from './NotFoundPage'

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const [listing, setListing] = useState<CatalogDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [qty, setQty] = useState(1)

  const { add } = useCart()

  useSeo({
    title: notFound ? 'Page not found' : listing?.title,
    description: listing
      ? listing.description?.replace(/\s+/g, ' ').trim().slice(0, 155) ||
        `${listing.title} — ${listing.condition_display} condition at Eco-Thrift, Omaha.`
      : undefined,
    path: `/shop/${slug}`,
    type: 'product',
    image: listing?.images?.[0]?.url,
    noindex: notFound,
  })
  useJsonLd(
    listing
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: listing.title,
          description: listing.description || `${listing.title} at Eco-Thrift.`,
          sku: listing.sku || undefined,
          category: listing.category_name || undefined,
          image: (listing.images ?? []).map((im) =>
            im.url.startsWith('http') ? im.url : `${SITE_URL}${im.url}`,
          ),
          offers: {
            '@type': 'Offer',
            price: listing.price,
            priceCurrency: 'USD',
            availability:
              listing.available > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: `${SITE_URL}/shop/${listing.slug}`,
          },
        }
      : null,
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    setActiveImage(0)
    setQty(1)
    fetchListing(slug)
      .then((data) => {
        if (active) setListing(data)
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
  }, [slug])

  if (notFound) return <NotFoundPage />

  if (loading || !listing) {
    return (
      <div className="wrap">
        <div className="pdp">
          <div className="pdpgallery">
            <span className="pdpmain ph g3" />
          </div>
          <div className="pdpinfo">
            <span className="skline" />
            <span className="skline short" />
          </div>
        </div>
      </div>
    )
  }

  const images = listing.images
  const main = images[activeImage] ?? images[0] ?? null

  return (
    <div className="wrap">
      <div className="crumb">
        <Link to="/shop">Shop</Link>
        {listing.category_name && listing.category_slug ? (
          <>
            {' / '}
            <Link to={`/shop?category=${encodeURIComponent(listing.category_slug)}`}>
              {listing.category_name}
            </Link>
          </>
        ) : null}
        {' / '}
        <span>{listing.title}</span>
      </div>

      <div className="pdp">
        <div className="pdpgallery">
          <div className="pdpmain">
            {main ? <img src={main.url} alt={main.alt} /> : <span className="ph g3" />}
            {listing.on_sale && listing.available > 0 && <span className="badge sale">Sale</span>}
            {listing.available <= 0 && <span className="badge reserved">Reserved</span>}
          </div>
          {images.length > 1 && (
            <div className="pdpthumbs">
              {images.map((img, i) => (
                <button
                  key={img.id ?? i}
                  className={`pdpthumb${i === activeImage ? ' on' : ''}`}
                  onClick={() => setActiveImage(i)}
                  aria-label={`View image ${i + 1}`}
                >
                  <img src={img.url} alt={img.alt} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdpinfo">
          {listing.category_name && <div className="eyebrow">{listing.category_name}</div>}
          <h1 className="pdptitle">{listing.title}</h1>
          <div className="pdpprice">
            {money(listing.price)}
            {listing.on_sale && listing.compare_at_price && (
              <span className="was">{money(listing.compare_at_price)}</span>
            )}
          </div>
          <div className="pdpmeta">
            <span>Condition: {listing.condition_display}</span>
            {listing.sku && <span>SKU: {listing.sku}</span>}
            <span className={listing.available > 0 ? 'instock' : 'soldout'}>
              {listing.available > 0 ? 'Available to hold' : 'Reserved'}
            </span>
          </div>

          {listing.description ? (
            <div className="pdpdesc">
              {listing.description.split(/\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : null}

          {listing.available > 0 ? (
            <div className="addrow">
              <div className="qty">
                <button onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Decrease quantity">
                  −
                </button>
                <span>{qty}</span>
                <button
                  onClick={() => setQty((n) => Math.min(listing.stock, n + 1))}
                  disabled={qty >= listing.stock}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                className="btn btn--primary"
                onClick={() =>
                  add(
                    {
                      slug: listing.slug,
                      title: listing.title,
                      price: parseFloat(listing.price),
                      image: main?.url ?? null,
                      stock: listing.stock,
                    },
                    qty,
                  )
                }
              >
                Add to hold list
              </button>
            </div>
          ) : (
            <div className="addrow">
              <a className="btn btn--ghost" href={`mailto:${STORE.email}`}>
                Ask about similar finds
              </a>
            </div>
          )}

          <div className="pickupnote" style={{ marginTop: 22 }}>
            <b>Request a hold</b> — pay and pick up at {STORE.retail.address}.{' '}
            {/* POLICY_COPY_OK: negation prose */}
            No shipping, delivery, or online payment. {listing.hold_policy || ''}
          </div>
        </div>
      </div>
    </div>
  )
}
