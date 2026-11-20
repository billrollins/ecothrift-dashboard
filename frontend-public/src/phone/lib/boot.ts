/**
 * The home feed (`/api/storefront/home.json`, apps/storefront). The server stamps it into the page as
 * `<script id="eco-boot" type="application/json">`, so the first screen paints with no API call; when the stamp is
 * missing (no snapshot yet), it is fetched once.
 */
import { useSyncExternalStore } from 'react'
import type { PhotoKind } from './stock'

export type Truck = { id: number; name: string; pallets: number; pieces: number; listed: boolean }
export type Find = {
  pid: number; name: string; cat: string; price: number; retail: number; tb: number; units: number; tag: string
  /** The public photo's stable address: a photo-sheet photo or a stock photo, never an Add item photo. */
  photo: string | null
  /** 'sheet' (our own photo of the piece) | 'stock' (the maker's or a retailer's picture). Absent in older feeds. */
  photo_kind?: PhotoKind | null
}
export type ComingItem = { id: number; name: string; cat: string; retail: number; qty: number; truck: number }
export type HoursOverride = {
  id?: number; label: string; date_start: string; date_end: string; closed: boolean; open?: string; close?: string
}
export type Hours = {
  timezone: string; open: string; close: string; closed_weekdays: number[]; overrides?: HoursOverride[]
  label?: string; today?: { is_override: boolean; label: string; closed: boolean; open: string; close: string }
}
export type HomeFeed = {
  v: string
  as_of: string
  /** The release the server runs (compared with the page's own __APP_VERSION__ for the update bar). */
  app?: string
  day: 'normal' | 'bf'
  shelf: { pieces: number; products: number; categories: number }
  /** The floor's ThriftBucks today: % of items that carry some, and the typical item's share of its tag (home card). */
  bucks?: { share: number; typical: number }
  hours: Hours | null
  thrift_plus_open: boolean
  finds: Find[]
  coming: { trucks: Truck[]; items: ComingItem[] }
  /** Category ids, the six with the most pieces (also accepted: `{id, pieces}` objects). */
  top_cats: Array<string | { id: string; pieces?: number }>
}

export const HOME_URL = '/api/storefront/home.json'

function readStamp(): HomeFeed | null {
  if (typeof document === 'undefined') return null
  const el = document.getElementById('eco-boot')
  if (!el || !el.textContent) return null
  try {
    return JSON.parse(el.textContent) as HomeFeed
  } catch {
    return null
  }
}

let feed: HomeFeed | null = readStamp()
let pending: Promise<HomeFeed> | null = null
const listeners = new Set<() => void>()

/** The home feed: the stamped copy at once, else one fetch of home.json. */
export function boot(): Promise<HomeFeed> {
  if (feed) return Promise.resolve(feed)
  if (!pending) {
    pending = fetchHome()
      .then((body) => {
        feed = body
        listeners.forEach((fn) => fn())
        return body
      })
      .catch((err) => {
        pending = null
        throw err
      })
  }
  return pending
}

/** A fresh copy from the server (the update check). Does not replace the copy the page shows. */
export async function fetchHome(): Promise<HomeFeed> {
  const r = await fetch(HOME_URL, { credentials: 'same-origin', cache: 'no-cache' })
  if (!r.ok) throw new Error(`home.json ${r.status}`)
  return (await r.json()) as HomeFeed
}

/** The feed if it is here already (stamped), else null. */
export function bootNow(): HomeFeed | null {
  return feed
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The home feed for a component: null until it is here (only when the page came without a stamp). */
export function useHome(): HomeFeed | null {
  const value = useSyncExternalStore(subscribe, bootNow, bootNow)
  if (!value) void boot().catch(() => undefined)
  return value
}

/** Tests only. */
export function _setFeed(next: HomeFeed | null) {
  feed = next
  pending = null
  listeners.forEach((fn) => fn())
}
