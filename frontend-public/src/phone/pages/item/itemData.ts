/**
 * The item page's data (piece W2). Two sources, merged:
 *   1. what is already in memory: the stock (lib/stock.ts `itemById`) or, before the stock is here, the home feed's
 *      best finds and its first coming pieces (lib/boot.ts). The page paints from this at once.
 *   2. `GET /api/storefront/item/<pid>/` (apps/storefront/services/item.py), in store only: live numbers and the extras
 *      (brand, condition, returns, up to five tag numbers, units, photo). Kept 60 seconds in memory, like the server.
 * A coming piece has no endpoint: the stock (or the home feed) is all there is.
 */
import type { HomeFeed } from '../../lib/boot'
import { CATS, photoUrl, type ComingRow, type InStoreRow, type PhotoKind, type Stock } from '../../lib/stock'

export const ITEM_URL = (pid: number) => `/api/storefront/item/${pid}/`
/** The words under a stock photo (owner 11-19: "Photo of stock item, may not match"). */
export const STOCK_LINE = 'Stock photo. The item in our store may not match it exactly.'
const KEEP_MS = 60_000

/** The endpoint's answer (BRIEF-BE.md). Never notes, cost or location. */
export type ApiItem = {
  pid: number; name: string; brand: string; cat: string; condition: string; units: number; tags: string[]
  price: number; retail: number; tb: number; returns: '3-day' | 'as_is'; photo: string | null; available: boolean
  /** 'sheet' (our own photo of the piece) | 'stock' (the maker's or a retailer's picture) | null (no photo). */
  photo_kind: PhotoKind | null
}
export type ApiResult = { state: 'ok'; item: ApiItem } | { state: 'gone' } | { state: 'error' }
export type ApiState = ApiResult | { state: 'loading' } | { state: 'none' }

/**
 * What the page shows for a piece in store. `photo`: a URL, null (none), undefined (not known yet). `photoKind`: where
 * the photo comes from ('stock' carries the "may not match" line under it).
 */
export type InView = {
  where: 'instore'; pid: number; name: string; cat: string; price: number; retail: number; tb: number
  units: number; tag: string; photo: string | null | undefined; photoKind: PhotoKind | null
}
export type ComingView = { where: 'coming'; rowid: number; name: string; cat: string; retail: number; qty: number; truck: string }

/** The page's address: `p<pid>` in store, `m<row id>` coming; anything else is not a piece. */
export function parseId(id: string | undefined): { where: 'instore'; pid: number } | { where: 'coming'; rowid: number } | null {
  const m = /^([pm])(\d{1,12})$/.exec(String(id || ''))
  if (!m) return null
  const n = Number(m[2])
  return m[1] === 'p' ? { where: 'instore', pid: n } : { where: 'coming', rowid: n }
}

const CAT_IDS = new Set(CATS.map((c) => c.id))
function catOk(cat: unknown): string {
  return typeof cat === 'string' && CAT_IDS.has(cat) ? cat : 'other'
}
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** The endpoint's body, checked (a dev server or a proxy page that is not this shape counts as unreachable). */
export function parseApi(body: unknown): ApiResult {
  const b = body as Partial<ApiItem> | null
  if (!b || typeof b !== 'object' || typeof b.pid !== 'number' || typeof b.name !== 'string') return { state: 'error' }
  if (b.available === false) return { state: 'gone' }
  return {
    state: 'ok',
    item: {
      pid: b.pid,
      name: b.name,
      brand: typeof b.brand === 'string' ? b.brand.trim() : '',
      cat: catOk(b.cat),
      condition: typeof b.condition === 'string' ? b.condition : '',
      units: Math.max(1, Math.round(num(b.units)) || 1),
      tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === 'string' && t !== '').slice(0, 5) : [],
      price: num(b.price),
      retail: num(b.retail),
      tb: num(b.tb),
      returns: b.returns === 'as_is' ? 'as_is' : '3-day',
      photo: typeof b.photo === 'string' && b.photo ? b.photo : null,
      available: true,
      photo_kind: typeof b.photo === 'string' && b.photo ? kindOf(b.photo_kind) : null,
    },
  }
}

/** A photo's source as a feed names it. A photo with no (or an unknown) kind counts as a stock photo: its line says it
 * may not match, the safe side. */
export function kindOf(kind: unknown): PhotoKind {
  return kind === 'sheet' ? 'sheet' : 'stock'
}

const cache = new Map<number, { at: number; res: ApiResult }>()

/** A fresh answer already in memory (so a second visit paints everything at once), else null. */
export function cachedItem(pid: number): ApiResult | null {
  const hit = cache.get(pid)
  return hit && Date.now() - hit.at < KEEP_MS ? hit.res : null
}

/** Ask the endpoint. 404 = gone. Anything else that fails = 'error' (the page keeps what it painted). */
export async function fetchItem(pid: number, signal?: AbortSignal): Promise<ApiResult> {
  const hit = cachedItem(pid)
  if (hit) return hit
  try {
    const r = await fetch(ITEM_URL(pid), { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
    let res: ApiResult
    if (r.status === 404) res = { state: 'gone' }
    else if (!r.ok) return { state: 'error' }
    else res = parseApi(await r.json())
    if (res.state !== 'error') cache.set(pid, { at: Date.now(), res })
    return res
  } catch {
    return { state: 'error' }
  }
}

/** Tests only. */
export function _clearItemCache() {
  cache.clear()
}

// ── Painting from memory ──────────────────────────────────────────────────────

/** A piece in store from the stock, else from the home feed's best finds. */
export function inStoreFromMemory(pid: number, stock: Stock | null, feed: HomeFeed | null): InView | null {
  const row = stock?.instore.find((r) => r.pid === pid) as InStoreRow | undefined
  if (row) {
    // The stock row's photo flag (stock.json's 9th field) says whether there is a photo and which kind.
    return { where: 'instore', pid, name: row.name, cat: row.cat, price: row.price, retail: row.retail, tb: row.tb,
      units: row.units, tag: row.tag, photo: row.photo ? photoUrl(pid) : null, photoKind: row.photo }
  }
  const f = feed?.finds.find((x) => x.pid === pid)
  if (!f) return null
  return { where: 'instore', pid, name: f.name, cat: catOk(f.cat), price: num(f.price), retail: num(f.retail), tb: num(f.tb),
    units: Math.max(1, f.units || 1), tag: f.tag || '', photo: f.photo || null, photoKind: f.photo ? kindOf(f.photo_kind) : null }
}

/** The endpoint's live numbers over what memory had (they agree unless the shelf changed in the last few minutes). */
export function mergeApi(mem: InView | null, api: ApiItem): InView {
  return {
    where: 'instore', pid: api.pid, name: api.name || mem?.name || '', cat: api.cat || mem?.cat || 'other',
    price: api.price, retail: api.retail, tb: api.tb, units: api.units,
    tag: api.units === 1 ? api.tags[0] || mem?.tag || '' : '', photo: api.photo, photoKind: api.photo_kind,
  }
}

/** A coming piece from the stock, else from the home feed's first coming pieces. */
export function comingFromMemory(rowid: number, stock: Stock | null, feed: HomeFeed | null): ComingView | null {
  const row = stock?.coming.find((r) => r.rowid === rowid) as ComingRow | undefined
  if (row) return { where: 'coming', rowid, name: row.name, cat: row.cat, retail: row.retail, qty: row.qty, truck: row.truck?.name || '' }
  const it = feed?.coming?.items.find((x) => x.id === rowid)
  if (!it) return null
  const truck = feed?.coming.trucks.find((t) => t.id === it.truck)
  return { where: 'coming', rowid, name: it.name, cat: catOk(it.cat), retail: num(it.retail), qty: Math.max(1, it.qty || 1), truck: truck?.name || '' }
}

/** The list a piece belongs to (the "More <category>" button, the category link, the gone page's button). */
export function listHref(where: 'instore' | 'coming', cat = ''): string {
  const p = new URLSearchParams()
  if (where === 'coming') p.set('where', 'coming')
  if (cat) p.set('cat', cat)
  const s = p.toString()
  return s ? `/store?${s}` : '/store'
}

/** Under the label "Returns": "Thrift+ 3-day" or "AS IS · no returns" (the scanner's own words, kept short). */
export function returnsLabel(r: ApiItem['returns']): string {
  return r === 'as_is' ? 'AS IS · no returns' : 'Thrift+ 3-day'
}

export type Pick =
  | { kind: 'wait' }        // we do not know yet who this is: an empty slot of the same size
  | { kind: 'join' }        // signed out: "Free to join. Nothing owed."
  | { kind: 'keep'; tb: number }
  | { kind: 'off'; tb: number }
  | { kind: 'none' }        // a member, and this piece carries no ThriftBucks

/** The member line under the numbers (owner 11-19: ThriftBucks only, never a pay-today dollar figure). */
export function memberPick(status: 'unknown' | 'out' | 'member', day: 'normal' | 'bf', tb: number): Pick {
  if (status === 'unknown') return { kind: 'wait' }
  if (status === 'out') return { kind: 'join' }
  if (tb <= 0) return { kind: 'none' }
  return day === 'bf' ? { kind: 'off', tb } : { kind: 'keep', tb }
}
