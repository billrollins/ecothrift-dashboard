/**
 * Home 2, best finds (mockup blocks/20-finds.html): a white band, a slider of the feed's `finds`. Photo (the feed's
 * photo when it gives one: a photo-sheet photo or a stock photo, never an Add item photo; the item page carries the stock
 * photo's "may not match" line; else its category's studio picture), name, the tag price, retail struck, and the
 * ThriftBucks on their own line; "Thrift+ members" once in the band. A card opens that piece.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHome, type Find } from '../../lib/boot'
import { bucks, money } from '../../lib/format'
import { catName } from '../../lib/stock'
import { catPic } from '../../shell/pictures'
import { Tag } from '../../shell/Tag'
import './Finds.css'

/** The same list, but never two of one category side by side (they would show the same picture). */
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
  const pic = catPic(f.cat)
  const own = f.photo
  const gone = missing || (!own && !pic)
  return (
    <div className={`ph-img${gone ? ' fd-miss' : ''}`} data-dept={catName(f.cat)}>
      {own ? (
        <img src={own} width={150} height={150} alt="" loading="lazy" decoding="async" onError={() => setMissing(true)} />
      ) : pic ? (
        <img className="cut" src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" onError={() => setMissing(true)} />
      ) : null}
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
          <span className="fd-none">No ThriftBucks on this one</span>
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
