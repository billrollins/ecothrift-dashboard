/**
 * One piece (mockup pages/item.html, prefix `it`): `/store/item/p<pid>` in store, `/store/item/m<row id>` coming.
 *
 * It paints at once from what is in memory (the stock, else the home feed), then asks `GET /api/storefront/item/<pid>/`
 * for the live numbers and the extras and fills them into slots that were already there, so nothing moves. A direct visit
 * before the stock is here paints from the endpoint alone. In store: the tag, retail struck, its ThriftBucks (always, grey
 * at 0.00), the member line (owner 11-19: ThriftBucks only, never a pay-today figure), the facts, the stock lines. Coming:
 * the retail and "Priced on arrival", never an estimate, never ThriftBucks.
 * A photo shows only from an allowed source (owner 11-19: a photo-sheet photo or a stock photo, never an Add item photo):
 * on top when the first paint knows it (the stock row's photo flag, the home feed's finds, or the endpoint on a direct
 * visit); under a stock photo one small grey line says it may not match. A photo-sheet photo learned later shows as a
 * small picture in the facts block, whose size was reserved anyway.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { useDay } from '../lib/day'
import { bucks, count, money, tagParts } from '../lib/format'
import { useMember } from '../lib/member'
import { catName, loadStock, useStock, type PhotoKind } from '../lib/stock'
import { Tag } from '../shell/Tag'
import {
  cachedItem, comingFromMemory, fetchItem, inStoreFromMemory, listHref, memberPick, mergeApi, parseId, returnsLabel,
  STOCK_LINE, type ApiItem, type ApiState, type ComingView, type InView,
} from './item/itemData'
import './Item.css'

const Chevron = ({ d }: { d: string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
)
/** The top photo as decided at the first paint. */
type Top = { photo: string | null; kind: PhotoKind | null }

const BACK = 'M15 5l-7 7 7 7'
const NEXT = 'M9 6l6 6-6 6'

/** The endpoint, once per piece (a fresh answer in memory paints at once). */
function useItemApi(pid: number | null): ApiState {
  const [res, setRes] = useState<ApiState>(() => (pid == null ? { state: 'none' } : cachedItem(pid) || { state: 'loading' }))
  const first = useRef(res)
  useEffect(() => {
    if (pid == null || first.current.state !== 'loading') return
    const ac = new AbortController()
    let live = true
    void fetchItem(pid, ac.signal).then((r) => {
      if (live) setRes(r)
    })
    return () => {
      live = false
      ac.abort()
    }
  }, [pid])
  return res
}

/** True once the stock has been asked for (and answered or failed), when `need` says the page depends on it. */
function useStockTried(need: boolean): boolean {
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (!need) return
    let live = true
    void loadStock().finally(() => {
      if (live) setTried(true)
    })
    return () => {
      live = false
    }
  }, [need])
  return tried
}

/** Back: where the visitor came from (the list with its state, or home at its slider); a direct visit goes to the list. */
function useBack(where: 'instore' | 'coming') {
  const nav = useNavigate()
  const loc = useLocation()
  return () => {
    if (loc.key !== 'default') nav(-1)
    else nav(listHref(where))
  }
}

function TopRow({ where, label }: { where: 'instore' | 'coming'; label: string }) {
  const back = useBack(where)
  return (
    <div className="it-top">
      <button type="button" className="backrow" onClick={back}>
        <Chevron d={BACK} />
        Back
      </button>
      <span className="lbl tn">{label}</span>
    </div>
  )
}

/**
 * The photo, edge to edge. A broken file leaves the slot (nothing moves) with the category name in it. Under a stock
 * photo, one small grey line, part of the same block from the first paint; a photo-sheet photo (ours) has none.
 */
function TopPhoto({ src, cat, kind }: { src: string; cat: string; kind: PhotoKind | null }) {
  const [broken, setBroken] = useState(false)
  return (
    <>
      <div className={`it-pic${broken ? ' it-miss' : ''}`} data-cat={catName(cat)}>
        <img src={src} width={390} height={260} alt="" decoding="async" onError={() => setBroken(true)} />
      </div>
      {kind === 'stock' ? <p className="it-stockline">{STOCK_LINE}</p> : null}
    </>
  )
}

function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <span className="it-thumb">
      <img src={src} width={88} height={88} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </span>
  )
}

/** The tag, retail struck, and the ThriftBucks beside it (always stated, grey at 0.00). */
function InNumbers({ v }: { v: InView }) {
  const b = bucks(v.tb)
  return (
    <div className="it-nums">
      <Tag price={v.price} className={v.price >= 1000 ? 'it-4' : ''} />
      <div className="it-side">
        <span className="it-rt tn">
          {v.retail > v.price ? (
            <>
              Retail <s>{money(v.retail)}</s>
            </>
          ) : null}
        </span>
        {v.tb > 0 ? (
          <span className="it-tb tn">
            <span className="if-normal">+ {b} ThriftBucks</span>
            <span className="if-bf">{b} ThriftBucks off</span>
          </span>
        ) : (
          <span className="it-tb it-tb0 tn">0.00 ThriftBucks</span>
        )}
        <span className="it-who">Thrift+ members. Most items.</span>
      </div>
    </div>
  )
}

/** The member line: one slot of one size, whoever is looking (and while we do not know yet). */
function MemberLine({ tb }: { tb: number }) {
  const { status } = useMember()
  const day = useDay()
  const pick = memberPick(status, day, tb)
  return (
    <div className="it-act">
      {pick.kind === 'join' ? (
        <Link className="it-join" to="/scan?view=join">
          <span>
            Free to join.
            <br />
            Nothing owed.
          </span>
          <span className="btn btn-lime">Join free</span>
        </Link>
      ) : pick.kind === 'keep' ? (
        <div className="it-out">
          <b className="tn">Keep {bucks(pick.tb)} ThriftBucks</b>
          <span>for your next visit</span>
        </div>
      ) : pick.kind === 'off' ? (
        <div className="it-out it-off">
          <b className="tn">{bucks(pick.tb)} ThriftBucks off</b>
        </div>
      ) : pick.kind === 'none' ? (
        <div className="it-out it-nil">
          <span>No ThriftBucks on this one</span>
        </div>
      ) : null}
    </div>
  )
}

function Fact({ label, value, wait, className = '' }: { label: string; value: ReactNode; wait: boolean; className?: string }) {
  return (
    <div className={`it-f${className ? ` ${className}` : ''}`}>
      <span className="lbl">{label}</span>
      {wait ? <i className="it-sk" /> : <b className={value ? '' : 'it-dash'}>{value || '–'}</b>}
    </div>
  )
}

/** Up to five tag numbers, each kept whole on its line, then how many more are on the shelf. */
function TagList({ tags, units }: { tags: string[]; units: number }) {
  if (!tags.length) return null
  const more = Math.max(0, units - tags.length)
  return (
    <>
      {tags.map((t) => (
        <span key={t}>
          <span className="it-tg">{t}</span>{' '}
        </span>
      ))}
      {more ? <span className="it-tg it-tgm">+ {count(more)} more</span> : null}
    </>
  )
}

/** Brand, condition, returns, the tag numbers: the endpoint's extras, in slots that are there from the first paint. */
function Facts({ v, api, thumb }: { v: InView; api: ApiState; thumb: string | null }) {
  const x: ApiItem | null = api.state === 'ok' ? api.item : null
  const wait = api.state === 'loading'
  const many = v.units > 1
  return (
    <div className={`it-facts${many ? ' it-many' : ''}`}>
      <div className="it-grid">
        <Fact label="Condition" value={x?.condition || ''} wait={wait} />
        <Fact label="Returns" value={x ? returnsLabel(x.returns) : ''} wait={wait} />
        <Fact label="Brand" value={x?.brand || ''} wait={wait} className={many ? 'it-wide' : ''} />
        {many ? (
          <Fact label="Tags" value={x && x.tags.length ? <TagList tags={x.tags} units={x.units} /> : ''} wait={wait}
            className="it-wide it-tags tn" />
        ) : (
          <Fact label="Tag" value={v.tag} wait={wait && !v.tag} className="tn" />
        )}
      </div>
      {thumb ? <Thumb src={thumb} /> : null}
    </div>
  )
}

function InStore({ v, api, top }: { v: InView; api: ApiState; top: Top }) {
  const name = catName(v.cat)
  // Learned after the first paint (the shelf changed in the last minutes): only our own photo-sheet photo, small, in
  // the facts block; a late stock photo is left out (its "may not match" line would have no reserved space).
  const lateThumb = !top.photo && v.photo && v.photoKind === 'sheet' ? v.photo : null
  return (
    <section className="it" data-test="item">
      <TopRow where="instore" label={v.tag ? `Tag ${v.tag}` : ''} />
      {top.photo ? <TopPhoto src={top.photo} cat={v.cat} kind={top.kind} /> : null}
      <div className="it-main">
        <h1 className="it-nm">{v.name}</h1>
        <div className="it-meta">
          <Link className="it-cat" to={listHref('instore', v.cat)}>
            <span>{name}</span>
            <Chevron d={NEXT} />
          </Link>
        </div>
        <InNumbers v={v} />
        <MemberLine tb={v.tb} />
        <Facts v={v} api={api} thumb={lateThumb} />
      </div>
      <div className="it-stock">
        <div className="it-row">
          <i />
          In store today
          <span className="it-n tn">{v.units > 1 ? `About ${count(v.units)} on the shelf` : ''}</span>
        </div>
        <p className="fine">Not held. First come, first served.</p>
        <p className="fine">Our list can run behind the shelf. It may already be sold.</p>
        <Link className="btn btn-ink it-more" to={listHref('instore', v.cat)}>
          <span>More {name}</span>
        </Link>
      </div>
    </section>
  )
}

function Coming({ v }: { v: ComingView }) {
  const name = catName(v.cat)
  const r = v.retail > 0 ? tagParts(v.retail) : null
  return (
    <section className="it" data-test="item">
      <TopRow where="coming" label={v.truck ? `${v.truck} truck` : ''} />
      <div className="it-main">
        <h1 className="it-nm">{v.name}</h1>
        <div className="it-meta">
          <Link className="it-cat" to={listHref('coming', v.cat)}>
            <span>{name}</span>
            <Chevron d={NEXT} />
          </Link>
        </div>
        <div className="it-nums">
          {r ? (
            <span className="it-est tn">
              <i>Retail</i>
              <small>$</small>
              {r.dollars}
              <sup>{r.cents}</sup>
            </span>
          ) : (
            <span className="it-est it-none2">Priced on arrival</span>
          )}
          <div className="it-side">
            <span className="it-rt">{r ? <b>Priced on arrival</b> : null}</span>
          </div>
        </div>
      </div>
      <div className="it-stock">
        <div className="it-row">
          <i className="it-wait" />
          Not in store yet
          <span className="it-n tn">{v.qty > 1 ? `${count(v.qty)} coming` : ''}</span>
        </div>
        <p className="fine">Not held. The price is set when it lands.</p>
        <Link className="btn btn-ink it-more" to={listHref('coming', v.cat)}>
          <span>More {name}</span>
        </Link>
      </div>
    </section>
  )
}

/** While nothing is known yet (a direct visit, the endpoint on its way): quiet bars where the words will be. */
function Loading({ where }: { where: 'instore' | 'coming' }) {
  return (
    <section className="it it-load" aria-busy="true">
      <TopRow where={where} label="" />
      <div className="it-main">
        <i className="it-sk it-sk-nm" />
        <i className="it-sk it-sk-nm it-sk-short" />
        <div className="it-meta">
          <i className="it-sk it-sk-cat" />
        </div>
        <div className="it-nums">
          <i className="it-sk it-sk-tag" />
        </div>
      </div>
    </section>
  )
}

function Gone({ where }: { where: 'instore' | 'coming' }) {
  return (
    <section className="it it-end">
      <TopRow where={where} label="" />
      <div className="it-main">
        <h1 className="it-nm">This item is no longer listed</h1>
        <Link className="btn btn-ink it-more" to={listHref(where)}>
          <span>See the list</span>
        </Link>
      </div>
    </section>
  )
}

function Unreachable({ where }: { where: 'instore' | 'coming' }) {
  return (
    <section className="it it-end">
      <TopRow where={where} label="" />
      <div className="it-main">
        <h1 className="it-nm">We can’t load this item right now</h1>
        <button type="button" className="btn btn-ink it-more" onClick={() => window.location.reload()}>
          Try again
        </button>
        <Link className="btn btn-line it-more" to={listHref(where)}>
          <span>See the list</span>
        </Link>
      </div>
    </section>
  )
}

function ItemPage({ id }: { id: string }) {
  const ref = parseId(id)
  const where = ref?.where || 'instore'
  const { stock } = useStock()
  const feed = useHome()
  const api = useItemApi(ref?.where === 'instore' ? ref.pid : null)
  const stockTried = useStockTried(where === 'coming' || api.state === 'error')

  let view: InView | ComingView | null = null
  let mode: 'view' | 'loading' | 'gone' | 'error' = 'view'
  const missing = () => (!stockTried ? 'loading' : stock ? 'gone' : 'error')
  if (!ref) mode = 'gone'
  else if (ref.where === 'instore') {
    const mem = inStoreFromMemory(ref.pid, stock, feed)
    if (api.state === 'ok') view = mergeApi(mem, api.item)
    else if (api.state === 'gone') mode = 'gone'
    else if (mem) view = mem
    else mode = api.state === 'loading' ? 'loading' : missing()
  } else {
    view = comingFromMemory(ref.rowid, stock, feed)
    if (!view) mode = missing()
  }

  // The top photo slot (and the stock line under it) is decided once, at the first paint of the piece: it never appears
  // (or goes) later.
  const top = useRef<Top & { painted: boolean }>({ painted: false, photo: null, kind: null })
  if (view && !top.current.painted) {
    const photo = view.where === 'instore' ? view.photo || null : null
    top.current = { painted: true, photo, kind: photo && view.where === 'instore' ? view.photoKind || 'stock' : null }
  }

  if (mode === 'loading') return <Loading where={where} />
  if (mode === 'error') return <Unreachable where={where} />
  if (mode === 'gone' || !view) return <Gone where={where} />
  return view.where === 'instore' ? <InStore v={view} api={api} top={top.current} /> : <Coming v={view} />
}

export default function Item() {
  const { id = '' } = useParams()
  // A new piece is a new page: its own photo slot, its own request.
  return <ItemPage key={id} id={id} />
}
