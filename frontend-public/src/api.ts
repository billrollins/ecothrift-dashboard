// Tiny fetch-based client for the public storefront API (no auth, same-origin /api).
const BASE = '/api/webstore'

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
  available: boolean
  featured: boolean
  stock: number
  image: CatalogImage | null
}

export interface CatalogDetail extends CatalogItem {
  description: string
  sku: string
  images: CatalogImage[]
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
  on_sale?: string
  featured?: string
  available?: string
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return (await res.json()) as T
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

// Categories rarely change within a session — memoize so the shop sidebar and the
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

// ── Checkout + orders ────────────────────────────────────────────────────────

export interface CheckoutInput {
  items: { slug: string; qty: number }[]
  customer_name: string
  email: string
  phone?: string
  fulfillment: 'pickup' | 'ship'
  ship_address1?: string
  ship_address2?: string
  ship_city?: string
  ship_state?: string
  ship_postal?: string
  note?: string
}

export interface OrderLineDTO {
  id: number
  title: string
  slug: string
  sku: string
  unit_price: string
  quantity: number
  line_total: string
}

export interface OrderPayment {
  provider: string
  requires_action: boolean
  redirect_url: string | null
  message: string
}

export interface OrderSummary {
  order_number: string
  status: string
  status_display: string
  payment_status: string
  payment_status_display: string
  fulfillment: string
  fulfillment_display: string
  customer_name: string
  email: string
  phone: string
  ship_address1: string
  ship_address2: string
  ship_city: string
  ship_state: string
  ship_postal: string
  subtotal: string
  shipping: string
  tax: string
  total: string
  item_count: number
  customer_note: string
  lines: OrderLineDTO[]
  created_at: string
  payment?: OrderPayment
}

export async function checkout(input: CheckoutInput): Promise<OrderSummary> {
  const res = await fetch(`${BASE}/checkout/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && data.detail) || `Checkout failed (${res.status})`)
  }
  return data as OrderSummary
}

export function fetchOrder(orderNumber: string): Promise<OrderSummary> {
  return getJSON<OrderSummary>(`${BASE}/order-status/${encodeURIComponent(orderNumber)}/`)
}
