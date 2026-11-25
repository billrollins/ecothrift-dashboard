/**
 * Home 2, best finds (mockup blocks/20-finds.html): a white band, a slider of the feed's `finds`, which are only pieces
 * with their own photo (a photo-sheet photo or a stock photo, never an Add item photo; owner 2026-11-20: "these items will
 * all HAVE to be curated and have photos... NO category tiles"). A card whose photo fails to load is left out, never a
 * tile. Then the name, the tag price, retail struck, and the ThriftBucks on their own line (grey "0.00 ThriftBucks"
 * when none). No fine print (owner 2026-11-20, rulebook V14). A card opens that piece.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHome, type Find } from '../../lib/boot'
import { useDay } from '../../lib/day'
import { bucks, money } from '../../lib/format'
import { Tag } from '../../shell/Tag'
import './Finds.css'

/** The same list, but never two of one category side by side (two text tiles of one name would read as a repeat). */
export function spread<T extends { cat: string }>(rows: T[]): T[] {
  const left = rows.slice()
  const out: T[] = []
  while (left.length) {
    const prev = out.length ? out[out.length - 1].cat : ''
    const k = Math.max(0, left.findIndex((r) => r.cat !== prev))
    out.push(left.splice(k, 1)[0])
  }
  return out
}

function Card({ f, onFail }: { f: Find; onFail: (pid: number) => void }) {
  const b = bucks(f.tb)
  return (
    <Link className="pc" to={`/store/item/p${f.pid}`}>
      <div className="ph-img">
        <img src={f.photo!} width={150} height={150} alt="" loading="lazy" decoding="async" onError={() => onFail(f.pid)} />
      </div>
      <p className="nm">{f.name}</p>
      <div className="fd-pr">
        <Tag price={f.price} />
        {f.retail > f.price ? <s className="tn">{money(f.retail)}</s> : null}
      </div>
      <p className="fd-tb tn">
        {f.tb > 0 ? (
          <>
            <span className="if-normal">+ {b} ThriftBucks</span>
            <span className="if-bf">{b} ThriftBucks off</span>
          </>
        ) : (
          <span className="fd-none">0.00 ThriftBucks</span>
        )}
      </p>
    </Link>
  )
}

/** A blank card of the same size while the feed is on its way (only when the page came without a stamp). */
function Blank() {
  return (
    <div className="pc" aria-hidden="true">
      <div className="ph-img" />
      <p className="nm">{' '}</p>
      <div className="fd-pr" />
      <p className="fd-tb">{' '}</p>
    </div>
  )
}

export default function Finds() {
  const feed = useHome()
  const day = useDay()
  // Pieces whose photo failed to load are left out; when none is left, so is the section (never an empty band).
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())
  const onFail = (pid: number) => setFailed((prev) => new Set(prev).add(pid))
  const shown = feed ? feed.finds.filter((f) => f.photo && !failed.has(f.pid)) : []
  if (feed && !shown.length) return null
  return (
    <section className="fd" id="finds">
      <div className="sh">
        <h2>Best finds</h2>
        {/* Black Friday (#228): no way into the store list from home that day. */}
        {day === 'bf' ? null : <Link to="/store">See all</Link>}
      </div>
      <div className="rail fd-rail">
        {feed ? spread(shown).map((f) => <Card key={f.pid} f={f} onFail={onFail} />) : [0, 1, 2].map((k) => <Blank key={k} />)}
      </div>
    </section>
  )
}
