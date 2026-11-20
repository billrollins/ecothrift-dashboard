/**
 * Home 2, best finds (mockup blocks/20-finds.html): a white band, a slider of the feed's `finds`. Photo only when the
 * piece has its own (the feed's photo: a photo-sheet photo or a stock photo, never an Add item photo; the item page
 * carries the stock photo's "may not match" line); else, and when that photo fails to load, a calm text tile of the
 * same size with the category in small capitals (owner 11-19: no stand-in pictures). Then the name, the tag price,
 * retail struck, and the ThriftBucks on their own line (grey "0.00 ThriftBucks" when none, as the list says it);
 * "Thrift+ members" once in the band. A card opens that piece.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHome, type Find } from '../../lib/boot'
import { bucks, money } from '../../lib/format'
import { catName } from '../../lib/stock'
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

function Photo({ f }: { f: Find }) {
  const [missing, setMissing] = useState(false)
  if (!f.photo || missing) {
    return (
      <div className="ph-img ph-txt">
        <span className="lbl ph-cat">{catName(f.cat)}</span>
      </div>
    )
  }
  return (
    <div className="ph-img">
      <img src={f.photo} width={150} height={150} alt="" loading="lazy" decoding="async" onError={() => setMissing(true)} />
    </div>
  )
}

function Card({ f }: { f: Find }) {
  const b = bucks(f.tb)
  return (
    <Link className="pc" to={`/store/item/p${f.pid}`}>
      <Photo f={f} />
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
  if (feed && !feed.finds.length) return null
  return (
    <section className="fd" id="finds">
      <div className="sh">
        <h2>Best finds</h2>
        <Link to="/store">See all</Link>
      </div>
      <div className="rail fd-rail">
        {feed ? spread(feed.finds).map((f) => <Card key={f.pid} f={f} />) : [0, 1, 2].map((k) => <Blank key={k} />)}
      </div>
      <p className="fine fd-fine">
        <span className="if-normal">Thrift+ members collect these ThriftBucks. Most items.</span>
        <span className="if-bf">Thrift+ members: these come off today. Most items.</span>
      </p>
    </section>
  )
}
