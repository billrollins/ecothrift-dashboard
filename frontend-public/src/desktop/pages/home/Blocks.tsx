/**
 * Home 2 to 5 on a computer, each the phone home's block (phone/pages/home/) laid out wide, from the same feed:
 * Best finds (only pieces with their own photo; a card whose photo fails is left out, never a stand-in), Shop by
 * category (the six with the most items, with their real counts), On the truck (no price: priced on arrival), Visit.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHome, type ComingItem, type Find, type Truck } from '../../../phone/lib/boot'
import { bucks, count, money } from '../../../phone/lib/format'
import { CATS, catById, catName, useStock } from '../../../phone/lib/stock'
import { spread } from '../../../phone/pages/home/Finds'
import PhoneVisit from '../../../phone/pages/home/Visit'
import { catPic } from '../../../phone/shell/pictures'
import { Tag } from '../../../phone/shell/Tag'
import { useDeskDay } from '../../lib/day'
import { BF_PRICE, PRICED_ON_ARRIVAL } from '../../words'

/** How many cards a home grid shows: whole rows of six (two at most), or all of them when fewer than six. */
export function fullRows(n: number, perRow = 6, maxRows = 2): number {
  if (n < perRow) return n
  return Math.min(maxRows, Math.floor(n / perRow)) * perRow
}

/** The ThriftBucks line of an in-store card: always there, grey at 0.00. On Black Friday (#220) the price shown IS the
 *  Black Friday price, the same for everyone: the line says so instead, never ThriftBucks. */
export function TbLine({ tb }: { tb: number }) {
  const day = useDeskDay()
  if (day === 'bf') return <span className="dk-tb bf">{BF_PRICE}</span>
  if (!(tb > 0)) return <span className="dk-tb none tn">0.00 ThriftBucks</span>
  return <span className="dk-tb tn">+ {bucks(tb)} ThriftBucks</span>
}

function FindCard({ f, onFail }: { f: Find; onFail: (pid: number) => void }) {
  return (
    <Link className="dk-pc" to={`/store/item/p${f.pid}`}>
      <div className="pic">
        <img src={f.photo!} width={240} height={240} alt="" loading="lazy" decoding="async" onError={() => onFail(f.pid)} />
      </div>
      <div className="bd">
        <p className="nm">{f.name}</p>
        <div className="pr">
          <Tag price={f.price} />
          {f.retail > f.price ? <span className="dk-strike tn">Retail <s>{money(f.retail)}</s></span> : null}
        </div>
        <TbLine tb={f.tb} />
      </div>
    </Link>
  )
}

export function Finds() {
  const feed = useHome()
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())
  const onFail = (pid: number) => setFailed((prev) => new Set(prev).add(pid))
  const shown = feed ? spread(feed.finds.filter((f) => f.photo && !failed.has(f.pid))) : []
  if (feed && !shown.length) return null
  return (
    <section className="dk-w dk-sec" id="finds">
      <div className="dk-sec-hd">
        <h2 className="dk-h">Best finds</h2>
        <Link to="/store">See all in store ›</Link>
      </div>
      <div className="dk-grid">
        {feed
          ? shown.slice(0, fullRows(shown.length)).map((f) => <FindCard key={f.pid} f={f} onFail={onFail} />)
          : [0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="dk-pc" aria-hidden="true"><div className="pic" /><div className="bd" style={{ minHeight: 120 }} /></div>)}
      </div>
    </section>
  )
}

/** The mockup's six, only while a page came without its feed (as the phone's ShopByCategory). */
const FALLBACK = ['apparel', 'toys', 'health', 'party', 'kitchen', 'decor']

export function ShopByCategory() {
  const feed = useHome()
  useStock() // the counts arrive with the stock
  const top = (feed?.top_cats?.length ? feed.top_cats : FALLBACK).slice(0, 6).map((c) =>
    typeof c === 'string' ? { id: c, pieces: undefined as number | undefined } : { id: c.id, pieces: c.pieces },
  )
  const n = feed?.shelf.categories || CATS.length
  return (
    <section className="dk-w dk-sec" id="categories">
      <div className="dk-sec-hd">
        <h2 className="dk-h">Shop by category</h2>
        <Link to="/categories">All {n} categories ›</Link>
      </div>
      <div className="dk-cats">
        {top.map(({ id, pieces }) => {
          const cat = catById(id)
          const pic = catPic(id)
          const known = pieces ?? cat?.pieces ?? null
          return (
            <Link key={id} className="dk-cat" to={`/store?cat=${encodeURIComponent(id)}`}>
              <b>{cat?.name || id}</b>
              {pic ? <img src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" /> : null}
              <span className="cnt tn fade" style={known === null ? { opacity: 0 } : undefined}>
                {known === null ? '0' : count(known)}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function ComingCard({ it, truck }: { it: ComingItem; truck: Truck | undefined }) {
  return (
    <Link className="dk-pc" to={`/store/item/m${it.id}`}>
      <div className="dk-cm-top">
        <span className="lbl">{catName(it.cat)}</span>
        {truck ? <span className="dk-truck lbl">{truck.name} truck</span> : null}
      </div>
      <div className="bd">
        <p className="nm">{it.name}</p>
        <p className="dk-rt tn">
          {it.retail > 0 ? (
            <>
              Retail <b>{money(it.retail)}</b>
            </>
          ) : null}
        </p>
        <p className="dk-poa">{PRICED_ON_ARRIVAL}</p>
      </div>
    </Link>
  )
}

export function Coming() {
  const feed = useHome()
  const items = feed?.coming?.items || []
  if (!items.length) return null
  const trucks = new Map((feed?.coming.trucks || []).map((t) => [t.id, t]))
  return (
    <section className="dk-w dk-sec" id="coming">
      <div className="dk-sec-hd">
        <h2 className="dk-h">On the truck</h2>
        <Link to="/store?where=coming">See all coming ›</Link>
      </div>
      <div className="dk-grid">
        {items.slice(0, fullRows(items.length)).map((it) => (
          <ComingCard key={it.id} it={it} truck={trucks.get(it.truck)} />
        ))}
      </div>
    </section>
  )
}

/** The phone's Visit block (the drawn map of the corner, open or not, the week, Directions, Call), laid out wide. */
export function VisitBand() {
  return (
    <section className="dk-visit-band">
      <div className="dk-w dk-visit">
        <PhoneVisit />
      </div>
    </section>
  )
}
