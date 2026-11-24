/**
 * One item on a computer (Dash Update #211): `/store/item/p<pid>` in store, `/store/item/m<row id>` coming. The phone's
 * item data, imported (phone/pages/item/itemData.ts): it paints at once from memory (the stock, else the home feed),
 * then the live numbers and the extras from `GET /api/storefront/item/<pid>/` fill slots that were there from the first
 * paint, so nothing moves. Two columns: the picture (a photo-sheet or stock photo only; else the cream panel with the
 * category, never a stand-in picture) and the facts. A coming item states its retail and "Priced on arrival", never
 * an estimate or ThriftBucks. Rulebook V14: no grey qualifier lines here.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useHome } from '../../phone/lib/boot'
import { bucks, count, money } from '../../phone/lib/format'
import { useMember } from '../../phone/lib/member'
import { catName, loadStock, useStock, type PhotoKind } from '../../phone/lib/stock'
import {
  cachedItem, comingFromMemory, fetchItem, inStoreFromMemory, listHref, memberPick, mergeApi, parseId, returnsLabel,
  STOCK_LINE, type ApiItem, type ApiState, type ComingView, type InView,
} from '../../phone/pages/item/itemData'
import { Tag } from '../../phone/shell/Tag'
import { useSeo } from '../../useSeo'
import { useDeskDay } from '../lib/day'
import { BF_PRICE, ITEM, JOIN_HREF, LIST_BEHIND, NOT_HELD, PRICED_ON_ARRIVAL, STORE_NOTE } from '../words'
import { TbLine } from './home/Blocks'
import './item.css'

type Top = { photo: string | null; kind: PhotoKind | null }

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

function Crumbs({ where, cat, right }: { where: 'instore' | 'coming'; cat?: string; right?: string }) {
  const nav = useNavigate()
  const loc = useLocation()
  const back = () => (loc.key !== 'default' ? nav(-1) : nav(listHref(where)))
  return (
    <div className="dk-crumbs dk-it-crumbs">
      <button type="button" className="dk-it-back" onClick={back}>
        ‹ Back
      </button>
      <span className="sep">|</span>
      <Link to={listHref(where)}>{where === 'coming' ? 'On the truck' : 'In store'}</Link>
      {cat ? (
        <>
          <span className="sep">›</span>
          <Link to={listHref(where, cat)}>{catName(cat)}</Link>
        </>
      ) : null}
      <span className="dk-it-tagno tn">{right}</span>
    </div>
  )
}

function Picture({ top, cat }: { top: Top; cat: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="dk-it-pic-col">
      <div className={`dk-it-pic${top.photo && !broken ? '' : ' txt'}`}>
        {top.photo && !broken ? (
          <img src={top.photo} width={720} height={720} alt="" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <span className="lbl">{catName(cat)}</span>
        )}
      </div>
      {top.photo && top.kind === 'stock' ? <p className="dk-it-stockline">{STOCK_LINE}</p> : null}
    </div>
  )
}

function MemberLine({ tb }: { tb: number }) {
  const { status } = useMember()
  const day = useDeskDay()
  const pick = memberPick(status, day, tb)
  if (day === 'bf') {
    // Black Friday (#220): one price for everyone; nothing to join for on this item today.
    return (
      <div className="dk-it-act">
        <div className="dk-it-out bf">
          <span>{STORE_NOTE.bf}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="dk-it-act">
      {pick.kind === 'join' ? (
        <div className="dk-it-join">
          <span>{tb > 0 ? ITEM.joinWith : ITEM.joinPlain}</span>
          <Link className="btn btn-lime" to={JOIN_HREF}>
            Join free
          </Link>
        </div>
      ) : pick.kind === 'keep' ? (
        <div className="dk-it-out">
          <b className="tn">Keep {bucks(pick.tb)} ThriftBucks</b>
          <span>for your next visit</span>
        </div>
      ) : pick.kind === 'off' ? (
        <div className="dk-it-out">
          <b className="tn">{bucks(pick.tb)} ThriftBucks off</b>
        </div>
      ) : pick.kind === 'none' ? (
        <div className="dk-it-out nil">
          <span>No ThriftBucks on this one</span>
        </div>
      ) : null}
    </div>
  )
}

function Fact({ label, value, wait, wide = false }: { label: string; value: ReactNode; wait: boolean; wide?: boolean }) {
  return (
    <div className={`dk-it-f${wide ? ' wide' : ''}`}>
      <span className="lbl">{label}</span>
      {wait ? <i className="dk-sk" style={{ width: '60%', marginTop: 6 }} /> : <b>{value || '–'}</b>}
    </div>
  )
}

function InStore({ v, api, top }: { v: InView; api: ApiState; top: Top }) {
  const x: ApiItem | null = api.state === 'ok' ? api.item : null
  const wait = api.state === 'loading'
  const many = v.units > 1
  const day = useDeskDay()
  useSeo({ title: v.name, path: `/store/item/p${v.pid}`, type: 'product' })
  return (
    <div className="dk-w dk-it" data-test="item">
      <Crumbs where="instore" cat={v.cat} right={v.tag ? `Tag ${v.tag}` : ''} />
      <div className="dk-it-grid">
        <Picture top={top} cat={v.cat} />
        <div className="dk-it-info">
          <h1 className="dk-it-nm">{v.name}</h1>
          <div className="dk-it-nums">
            <Tag price={v.price} />
            <div className="dk-it-side">
              <span className="dk-it-rt tn">{v.retail > v.price ? <>Retail <s>{money(v.retail)}</s></> : null}</span>
              <TbLine tb={v.tb} />
            </div>
          </div>
          <MemberLine tb={v.tb} />
          <div className="dk-it-facts">
            <Fact label="Condition" value={x?.condition || ''} wait={wait} />
            <Fact label="Returns" value={x ? returnsLabel(x.returns) : ''} wait={wait} />
            <Fact label="Brand" value={x?.brand || ''} wait={wait} />
            {many ? (
              <Fact label="Tags" value={x && x.tags.length ? `${x.tags.join(' · ')}${x.units > x.tags.length ? ` · + ${count(x.units - x.tags.length)} more` : ''}` : ''}
                wait={wait} />
            ) : (
              <Fact label="Tag" value={v.tag} wait={wait && !v.tag} />
            )}
          </div>
          <div className="dk-it-stock">
            <p className="dk-it-row">
              <i />
              In store today
              <span className="tn">{many ? `About ${count(v.units)} on the shelf` : ''}</span>
            </p>
            <p className="dk-it-held">
              {NOT_HELD} {LIST_BEHIND}
            </p>
          </div>
          <div className="dk-it-go">
            <Link className="btn btn-ink" to="/visit">
              Get directions
            </Link>
            <Link className="btn btn-line" to={listHref('instore', v.cat)}>
              More {catName(v.cat)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Coming({ v }: { v: ComingView }) {
  useSeo({ title: v.name, path: `/store/item/m${v.rowid}` })
  return (
    <div className="dk-w dk-it" data-test="item">
      <Crumbs where="coming" cat={v.cat} right={v.truck ? `${v.truck} truck` : ''} />
      <div className="dk-it-grid">
        <Picture top={{ photo: null, kind: null }} cat={v.cat} />
        <div className="dk-it-info">
          <h1 className="dk-it-nm">{v.name}</h1>
          <div className="dk-it-nums">
            <span className="dk-it-est tn">{v.retail > 0 ? <>Retail {money(v.retail)}</> : PRICED_ON_ARRIVAL}</span>
          </div>
          {v.retail > 0 ? <p className="dk-it-poa">{PRICED_ON_ARRIVAL}</p> : null}
          <div className="dk-it-stock">
            <p className="dk-it-row wait">
              <i />
              Not in store yet
              <span className="tn">{v.qty > 1 ? `${count(v.qty)} coming` : ''}</span>
            </p>
            <p className="dk-it-held">{ITEM.comingNote}</p>
          </div>
          <div className="dk-it-go">
            <Link className="btn btn-ink" to={listHref('coming', v.cat)}>
              More {catName(v.cat)} coming
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Message({ where, head, retry = false }: { where: 'instore' | 'coming'; head: string; retry?: boolean }) {
  return (
    <div className="dk-w dk-it">
      <Crumbs where={where} />
      <div className="dk-it-end">
        <h1 className="disp">{head}</h1>
        <div className="dk-it-go">
          {retry ? (
            <button type="button" className="btn btn-ink" onClick={() => window.location.reload()}>
              Try again
            </button>
          ) : null}
          <Link className={`btn ${retry ? 'btn-line' : 'btn-ink'}`} to={listHref(where)}>
            See the list
          </Link>
        </div>
      </div>
    </div>
  )
}

function Loading({ where }: { where: 'instore' | 'coming' }) {
  return (
    <div className="dk-w dk-it" aria-busy="true">
      <Crumbs where={where} />
      <div className="dk-it-grid">
        <div className="dk-it-pic-col">
          <div className="dk-it-pic txt" />
        </div>
        <div className="dk-it-info">
          <i className="dk-sk" style={{ height: 30, width: '90%' }} />
          <i className="dk-sk" style={{ height: 30, width: '60%', marginTop: 12 }} />
          <i className="dk-sk" style={{ height: 64, width: 180, marginTop: 28 }} />
        </div>
      </div>
    </div>
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

  // The picture is decided once, at the first paint of the item: it never appears (or goes) later.
  const top = useRef<Top & { painted: boolean }>({ painted: false, photo: null, kind: null })
  if (view && !top.current.painted) {
    const photo = view.where === 'instore' ? view.photo || null : null
    top.current = { painted: true, photo, kind: photo && view.where === 'instore' ? view.photoKind || 'stock' : null }
  }

  if (mode === 'loading') return <Loading where={where} />
  if (mode === 'error') return <Message where={where} head={ITEM.unreachable} retry />
  if (mode === 'gone' || !view) return <Message where={where} head={ITEM.gone} />
  return view.where === 'instore' ? <InStore v={view} api={api} top={top.current} /> : <Coming v={view} />
}

export default function Item() {
  const { id = '' } = useParams()
  return <ItemPage key={id} id={id} />
}
