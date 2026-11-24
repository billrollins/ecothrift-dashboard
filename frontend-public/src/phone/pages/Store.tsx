/**
 * The store's list and search, for "In store" and "Coming" (mockup pages/shop.html, prefix sh).
 * The URL is the state: /store?where=instore|coming&q=&cat=&sort=best|low|high. The top bar writes `q` as you type; this
 * page changes the others with `replace`. The stock is in memory (lib/stock.ts): filter and sort there, render only the
 * shown rows (30, then 30 more). Rows carry no pictures (owner 11-19). Back from a piece restores the rows shown and the
 * scroll place.
 */
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { useDay, type Day } from '../lib/day'
import { bucks, count, money } from '../lib/format'
import { find, loadStock, useStock, type Row, type Sort, type Stock, type Where } from '../lib/stock'
import { Tag } from '../shell/Tag'
import './Store.css'

export const PAGE = 30

export type View = { whereParam: Where | null; q: string; cat: string; sort: Sort }
export type Chip = { id: string; name: string; n: number }
export type Listing = {
  /** The list shown: the `where` asked for, or Coming when only the trucks match a search (and none was asked). */
  where: Where
  rows: Row[]
  counts: Record<Where, number>
  chips: Chip[]
}

/** The page's state as the URL holds it. Anything unknown falls back to the default. */
export function readView(params: URLSearchParams): View {
  const w = params.get('where')
  const s = params.get('sort')
  return {
    whereParam: w === 'coming' || w === 'instore' ? w : null,
    q: (params.get('q') || '').trim(),
    cat: params.get('cat') || '',
    sort: s === 'low' || s === 'high' ? s : 'best',
  }
}

/** The pieces a row stands for: its units in store, its quantity on a truck (at least one). */
export function piecesOf(r: Row): number {
  return Math.max(1, (r.where === 'coming' ? r.qty : r.units) || 0)
}

/** The pieces in a list of rows. */
export function pieces(rows: Row[]): number {
  let n = 0
  for (const r of rows) n += piecesOf(r)
  return n
}

/**
 * Everything the list shows, from the stock in memory. Every count is in pieces, never product rows (Dash Update
 * #185: the switch, the chips and the result line agree): a row counts its units (a truck row its quantity).
 * `shelfPieces` is the true count of pieces on the shelf (home feed), used with nothing typed and no category.
 */
export function listing(stock: Stock, v: View, shelfPieces: number | null): Listing {
  const { q, cat, sort } = v
  let where: Where = v.whereParam || 'instore'
  let base = find(where, { q, sort }, stock) // every category, sorted
  if (!v.whereParam && q && !base.length) {
    const trucks = find('coming', { q, sort }, stock)
    if (trucks.length) {
      where = 'coming'
      base = trucks
    }
  }
  const rows = cat ? base.filter((r) => r.cat === cat) : base

  const n: Record<string, number> = {}
  if (where === 'instore' && !q) for (const c of stock.cats) n[c.id] = c.pieces || 0
  else for (const r of base) n[r.cat] = (n[r.cat] || 0) + piecesOf(r)
  const chips = stock.cats
    .filter((c) => n[c.id] || c.id === cat)
    .map((c) => ({ id: c.id, name: c.name, n: n[c.id] || 0 }))
    .sort((a, b) => Number(a.id === 'other') - Number(b.id === 'other') || b.n - a.n) // biggest first, mixed lots last

  const truePieces = shelfPieces ?? stock.cats.reduce((sum, c) => sum + (c.pieces || 0), 0)
  const countFor = (w: Where): number => {
    if (!q && !cat) return w === 'instore' ? truePieces : pieces(stock.coming)
    if (!q && w === 'instore') return stock.cats.find((c) => c.id === cat)?.pieces || 0
    if (w === where) return pieces(rows)
    return pieces(find(w, { q, cat }, stock))
  }
  return { where, rows, counts: { instore: countFor('instore'), coming: countFor('coming') }, chips }
}

/** What an empty list says, and what its one button clears. */
export function emptyState(stock: Stock, v: View, where: Where): { line: string; button: string; act: 'cat' | 'q' } {
  if (v.cat && find(where, { q: v.q }, stock).length) {
    const name = stock.cats.find((c) => c.id === v.cat)?.name || 'this category'
    return { line: `None in ${name}.`, button: 'All categories', act: 'cat' }
  }
  if (v.q) return { line: `Nothing for “${v.q}”.`, button: 'Clear search', act: 'q' }
  return { line: 'Nothing here yet.', button: 'See all', act: 'cat' }
}

/** The ThriftBucks line of an in-store row: always there, grey at 0.00. */
export function bucksLine(tb: number, day: Day): string {
  const b = bucks(tb)
  if (!(tb > 0)) return `${b} ThriftBucks`
  return day === 'bf' ? `${b} ThriftBucks off` : `+ ${b} ThriftBucks`
}

// The rows shown and the scroll place of each list the visitor left for a piece, by history entry.
const places = new Map<string, { n: number; y: number }>()

const RowLink = memo(function RowLink({ r, day }: { r: Row; day: Day }) {
  const many = r.where === 'coming' ? r.qty : r.units
  let meta: ReactNode
  let right: ReactNode
  if (r.where === 'coming') {
    meta = <span className="sh-trk">{r.truck ? `${r.truck.name} truck` : 'On a truck'}</span>
    right =
      r.retail > 0 ? (
        <>
          <span className="sh-est tn">
            <i>Retail</i>
            {money(r.retail)}
          </span>
          <em className="sh-poa">Priced on arrival</em>
        </>
      ) : (
        <span className="sh-est sh-none">
          Priced
          <br />
          on arrival
        </span>
      )
  } else {
    meta = <span className={`sh-tb tn${r.tb > 0 ? '' : ' sh-tb0'}`}>{bucksLine(r.tb, day)}</span>
    right = (
      <>
        <Tag price={r.price} />
        <s className="tn">{r.retail > r.price ? money(r.retail) : ''}</s>
      </>
    )
  }
  return (
    <Link className="sh-r" to={`/store/item/${r.id}`}>
      <span className="sh-mid">
        <span className="sh-nm">{r.name}</span>
        <span className="sh-meta">
          {meta}
          {many > 1 ? <span className="sh-x tn">x {count(many)}</span> : null}
        </span>
      </span>
      <span className="sh-rt">{right}</span>
    </Link>
  )
})

function Skeleton() {
  return (
    <div className="sh-list" aria-hidden="true">
      {Array.from({ length: 8 }, (_, k) => (
        <div className="sh-r sh-r0" key={k}>
          <span className="sh-mid">
            <span className="sh-l" />
            <span className="sh-l" />
          </span>
          <span className="sh-rt">
            <span className="sh-b" />
          </span>
        </div>
      ))}
    </div>
  )
}

const SORTS: Array<[Sort, string]> = [
  ['best', 'Best finds'],
  ['low', 'Low price'],
  ['high', 'High price'],
]

export default function Store() {
  const [params, setParams] = useSearchParams()
  const loc = useLocation()
  const navType = useNavigationType()
  const { stock } = useStock()
  const feed = useHome()
  const day = useDay()
  const [failed, setFailed] = useState(false)

  const urlView = readView(params)
  const q = useDeferredValue(urlView.q) // typing stays smooth on a long list
  const v: View = { ...urlView, q }
  const shelf = feed?.shelf?.pieces ?? null
  const list = useMemo(
    () => (stock ? listing(stock, v, shelf) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, v.whereParam, v.q, v.cat, v.sort, shelf],
  )
  const where: Where = list?.where || v.whereParam || 'instore'
  const coming = where === 'coming'

  // How many rows show: 30, then 30 more; back from a piece, as many as before.
  const filterKey = `${v.whereParam}|${v.q}|${v.cat}|${v.sort}`
  const saved = useRef(navType === 'POP' ? places.get(loc.key) : undefined)
  const [page, setPage] = useState(() => ({ key: filterKey, n: saved.current?.n || PAGE }))
  const shown = page.key === filterKey ? page.n : PAGE

  // The stock did not come: one line and a way to ask again, never an endless wait.
  function ask() {
    setFailed(false)
    void loadStock().then((s) => {
      if (!s) setFailed(true)
    })
  }
  useEffect(() => {
    if (!stock) ask()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Back from a piece: the same place on the page, once the rows are there.
  useLayoutEffect(() => {
    const at = saved.current
    if (!at || !list) return
    saved.current = undefined
    window.scrollTo(0, at.y)
  }, [list])

  // Keep the chosen chip in sight: move the row only when that chip is cut off.
  const rail = useRef<HTMLDivElement>(null)
  const haveList = Boolean(list)
  useLayoutEffect(() => {
    const el = rail.current
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!el || !on || !v.cat) return
    const x = on.offsetLeft - el.offsetLeft
    if (x - 16 < el.scrollLeft || x + on.offsetWidth + 16 > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, x - 16)
  }, [v.cat, haveList])

  function change(key: 'where' | 'cat' | 'sort' | 'q', value: string) {
    const next = new URLSearchParams(params)
    if (!value || (key === 'sort' && value === 'best')) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  function remember() {
    places.set(loc.key, { n: shown, y: window.scrollY })
    if (places.size > 30) places.delete(places.keys().next().value as string)
  }

  const rows = list ? list.rows.slice(0, shown) : []
  const none = Boolean(list && !list.rows.length)
  const empty = none && stock ? emptyState(stock, v, where) : null
  const cnt = (w: Where) => (list ? count(list.counts[w]) : w === 'instore' && shelf !== null && !v.q && !v.cat ? count(shelf) : '')

  return (
    <div className="sh-pg">
      <div className="sh-hd">
        <div className="sh-sw" role="group" aria-label="Where">
          {(['instore', 'coming'] as Where[]).map((w) => (
            <button key={w} type="button" aria-pressed={where === w} onClick={() => where !== w && change('where', w)}>
              {w === 'instore' ? 'In store' : 'Coming'} <span className="cnt tn">{cnt(w)}</span>
            </button>
          ))}
        </div>
        <div className="rail sh-chips" aria-label="Categories" ref={rail}>
          <button type="button" className="sh-all" aria-pressed={!v.cat} onClick={() => change('cat', '')}>
            All
          </button>
          {list
            ? list.chips.map((c) => (
                <button key={c.id} type="button" aria-pressed={c.id === v.cat} onClick={() => change('cat', c.id)}>
                  {c.name} <span className="cnt tn">{count(c.n)}</span>
                </button>
              ))
            : [0, 1, 2].map((k) => <span key={k} className="sh-chip0" />)}
        </div>
        <div className="sh-bar">
          <span className="sh-n tn">
            {list ? (
              <>
                <span>
                  <b>{count(list.counts[where])}</b> {list.counts[where] === 1 ? 'item' : 'items'}
                </span>
                {v.q ? <span>{` for “${v.q}”`}</span> : null}
              </>
            ) : null}
          </span>
          <div className="sh-so" role="group" aria-label="Sort">
            {SORTS.map(([s, label]) => (
              <button key={s} type="button" aria-pressed={v.sort === s} onClick={() => change('sort', s)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sh-note">
        {coming ? (
          <span>On the next trucks. Not in store yet.</span>
        ) : day === 'bf' ? (
          <span>
            <b>Black Friday, Fri &amp; Sat:</b> one price for everyone, the retail crossed out.
          </span>
        ) : (
          <span>
            <b>Thrift+ members</b> collect the ThriftBucks. Most items.
          </span>
        )}
      </div>

      {!list ? (
        failed ? (
          <div className="sh-empty">
            <p>The list did not load.</p>
            <button type="button" className="btn btn-ink" onClick={ask}>
              Try again
            </button>
          </div>
        ) : (
          <Skeleton />
        )
      ) : empty ? (
        <div className="sh-empty">
          <p>{empty.line}</p>
          <button type="button" className="btn btn-ink" onClick={() => change(empty.act, '')}>
            {empty.button}
          </button>
        </div>
      ) : (
        <div className="sh-list" onClickCapture={remember}>
          {rows.map((r) => (
            <RowLink key={r.id} r={r} day={day} />
          ))}
        </div>
      )}

      <div className="sh-foot">
        {list && list.rows.length > shown ? (
          <button type="button" className="btn btn-line sh-more" onClick={() => setPage({ key: filterKey, n: shown + PAGE })}>
            Show 30 more
          </button>
        ) : null}
        {none || !list ? null : coming ? (
          <p className="fine">Not held. Priced when the truck lands.</p>
        ) : (
          <p className="fine">
            <span>Not held. First come, first served.</span>
            <span>Our list can run behind the shelf. It may already be sold.</span>
          </p>
        )}
      </div>
    </div>
  )
}
