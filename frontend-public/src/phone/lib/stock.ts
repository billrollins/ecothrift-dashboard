/**
 * The searchable stock (`/api/storefront/stock.json`, apps/storefront): every product on the shelf and every piece on a
 * truck, about 9,000 rows. It loads once, in the background after the first paint, is kept in memory, and is
 * revalidated with its ETag (a 304 keeps the copy). Searching it is local: typing never waits on the network.
 * A port of the round-3 mockup's kit/stock.js (ECO.find, ECO.stockItem, ECO.catById).
 */
import { useEffect, useSyncExternalStore } from 'react'

export const STOCK_URL = '/api/storefront/stock.json'

/** The store's 23 categories, in the feed's order (apps/buying/taxonomy_v1.py; ids from apps/storefront rules.py). */
export const CATS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'kitchen', name: 'Kitchen & dining' },
  { id: 'furniture', name: 'Furniture' },
  { id: 'patio', name: 'Outdoor & patio furniture' },
  { id: 'decor', name: 'Home décor & lighting' },
  { id: 'household', name: 'Household & cleaning' },
  { id: 'bedbath', name: 'Bedding & bath' },
  { id: 'storage', name: 'Storage & organization' },
  { id: 'toys', name: 'Toys & games' },
  { id: 'sports', name: 'Sports & outdoors' },
  { id: 'tools', name: 'Tools & hardware' },
  { id: 'office', name: 'Office & school supplies' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'baby', name: 'Baby & kids' },
  { id: 'health', name: 'Health, beauty & personal care' },
  { id: 'apparel', name: 'Apparel & accessories' },
  { id: 'media', name: 'Books & media' },
  { id: 'pet', name: 'Pet supplies' },
  { id: 'party', name: 'Party, seasonal & novelty' },
  { id: 'garden', name: 'Lawn & garden' },
  { id: 'appliances', name: 'Appliances' },
  { id: 'crafts', name: 'Arts & crafts' },
  { id: 'auto', name: 'Automotive' },
  { id: 'other', name: 'Mixed lots & uncategorized' },
]

export type Cat = { id: string; name: string; pieces: number | null }
export type Truck = { id: number; name: string; pallets: number; pieces: number; listed: boolean }

/**
 * A public photo's source (apps/storefront/services/photos.py): 'sheet' = a photo-sheet photo (our own photo of the
 * piece), 'stock' = the maker's or a retailer's picture (the item page says it may not match). Never an Add item photo.
 */
export type PhotoKind = 'sheet' | 'stock'

/** The stable address of a product's public photo (302 to the file). */
export const photoUrl = (pid: number) => `/api/storefront/photo/${pid}/`

/** A product on the shelf. `id` is `p<pid>` (the item page's address). Numbers are a representative unit's. */
export type InStoreRow = {
  where: 'instore'; id: string; pid: number; name: string; cat: string
  price: number; retail: number; tb: number; units: number; tag: string; photo: PhotoKind | null
}
/** A piece on a truck. `id` is `m<row id>`. No price: it is priced when the truck lands. */
export type ComingRow = {
  where: 'coming'; id: string; rowid: number; name: string; cat: string; retail: number; qty: number; truck: Truck | null
}
export type Row = InStoreRow | ComingRow

export type Stock = {
  v: string
  asOf: string
  cats: Cat[]
  trucks: Truck[]
  instore: InStoreRow[]
  coming: ComingRow[]
}

type Raw = {
  v: string; as_of: string; cats: Array<{ id: string; name: string; pieces: number }>; trucks: Truck[]
  /** The 9th field: the public photo, 0 none | 1 photo sheet | 2 stock photo (absent in older feeds = none). */
  instore: Array<[number, string, number, number, number, number, number, string, number?]>
  coming: Array<[number, string, number, number, number, number]>
}

export type Where = 'instore' | 'coming'
export type Sort = 'best' | 'low' | 'high'

// ── Search text ───────────────────────────────────────────────────────────────

export function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
}

const text = new WeakMap<Row, string>()

function textOf(row: Row): string {
  let t = text.get(row)
  if (t === undefined) {
    const tag = row.where === 'instore' && row.tag ? ` ${row.tag}` : ''
    t = ` ${norm(row.name)} ${norm(catName(row.cat))}${tag} `
    text.set(row, t)
  }
  return t
}

// ── The copy in memory ────────────────────────────────────────────────────────

let stock: Stock | null = null
let etag = ''
let fetchedAt = 0
let inflight: Promise<Stock | null> | null = null
const listeners = new Set<() => void>()
const REVALIDATE_MS = 120_000

export function parseStock(raw: Raw): Stock {
  const cats: Cat[] = raw.cats.map((c) => ({ id: c.id, name: c.name, pieces: c.pieces }))
  const catId = (i: number) => (cats[i] || CATS[i] || CATS[CATS.length - 1]).id
  const trucks = raw.trucks || []
  return {
    v: raw.v,
    asOf: raw.as_of,
    cats,
    trucks,
    instore: raw.instore.map(([pid, name, cat, price, retail, tb, units, tag, photo]) => ({
      where: 'instore', id: `p${pid}`, pid, name, cat: catId(cat), price, retail, tb, units, tag: tag || '',
      photo: photo === 1 ? 'sheet' : photo === 2 ? 'stock' : null,
    })),
    coming: raw.coming.map(([rowid, name, cat, retail, qty, truck]) => ({
      where: 'coming', id: `m${rowid}`, rowid, name, cat: catId(cat), retail, qty, truck: trucks[truck] || null,
    })),
  }
}

/** Load (once) or revalidate (with the ETag, when the copy is older than two minutes) the stock. */
export function loadStock(): Promise<Stock | null> {
  if (inflight) return inflight
  if (stock && Date.now() - fetchedAt < REVALIDATE_MS) return Promise.resolve(stock)
  inflight = (async () => {
    try {
      const headers: Record<string, string> = {}
      if (stock && etag) headers['If-None-Match'] = etag
      const r = await fetch(STOCK_URL, { credentials: 'same-origin', headers })
      fetchedAt = Date.now()
      if (r.status === 304 && stock) return stock
      if (!r.ok) return stock
      const next = parseStock((await r.json()) as Raw)
      etag = r.headers.get('ETag') || (next.v ? `"${next.v}"` : '')
      setStock(next)
      return next
    } catch {
      return stock
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function setStock(next: Stock | null) {
  stock = next
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function snapshot() {
  return stock
}

/** Start loading after the browser is idle (after the first paint), so it never competes with the first screen. */
export function loadStockSoon() {
  if (stock || inflight || typeof window === 'undefined') return
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(() => void loadStock(), { timeout: 1500 })
  else window.setTimeout(() => void loadStock(), 200)
}

/** `{stock, ready}`: the stock once it is here. Loads it in the background on first use. */
export function useStock(): { stock: Stock | null; ready: boolean } {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    loadStockSoon()
  }, [])
  return { stock: value, ready: value !== null }
}

// ── Look-ups (port of kit/stock.js) ───────────────────────────────────────────

/** One category (with its piece count once the stock is here), or null. */
export function catById(id: string): Cat | null {
  const live = stock?.cats.find((c) => c.id === id)
  if (live) return live
  const fixed = CATS.find((c) => c.id === id)
  return fixed ? { id: fixed.id, name: fixed.name, pieces: null } : null
}

export function catName(id: string): string {
  return catById(id)?.name || ''
}

/** One row by its page id (`p<pid>` in store, `m<row id>` coming), or null. */
export function itemById(id: string, from: Stock | null = stock): Row | null {
  if (!from) return null
  const rows: Row[] = id.startsWith('m') ? from.coming : from.instore
  return rows.find((r) => r.id === id) || null
}

/**
 * The rows of one list that match: `q` = words (each must start a word of the name or the category, or be the tag
 * number); `cat` = a category id or ''; `sort` = 'best' (biggest gap between retail and price first; coming: highest
 * retail) | 'low' | 'high'.
 */
export function find(
  where: Where,
  o: { q?: string; cat?: string; sort?: Sort } = {},
  from: Stock | null = stock,
): Row[] {
  if (!from) return []
  const rows: Row[] = where === 'coming' ? from.coming : from.instore
  const words = norm(o.q || '').split(' ').filter(Boolean)
  const out: Row[] = []
  for (const row of rows) {
    if (o.cat && row.cat !== o.cat) continue
    if (words.length) {
      const t = textOf(row)
      if (!words.every((w) => t.includes(` ${w}`))) continue
    }
    out.push(row)
  }
  const price = (r: Row) => (r.where === 'instore' ? r.price : 0)
  const shown = (r: Row) => price(r) || r.retail
  if (o.sort === 'low') out.sort((a, b) => (shown(a) || 1e9) - (shown(b) || 1e9))
  else if (o.sort === 'high') out.sort((a, b) => shown(b) - shown(a))
  else if (where === 'coming') out.sort((a, b) => b.retail - a.retail)
  else {
    const gap = (r: Row) => (r.retail && price(r) ? r.retail - price(r) : -1)
    out.sort((a, b) => gap(b) - gap(a))
  }
  return out
}

/** Tests only. */
export function _setStock(next: Stock | null) {
  etag = ''
  fetchedAt = next ? Date.now() : 0
  setStock(next)
}
