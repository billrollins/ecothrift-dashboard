// Tiny fetch-based client for the public storefront API (same-origin /api).
import { getAccessToken } from './auth'

const BASE = '/api/webstore'

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail?: unknown }).detail || '')
        : ''
    throw new ApiError(detail || `Request failed (${res.status})`, res.status, data)
  }
  return (await res.json()) as T
}

async function postJSON<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail?: unknown }).detail || '')
        : ''
    throw new ApiError(detail || `Request failed (${res.status})`, res.status, data)
  }
  return data as T
}

/** Store hours from AppSetting `online_sales.hours`. Weekdays are Python: 0=Mon … 6=Sun. */
export interface HoursOverridePublic {
  id: number
  label: string
  date_start: string
  date_end: string
  closed: boolean
  open: string
  close: string
  note: string
  sentence?: string
}

export interface StoreHoursToday {
  is_override: boolean
  label: string
  closed: boolean
  open: string
  close: string
}

export interface StoreHoursPublic {
  timezone: string
  open: string
  close: string
  closed_weekdays: number[]
  label: string
  regular_label?: string
  resume_label?: string
  overrides?: HoursOverridePublic[]
  today?: StoreHoursToday
}

export interface PublicAnnouncementImage {
  id: number
  alt: string
  url: string
  sort_order: number
}

export interface PublicAnnouncement {
  id: number
  title: string
  slug: string
  kind: string
  style: string
  body_html: string
  cta_label: string
  cta_url: string
  placements: string[]
  priority: number
  dismissible: boolean
  updated_at: string | null
  images: PublicAnnouncementImage[]
}

export function fetchAnnouncements(): Promise<PublicAnnouncement[]> {
  return getJSON<PublicAnnouncement[]>(`${BASE}/public/announcements/`)
}

export interface WebstoreConfig {
  online_sales_enabled: boolean
  inquiries_enabled: boolean
  accounts_enabled: boolean
  public_base_url?: string
  hours?: StoreHoursPublic
}

export function fetchWebstoreConfig(): Promise<WebstoreConfig> {
  return getJSON<WebstoreConfig>(`${BASE}/config/`)
}

export interface CatalogImage {
  id?: number
  url: string
  alt: string
}

export interface CatalogItem {
  id: number
  title: string
  slug: string
  category_name: string | null
  category_slug: string | null
  condition: string
  condition_display: string
  price: string
  compare_at_price: string | null
  on_sale: boolean
  /** Units available to hold (integer). 0 = reserved/sold out of online hold. */
  available: number
  featured: boolean
  stock: number
  image: CatalogImage | null
  /** ISO timestamps from the public catalog serializer. */
  created_at?: string | null
  published_at?: string | null
}

export interface CatalogDetail extends CatalogItem {
  description: string
  sku: string
  images: CatalogImage[]
  return_policy?: string
  hold_policy?: string
}

export interface CatalogPage {
  count: number
  page: number
  page_size: number
  num_pages: number
  results: CatalogItem[]
}

export interface CategoryCount {
  name: string
  slug: string
  count: number
}

export interface CategoriesResponse {
  total: number
  categories: CategoryCount[]
}

export type CatalogParams = {
  category?: string
  q?: string
  sort?: string
  page?: number
  page_size?: number
  on_sale?: string
  featured?: string
  available?: string
}

export function fetchCatalog(params: CatalogParams = {}): Promise<CatalogPage> {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  })
  const query = qs.toString()
  return getJSON<CatalogPage>(`${BASE}/catalog/${query ? `?${query}` : ''}`)
}

export function fetchListing(slug: string): Promise<CatalogDetail> {
  return getJSON<CatalogDetail>(`${BASE}/catalog/${encodeURIComponent(slug)}/`)
}

// Categories rarely change within a session - memoize so the shop sidebar and the
// shop sidebar share a single request.
let categoriesPromise: Promise<CategoriesResponse> | null = null

export function fetchCategories(): Promise<CategoriesResponse> {
  if (!categoriesPromise) {
    categoriesPromise = getJSON<CategoriesResponse>(`${BASE}/catalog/categories/`).catch((err) => {
      categoriesPromise = null
      throw err
    })
  }
  return categoriesPromise
}

export function money(value: string | number): string {
  const n = typeof value === 'number' ? value : parseFloat(value)
  if (Number.isNaN(n)) return '$0'
  return `$${n.toFixed(2).replace(/\.00$/, '')}`
}

// ── Holds (Policy v1: reserve online, pay/pickup in store) ───────────────────

export interface HoldInput {
  items: { slug: string; qty: number }[]
  customer_name: string
  email: string
  phone?: string
  note?: string
  idempotency_key?: string
}

export interface ThreadMessage {
  id: number
  author_kind: 'customer' | 'staff' | 'system' | string
  body: string
  created_at: string
}

export interface PublicThread {
  public_token: string
  state: string
  customer_unread: number
  messages: ThreadMessage[]
  listing_title?: string
}

export interface HoldTimelineEvent {
  key: string
  label: string
  at: string | null
}

export type HoldRailStage = {
  key: string
  label: string
  state: 'done' | 'current' | 'upcoming'
  at?: string | null
}

export interface HoldSummary {
  status_token: string
  listing_title: string
  listing_slug?: string | null
  listing_image?: CatalogImage | null
  listing_category_slug?: string | null
  listing_category_name?: string | null
  quantity: number
  unit_price?: string
  status: string
  status_display: string
  customer_name?: string | null
  email?: string | null
  expires_at: string | null
  created_at: string
  policy: string
  thread?: PublicThread | null
  stage?: number
  stage_total?: number
  stages?: HoldRailStage[]
  customer_status?: string
  headline?: string
  next_step?: string
  can_pickup?: boolean
  tone?: string
  timeline?: HoldTimelineEvent[]
  release_reason?: string
  pickup_code?: string | null
  expires_label?: string
  expires_secondary?: string
  expires_kind?: 'countdown' | 'day' | string
  confirmed_until_preview?: string | null
  confirmed_until_label?: string | null
  provisional_label?: string | null
  do_nothing_label?: string | null
  if_confirmed_label?: string | null
  code_expires_at?: string | null
  attempts_remaining?: number | null
  resend_available_in?: number | null
  has_active_confirmation?: boolean | null
  held_until?: string | null
  staff_note_public?: string
  /** When set, the customer hid this finished hold from History. */
  customer_archived_at?: string | null
}

export type HoldConfirmationCreateResult = {
  detail: string
  code_expires_at?: string | null
  resend_available_in?: number
  attempts_remaining?: number
}

export type HoldConfirmationStatus = {
  confirmed: boolean
  held_until: string | null
}

export type MyConversationRow = {
  public_token: string
  state: string
  listing_title: string | null
  listing_slug?: string | null
  reservation_status_token: string | null
  customer_unread: number
  last_message_at?: string | null
  last_message_preview?: string | null
  last_message_author?: string | null
}

export type MyThread = {
  public_token: string
  state: string
  listing_title: string | null
  listing_slug?: string | null
  reservation_status_token: string | null
  customer_unread: number
  last_message_at?: string | null
  messages: ThreadMessage[]
}

export async function fetchMyThread(token: string): Promise<MyThread> {
  const headers = authHeaders()
  const res = await fetch(`${BASE}/my/conversations/${encodeURIComponent(token)}/`, {
    credentials: 'include',
    headers,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Could not load thread (${res.status})`)
  }
  return data as MyThread
}

export async function markMyThreadUnread(token: string): Promise<void> {
  const res = await fetch(
    `${BASE}/my/conversations/${encodeURIComponent(token)}/unread/`,
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}',
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Could not mark unread (${res.status})`)
  }
}

export async function deleteMyThread(token: string): Promise<void> {
  const res = await fetch(
    `${BASE}/my/conversations/${encodeURIComponent(token)}/delete/`,
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}',
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Could not delete (${res.status})`)
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(extra || {}),
  }
  const mem = getAccessToken()
  if (mem) headers.Authorization = `Bearer ${mem}`
  return headers
}

export async function requestHold(input: HoldInput): Promise<HoldSummary | { holds: HoldSummary[]; count: number }> {
  const headers = authHeaders({ 'Content-Type': 'application/json' })
  if (input.idempotency_key) headers['Idempotency-Key'] = input.idempotency_key
  const res = await fetch(`${BASE}/holds/`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Hold request failed (${res.status})`)
  }
  return data
}

export function fetchHold(token: string): Promise<HoldSummary> {
  return getJSON<HoldSummary>(`${BASE}/holds/${encodeURIComponent(token)}/`)
}

export function createHoldConfirmation(token: string): Promise<HoldConfirmationCreateResult> {
  return postJSON<HoldConfirmationCreateResult>(
    `${BASE}/holds/${encodeURIComponent(token)}/confirmations/`,
  )
}

export function confirmHoldCode(token: string, code: string): Promise<HoldSummary> {
  return postJSON<HoldSummary>(`${BASE}/holds/${encodeURIComponent(token)}/confirm/`, { code })
}

export function fetchHoldConfirmationStatus(token: string): Promise<HoldConfirmationStatus> {
  return getJSON<HoldConfirmationStatus>(
    `${BASE}/holds/${encodeURIComponent(token)}/confirmation-status/`,
  )
}

/** @deprecated Prefer createHoldConfirmation - same endpoint behavior. */
export async function resendHoldVerification(token: string): Promise<HoldConfirmationCreateResult> {
  return createHoldConfirmation(token)
}

export async function changeHoldEmail(token: string, email: string): Promise<HoldSummary> {
  return postJSON<HoldSummary>(`${BASE}/holds/${encodeURIComponent(token)}/change-email/`, {
    email,
  })
}

export async function postThreadMessage(token: string, body: string): Promise<PublicThread> {
  const res = await fetch(`${BASE}/threads/${encodeURIComponent(token)}/messages/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Could not send message (${res.status})`)
  }
  return data as PublicThread
}

export async function markThreadRead(token: string): Promise<PublicThread> {
  const res = await fetch(`${BASE}/threads/${encodeURIComponent(token)}/read/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Could not mark thread read (${res.status})`)
  }
  return data as PublicThread
}

export async function askAboutListing(input: {
  slug: string
  name: string
  email: string
  phone?: string
  body: string
}): Promise<PublicThread & { needs_verification?: boolean }> {
  const res = await fetch(`${BASE}/catalog/${encodeURIComponent(input.slug)}/ask/`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      phone: input.phone || '',
      body: input.body,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Could not send inquiry (${res.status})`)
  }
  return data as PublicThread & { needs_verification?: boolean }
}

const MY_REQUESTS_KEY = 'ecothrift.my_requests.v1'

export type MyRequestEntry = {
  kind: 'hold' | 'thread'
  token: string
  title: string
  saved_at: string
}

export function loadMyRequests(): MyRequestEntry[] {
  try {
    const raw = localStorage.getItem(MY_REQUESTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function rememberMyRequest(entry: Omit<MyRequestEntry, 'saved_at'>) {
  try {
    const prev = loadMyRequests().filter((e) => !(e.kind === entry.kind && e.token === entry.token))
    const next: MyRequestEntry[] = [
      { ...entry, saved_at: new Date().toISOString() },
      ...prev,
    ].slice(0, 20)
    localStorage.setItem(MY_REQUESTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** @deprecated Online checkout disabled - use requestHold. POLICY_COPY_OK */
export async function checkout(_input: unknown): Promise<never> {
  // POLICY_COPY_OK: steers callers away from online checkout
  throw new Error('Online checkout is no longer available. Request a hold instead.')
}

/** @deprecated Legacy order status disabled. */
export function fetchOrder(_orderNumber: string): Promise<never> {
  return Promise.reject(new Error('Order status lookup is no longer available.'))
}

// ── Blog (database-backed; `live()` posts only) ───────────────────────────────
const BLOG_BASE = '/api/blog/public'

export interface BlogHero {
  id: number
  url: string
  alt: string
}

export interface BlogPostSummary {
  slug: string
  title: string
  series: string
  series_slug: string
  excerpt: string
  /** Display date, e.g. "June 10, 2024". */
  date: string
  /** ISO date (YYYY-MM-DD) for sorting / structured data. */
  date_iso: string
  hero: BlogHero | null
  tags: string[]
  author_name: string
  reading_minutes: number
}

export interface BlogPostDetail extends BlogPostSummary {
  body_html: string
  author_role: string
  meta_title: string
  meta_description: string
}

export interface BlogSeries {
  name: string
  slug: string
  description: string
  post_count: number
}

export function fetchBlogPosts(series?: string): Promise<BlogPostSummary[]> {
  const query = series ? `?series=${encodeURIComponent(series)}` : ''
  return getJSON<BlogPostSummary[]>(`${BLOG_BASE}/posts/${query}`)
}

export function fetchBlogPost(slug: string): Promise<BlogPostDetail> {
  return getJSON<BlogPostDetail>(`${BLOG_BASE}/posts/${encodeURIComponent(slug)}/`)
}

export function fetchBlogSeries(): Promise<BlogSeries[]> {
  return getJSON<BlogSeries[]>(`${BLOG_BASE}/series/`)
}
