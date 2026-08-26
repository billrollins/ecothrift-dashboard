import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCatalog, money, type CatalogItem } from '../api'
import StoreMap from '../components/StoreMap'
import { useCart } from '../cart'
import StoreHoursBlock from '../components/StoreHoursBlock'
import { retailMapsDirectionsUrl, STORE, storeJsonLd } from '../data/content'
import { usePublicHours } from '../lib/storeHours'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import { useJsonLd, useSeo } from '../useSeo'

/** Show the panel as soon as any photographed available listing exists. */
const FEATURED_MIN = 1
/** Pool of featured items you can page through beside the intro. */
const FEATURED_SHOWN = 8

function FeaturedSlide({
  item,
  onAdd,
  eager,
}: {
  item: CatalogItem
  onAdd: (item: CatalogItem) => void
  eager?: boolean
}) {
  return (
    <article className="featured-slide">
      <Link to={`/shop/${item.slug}`} className="featured-slide__media">
        {item.image ? (
          <img
            src={item.image.url}
            alt={item.image.alt || item.title}
            width={640}
            height={480}
            loading={eager ? 'eager' : 'lazy'}
          />
        ) : (
          <span className="ph g3" />
        )}
        {item.on_sale && item.available > 0 && <span className="badge sale">Sale</span>}
        {item.available <= 0 && <span className="badge reserved">Reserved</span>}
      </Link>
      <div className="featured-slide__body">
        {item.category_name ? (
          <div className="prodcat">{item.category_name}</div>
        ) : null}
        <Link to={`/shop/${item.slug}`} className="featured-slide__title">
          {item.title}
        </Link>
        <div className="prodmeta">{item.condition_display}</div>
        <div className="prodprice">
          {money(item.price)}
          {item.on_sale && item.compare_at_price ? (
            <span className="was">{money(item.compare_at_price)}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={item.available <= 0}
          onClick={() => onAdd(item)}
        >
          {item.available > 0 ? 'Add to hold list' : 'Reserved'}
        </button>
      </div>
    </article>
  )
}

export default function HomePage() {
  const { hours, status, label } = usePublicHours()
  useSeo({ description: STORE.metaDescription, path: '/' })
  useJsonLd(storeJsonLd(hours))
  const { config, loading: configLoading } = useOnlineSalesConfig()
  const shopOn = config.online_sales_enabled
  const { add } = useCart()

  const [featured, setFeatured] = useState<CatalogItem[]>([])
  const [featuredLoading, setFeaturedLoading] = useState(true)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    if (configLoading) return
    if (!shopOn) {
      setFeatured([])
      setFeaturedLoading(false)
      return
    }
    let active = true
    setFeaturedLoading(true)
    fetchCatalog({ sort: 'featured', page_size: 16, available: '1' })
      .then((page) => {
        if (!active) return
        const withImage = (page.results || []).filter((it) => it.image?.url)
        setFeatured(withImage.slice(0, FEATURED_SHOWN))
        setSlide(0)
      })
      .catch(() => {
        if (active) setFeatured([])
      })
      .finally(() => {
        if (active) setFeaturedLoading(false)
      })
    return () => {
      active = false
    }
  }, [configLoading, shopOn])

  const showFeatured = !featuredLoading && featured.length >= FEATURED_MIN
  const showFeaturedPane = featuredLoading || showFeatured
  const canNavigate = featured.length > 1
  const current = featured[slide] || null

  const go = (delta: number) => {
    if (!canNavigate) return
    setSlide((i) => (i + delta + featured.length) % featured.length)
  }

  // Don't promise online listings while the feature is off, and don't flash the
  // wrong sentence before the config lands.
  let onlineNote = ''
  if (shopOn) {
    onlineNote =
      'A handful of special items are listed online - reserve one here, then pay and pick it up in store.'
  } else if (!configLoading) {
    onlineNote = 'Online listings are on the way.'
  }

  return (
    <div className="home">
      <section className="intro">
        <div className={`wrap intro__row${showFeaturedPane ? ' intro__row--split' : ''}`}>
          <div className="intro__copy">
            <h1>Quality goods, fair prices, every week.</h1>
            <p>
              Eco-Thrift is a liquidation and thrift store in Omaha. Brand-name overstock and
              secondhand finds, inspected and priced fairly, with new stock arriving weekly.
            </p>
            <p className="intro__note">
              Most of what we carry is on the floor at the Canfield store. {onlineNote}
            </p>
          </div>

          {showFeaturedPane && (
            <div className="intro__featured" id="featured">
              <div className="intro__featured-head">
                <h2 className="h2">Featured online</h2>
                <Link className="link" to="/shop">
                  Full store →
                </Link>
              </div>

              {featuredLoading || !current ? (
                <div className="featured-slide featured-slide--skeleton" aria-busy="true">
                  <span className="featured-slide__media ph g3" />
                  <div className="featured-slide__body">
                    <span className="skline" />
                    <span className="skline short" />
                  </div>
                </div>
              ) : (
                <FeaturedSlide
                  item={current}
                  eager
                  onAdd={(it) =>
                    add({
                      slug: it.slug,
                      title: it.title,
                      price: parseFloat(it.price),
                      image: it.image?.url ?? null,
                      stock: it.stock,
                    })
                  }
                />
              )}

              {canNavigate ? (
                <div className="featured-nav">
                  <button
                    type="button"
                    className="featured-nav__btn"
                    onClick={() => go(-1)}
                    aria-label="Previous featured item"
                  >
                    ←
                  </button>
                  <span className="featured-nav__count" aria-live="polite">
                    {slide + 1} / {featured.length}
                  </span>
                  <button
                    type="button"
                    className="featured-nav__btn"
                    onClick={() => go(1)}
                    aria-label="Next featured item"
                  >
                    →
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="home__visit" aria-label="Visit the store">
        <div className="wrap">
          <div className="visit visit--compact">
            <StoreMap />
            <div className="vinfo">
              <h3>{STORE.retail.name}</h3>
              <div className="vrow">
                <b>Address</b>
                <span>{STORE.retail.address}</span>
              </div>
              <StoreHoursBlock status={status} label={label} />
              <div className="vrow">
                <b>Phone</b>
                <span>
                  <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
                </span>
              </div>
              <div className="vrow">
                <b>Directions</b>
                <span>
                  <a href={retailMapsDirectionsUrl()} target="_blank" rel="noreferrer">
                    Get directions
                  </a>
                </span>
              </div>
              <div className="vrow">
                <b>Pickup</b>
                <span>Free, usually ready the same day</span>
              </div>
              <div className="vrow">
                <b>Reviews</b>
                <span>
                  <a href={STORE.retail.reviewsUrl} target="_blank" rel="noreferrer">
                    Read our Google reviews
                  </a>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
