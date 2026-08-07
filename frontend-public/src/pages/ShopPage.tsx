import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchCatalog,
  fetchCategories,
  type CatalogItem,
  type CategoryCount,
} from '../api'
import { useCart } from '../cart'
import ProductGrid from '../components/ProductGrid'
import { SHOP_CATEGORIES } from '../data/content'
import { useSeo } from '../useSeo'

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'new', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
]

export default function ShopPage() {
  useSeo({
    title: 'Shop',
    description:
      'Browse Eco-Thrift’s curated online finds - furniture, electronics, tools, home goods and more, with new arrivals every week. Free pickup at our Omaha store.',
    path: '/shop',
  })
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? 'featured'
  const q = params.get('q') ?? ''

  const [searchInput, setSearchInput] = useState(q)
  const [categories, setCategories] = useState<CategoryCount[]>([])
  const [items, setItems] = useState<CatalogItem[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const { add } = useCart()

  useEffect(() => {
    fetchCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    setSearchInput(q)
  }, [q])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    fetchCatalog({ category: category || undefined, sort, q: q || undefined })
      .then((page) => {
        if (!active) return
        setItems(page.results)
        setCount(page.count)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [category, sort, q])

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    updateParam('q', searchInput.trim())
  }

  const displayCategories =
    categories.length > 0
      ? categories
      : SHOP_CATEGORIES.map((c) => ({ name: c.name, slug: c.slug, count: 0 }))

  const activeCategoryName =
    displayCategories.find((c) => c.slug === category)?.name ??
    SHOP_CATEGORIES.find((c) => c.slug === category)?.name ??
    (category ? category : 'Shop all')

  return (
    <div className="wrap shopwrap">
      <aside className="shopside">
        <h5>Categories</h5>
        <nav>
          <Link className={`catlink${!category ? ' on' : ''}`} to="/shop">
            <span>All</span>
          </Link>
          {displayCategories.map((c) => (
            <Link
              key={c.slug}
              className={`catlink${category === c.slug ? ' on' : ''}`}
              to={`/shop?category=${encodeURIComponent(c.slug)}`}
            >
              <span>{c.name}</span>
              <span>{c.count}</span>
            </Link>
          ))}
        </nav>
        <div className="sidediv" />
        <div className="pickupnote">
          <b>Free in-store pickup.</b> Most items are one of a kind. Reserve online and pick up at
          our Canfield store in Omaha.
        </div>
      </aside>

      <div className="shopmain">
        <div className="shophead">
          <div>
            <h1 className="shoptitle">{activeCategoryName}</h1>
            <div className="sub">
              {loading ? 'Loading…' : `${count} item${count === 1 ? '' : 's'}`}
              {q ? ` · “${q}”` : ''}
            </div>
          </div>
          <div className="shopctrls">
            <form onSubmit={onSearchSubmit} className="shopsearch">
              <input
                type="search"
                placeholder="Search the shop…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search the shop"
              />
            </form>
            <select
              value={sort}
              onChange={(e) => updateParam('sort', e.target.value)}
              aria-label="Sort"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="comingsoon">
            <h3>We couldn&rsquo;t load the catalog</h3>
            <p>Please refresh in a moment. If it keeps happening, the shop may be briefly offline.</p>
          </div>
        ) : loading ? (
          <div className="prodgrid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="prodcard skeleton" key={i}>
                <span className="prodthumb ph g3" />
                <div className="prodbody">
                  <span className="skline" />
                  <span className="skline short" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="comingsoon">
            <h3>The online shop is opening soon</h3>
            <p>
              We&rsquo;re hand-picking and photographing our best finds to sell online. In the
              meantime, the full inventory is on the floor at our Omaha store.
            </p>
            <div className="hbtns" style={{ justifyContent: 'center' }}>
              <Link className="btn btn--primary" to="/visit">
                Visit the store
              </Link>
            </div>
          </div>
        ) : (
          <ProductGrid
            items={items}
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
      </div>
    </div>
  )
}
