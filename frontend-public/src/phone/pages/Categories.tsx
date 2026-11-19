/**
 * Categories (mockup pages/departments.html): the store's 23 categories as picture tiles, biggest first,
 * "Mixed lots & uncategorized" last as one wide lime row. Each tile shows its count and opens the in-store list for it.
 * Until the stock is here the tiles stand in the order of the last known counts with their badges kept but invisible,
 * so nothing shifts when the counts arrive (every tile is the same size).
 */
import { Link } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { count } from '../lib/format'
import { CATS, type Cat, useStock } from '../lib/stock'
import { catPic, isWide } from '../shell/pictures'
import { BackRow } from './infoParts'
import './Categories.css'

/** Biggest first as of 2026-11-19 (production counts): the order shown before the stock arrives. */
const KNOWN_ORDER = [
  'apparel', 'toys', 'health', 'party', 'kitchen', 'decor', 'tools', 'sports', 'electronics', 'household', 'office',
  'bedbath', 'baby', 'pet', 'auto', 'media', 'patio', 'storage', 'furniture', 'garden', 'appliances', 'crafts', 'other',
]

/** The tiles in order: by count when the counts are known, else the known order; "other" always last. */
export function orderCats(live: Cat[] | null | undefined): Cat[] {
  const byId = new Map((live || []).map((c) => [c.id, c]))
  const all: Cat[] = CATS.map((c) => byId.get(c.id) || { id: c.id, name: c.name, pieces: null })
  for (const c of live || []) if (!CATS.some((k) => k.id === c.id)) all.push(c)
  const rank = (id: string) => {
    const i = KNOWN_ORDER.indexOf(id)
    return i < 0 ? KNOWN_ORDER.length - 1 : i
  }
  const known = Boolean(live && live.length)
  return all.sort((a, b) => {
    const oa = a.id === 'other' ? 1 : 0
    const ob = b.id === 'other' ? 1 : 0
    if (oa !== ob) return oa - ob
    if (known) {
      const d = (b.pieces ?? -1) - (a.pieces ?? -1)
      if (d) return d
    }
    return rank(a.id) - rank(b.id)
  })
}

export default function Categories() {
  const feed = useHome()
  const { stock } = useStock()
  const cats = orderCats(stock?.cats)
  const pieces = feed?.shelf.pieces
  return (
    <div className="dp-page">
      <div className="dp-hd">
        <BackRow />
        <p className="lbl">
          <span className="tn" style={pieces === undefined ? { opacity: 0 } : undefined}>
            {pieces === undefined ? '0' : count(pieces)}
          </span>{' '}
          pieces in store today
        </p>
        <h1 className="disp dp-h">
          <span>{cats.length}</span> categories
        </h1>
      </div>
      <div className="dp-g">
        {cats.map((c) => {
          const pic = catPic(c.id)
          const other = c.id === 'other'
          const cls = `dp-t${other ? ' dp-other' : ''}${isWide(c.id) ? ' wide' : ''}`
          return (
            <Link key={c.id} className={cls} to={`/store?cat=${encodeURIComponent(c.id)}`}>
              <b>{c.name}</b>
              {pic && !other ? (
                <img src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" />
              ) : null}
              <span className="cnt fade" style={c.pieces === null ? { opacity: 0 } : undefined}>
                {c.pieces === null ? '0' : count(c.pieces)}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
