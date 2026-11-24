/**
 * The store's list and search on a computer (Dash Update #211): the phone's list (phone/pages/Store.tsx) with the same
 * URL state (/store?where=instore|coming&q=&cat=&sort=best|low|high), the same filtering, counts and empty states
 * (imported: `readView`, `listing`, `emptyState`, `bucksLine`), laid out for a wide screen: the filters in a column on
 * the left, every category with its count always in view, the items in a grid of equal cards, the sort on the right.
 * The header's search box writes `q` as you type. Cards carry no pictures (owner 11-19), like the phone's rows.
 */
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import { useHome } from '../../phone/lib/boot'
import { count, money } from '../../phone/lib/format'
import { loadStock, useStock, type Row, type Sort, type Where } from '../../phone/lib/stock'
import { emptyState, listing, readView, type View } from '../../phone/pages/Store'
import { TbLine } from './home/Blocks'
import { Tag } from '../../phone/shell/Tag'
import { useSeo } from '../../useSeo'
import type { Day } from '../../phone/lib/day'
import { useDeskDay } from '../lib/day'
import { COMING_NOTE, COMING_NOT_HELD, LIST_BEHIND, NOT_HELD, PRICED_ON_ARRIVAL, STORE_NOTE } from '../words'
import './store.css'

/** A computer shows four rows of three at a time, then 48 more. */
export const DESK_PAGE = 48

const places = new Map<string, { n: number; y: number }>()

const Card = memo(function Card({ r, day }: { r: Row; day: Day }) {
  const many = r.where === 'coming' ? r.qty : r.units
  return (
    <Link className="dk-sr" to={`/store/item/${r.id}`}>
      <span className="nm">{r.name}</span>
      <span className="ft">
        <span className="mt">
          {r.where === 'coming' ? (
            <span className="trk">{r.truck ? `${r.truck.name} truck` : 'On a truck'}</span>
          ) : (
            <TbLine tb={r.tb} />
          )}
          {many > 1 ? <span className="x tn">x {count(many)}</span> : null}
        </span>
        <span className="rt">
          {r.where === 'coming' ? (
            <>
              <span className="est tn">{r.retail > 0 ? <>Retail {money(r.retail)}</> : null}</span>
              <em>{PRICED_ON_ARRIVAL}</em>
            </>
          ) : (
            <>
              <span className="dk-strike tn">{r.retail > r.price ? <>Retail <s>{money(r.retail)}</s></> : ''}</span>
              <Tag price={r.price} />
            </>
          )}
        </span>
      </span>
    </Link>
  )
})

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
  const day = useDeskDay()
  const [failed, setFailed] = useState(false)

  const urlView = readView(params)
  const q = useDeferredValue(urlView.q)
  const v: View = { ...urlView, q }
  const shelf = feed?.shelf?.pieces ?? null
  const list = useMemo(
    () => (stock ? listing(stock, v, shelf) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, v.whereParam, v.q, v.cat, v.sort, shelf],
  )
  const where: Where = list?.where || v.whereParam || 'instore'
  const coming = where === 'coming'
  const catName = v.cat ? stock?.cats.find((c) => c.id === v.cat)?.name || '' : ''
  useSeo({ title: v.q ? `“${v.q}”` : coming ? 'On the truck' : catName || 'In store', path: '/store' })

  const filterKey = `${v.whereParam}|${v.q}|${v.cat}|${v.sort}`
  const saved = useRef(navType === 'POP' ? places.get(loc.key) : undefined)
  const [page, setPage] = useState(() => ({ key: filterKey, n: saved.current?.n || DESK_PAGE }))
  const shown = page.key === filterKey ? page.n : DESK_PAGE

  function ask() {
    setFailed(false)
    void loadStock().then((s) => {
      if (!s) setFailed(true)
    })
  }
  useEffect(() => {
    if (!stock) ask()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const at = saved.current
    if (!at || !list) return
    saved.current = undefined
    window.scrollTo(0, at.y)
  }, [list])

  function change(key: 'where' | 'cat' | 'sort' | 'q', value: string) {
    const next = new URLSearchParams(params)
    if (!value || (key === 'sort' && value === 'best')) next.delete(key)
    else next.set(key, value)
    if (key === 'where') next.delete('cat')
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
  const title = v.q ? `“${v.q}”` : coming ? 'On the truck' : 'In store'

  return (
    <div className="dk-w dk-st">
      <div className="dk-st-top">
        <div>
          <p className="dk-kick">{v.q ? 'Search' : coming ? 'Coming soon' : 'Eco-Thrift, Omaha'}</p>
          <h1 className="disp">{title}</h1>
        </div>
        <p className="dk-st-note">{coming ? COMING_NOTE : day === 'bf' ? STORE_NOTE.bf : STORE_NOTE.normal}</p>
      </div>

      <div className="dk-st-body">
        <aside className="dk-st-side" aria-label="Filters">
          <div className="dk-st-where" role="group" aria-label="Where">
            {(['instore', 'coming'] as Where[]).map((w) => (
              <button key={w} type="button" aria-pressed={where === w} onClick={() => where !== w && change('where', w)}>
                <span>{w === 'instore' ? 'In store' : 'On the truck'}</span>
                <span className="cnt tn">{cnt(w)}</span>
              </button>
            ))}
          </div>
          <p className="dk-kick dk-st-lbl">Categories</p>
          <nav className="dk-st-cats" aria-label="Categories">
            <button type="button" aria-pressed={!v.cat} onClick={() => change('cat', '')}>
              <span>All categories</span>
            </button>
            {list
              ? list.chips.map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === v.cat} onClick={() => change('cat', c.id)}>
                    <span>{c.name}</span>
                    <span className="n tn">{count(c.n)}</span>
                  </button>
                ))
              : Array.from({ length: 12 }, (_, k) => <span key={k} className="dk-st-cat0" />)}
          </nav>
        </aside>

        <section className="dk-st-main" aria-label="Items">
          <div className="dk-st-bar">
            <p className="tn">
              {list ? (
                <>
                  <b>{count(list.counts[where])}</b> {list.counts[where] === 1 ? 'item' : 'items'}
                  {catName ? ` in ${catName}` : ''}
                </>
              ) : null}
            </p>
            <div className="dk-st-sort" role="group" aria-label="Sort">
              {SORTS.map(([s, label]) => (
                <button key={s} type="button" aria-pressed={v.sort === s} onClick={() => change('sort', s)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!list ? (
            failed ? (
              <div className="dk-st-empty">
                <p>The list did not load.</p>
                <button type="button" className="btn btn-ink" onClick={ask}>
                  Try again
                </button>
              </div>
            ) : (
              <div className="dk-st-grid" aria-hidden="true">
                {Array.from({ length: 12 }, (_, k) => (
                  <div className="dk-sr dk-sr0" key={k}>
                    <span className="dk-sk" style={{ width: '80%' }} />
                    <span className="dk-sk" style={{ width: '50%' }} />
                  </div>
                ))}
              </div>
            )
          ) : empty ? (
            <div className="dk-st-empty">
              <p>{empty.line}</p>
              <button type="button" className="btn btn-ink" onClick={() => change(empty.act, '')}>
                {empty.button}
              </button>
            </div>
          ) : (
            <div className="dk-st-grid" onClickCapture={remember}>
              {rows.map((r) => (
                <Card key={r.id} r={r} day={day} />
              ))}
            </div>
          )}

          <div className="dk-st-foot">
            {list && list.rows.length > shown ? (
              <button type="button" className="btn btn-line" onClick={() => setPage({ key: filterKey, n: shown + DESK_PAGE })}>
                Show {Math.min(DESK_PAGE, list.rows.length - shown)} more
              </button>
            ) : null}
            {none || !list ? null : coming ? (
              <p className="dk-note">{COMING_NOT_HELD}</p>
            ) : (
              <p className="dk-note">
                {NOT_HELD} {LIST_BEHIND}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
