/**
 * Home 3, shop by category (mockup blocks/30-departments.html): the six categories with the most pieces (the feed's
 * `top_cats`) as picture tiles with their real counts. A tile opens the in-store list for it; the row under them opens
 * the page of all 23. The home feed names the six; their counts come with the stock (lib/stock.ts) or, when the feed
 * carries them, from `top_cats` itself. A count not known yet keeps its badge's place, invisible.
 */
import { Link } from 'react-router-dom'
import { useHome } from '../../lib/boot'
import { count } from '../../lib/format'
import { CATS, catById, useStock } from '../../lib/stock'
import { catPic, isWide } from '../../shell/pictures'
import './ShopByCategory.css'

/** The mockup's six, used only while a page came without its feed. */
const FALLBACK = ['apparel', 'toys', 'health', 'party', 'kitchen', 'decor']

export default function ShopByCategory() {
  const feed = useHome()
  useStock() // the counts arrive with the stock
  const top = (feed?.top_cats?.length ? feed.top_cats : FALLBACK).slice(0, 6).map((c) =>
    typeof c === 'string' ? { id: c, pieces: undefined as number | undefined } : { id: c.id, pieces: c.pieces },
  )
  const total = feed?.shelf.pieces
  const n = feed?.shelf.categories || CATS.length
  return (
    <section className="dp-band" id="categories">
      <div className="sh">
        <h2>Shop by category</h2>
        <Link to="/store">
          <span className="tn">{total === undefined ? ' ' : count(total)}</span> in store
        </Link>
      </div>
      <div className="dp-grid">
        {top.map(({ id, pieces }) => {
          const cat = catById(id)
          const pic = catPic(id)
          const known = pieces ?? cat?.pieces ?? null
          return (
            <Link key={id} className={`dp-tile${isWide(id) ? ' wide' : ''}`} to={`/store?cat=${encodeURIComponent(id)}`}>
              <b>{cat?.name || id}</b>
              {pic ? <img src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" /> : null}
              <span className="cnt fade" style={known === null ? { opacity: 0 } : undefined}>
                {known === null ? '0' : count(known)}
              </span>
            </Link>
          )
        })}
      </div>
      <Link className="dp-all" to="/categories">
        <span>All {n} categories</span>
        <span>›</span>
      </Link>
    </section>
  )
}
