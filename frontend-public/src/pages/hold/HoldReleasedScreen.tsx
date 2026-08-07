import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCatalog, type CatalogItem, type HoldSummary } from '../../api'
import ProductGrid from '../../components/ProductGrid'
import { HoldShell, ItemCard } from './shared'

export default function HoldReleasedScreen({ hold }: { hold: HoldSummary }) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const category = hold.listing_category_slug || ''
  const shopLabel = hold.listing_category_name
    ? `Shop ${hold.listing_category_name.toLowerCase()}`
    : 'Shop'

  useEffect(() => {
    let active = true
    fetchCatalog({
      category: category || undefined,
      sort: 'featured',
      available: '1',
    })
      .then((page) => {
        if (!active) return
        setItems((page.results || []).slice(0, 8))
      })
      .catch(() => {
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [category])

  return (
    <HoldShell hold={hold} showRail={false}>
      <h1 className="holdflow__h1">{hold.headline || 'This one went back on the floor'}</h1>
      <p className="holdflow__next">
        {hold.listing_title}
        {hold.release_reason ? ` · ${hold.release_reason}` : ''}
      </p>

      {items.length > 0 && (
        <>
          <h2 className="holdflow__h2">Still in stock right now</h2>
          <ProductGrid items={items} showAdd={false} />
        </>
      )}

      <Link
        className="btn btn--primary btn--xl"
        to={category ? `/shop?category=${encodeURIComponent(category)}` : '/shop'}
      >
        {shopLabel}
      </Link>

      <ItemCard hold={hold} />
    </HoldShell>
  )
}
