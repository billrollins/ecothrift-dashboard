// Real Eco-Thrift copy. Reconciliations:
//  - Retail store is Eco-Thrift - Canfield (8425 W Center Rd). Applewood / 9717 Q St closed.
//  - Do not claim daily automatic markdowns on customer-facing copy (outdated).
//    The single "10% on Mondays" testimonial was dropped as inconsistent/outdated).
//
// Blog posts are no longer stored here - they are database-backed (see `apps.blog` and
// `fetchBlogPosts`/`fetchBlogPost` in `../api`), authored from the staff Blog Studio.

/** Canonical public origin (matches PUBLIC_SITE_CANONICAL_HOST on the server). */
export const SITE_URL = 'https://ecothrift.us'

/** Files in `frontend-public/public/` - use for `<img src>` (prod base is `/static/site/`). */
export function publicAssetUrl(path: string): string {
  const rel = path.replace(/^\//, '')
  return `${import.meta.env.BASE_URL}${rel}`
}

export function absolutePublicAssetUrl(path: string): string {
  const url = publicAssetUrl(path)
  return url.startsWith('http') ? url : `${SITE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

export const STORE = {
  tagline: 'Restore, Reuse, Reimagine Our Future',
  metaDescription:
    'Eco-Thrift is a liquidation and thrift store in Omaha, NE that aims to stimulate a circular economy.',
  email: 'sales.ecothrift@outlook.com',
  retail: {
    name: 'Eco-Thrift - Canfield',
    address: '8425 W Center Rd, Omaha, NE 68124',
    /** Default schedule copy. Live pages build this from `/api/webstore/config/` hours. */
    hours: '9 AM - 6 PM, Tuesday - Saturday · Closed Sunday & Monday',
    /**
     * Offline fallback for live open status.
     * Live copy comes from AppSetting `online_sales.hours` via /api/webstore/config/.
     * Weekdays here use JS Date.getDay(): 0=Sun … 6=Sat.
     */
    hoursConfig: {
      timezone: 'America/Chicago',
      openMinutes: 9 * 60,
      closeMinutes: 18 * 60,
      closedWeekdays: [0, 1],
    },
    phone: '(402) 881-9861',
    phoneHref: '+14028819861',
    /** Google Maps place pin (Eco-Thrift - Canfield), not street-address geocode. */
    mapsLat: 41.2336219,
    mapsLng: -96.0442073,
    mapsPlaceUrl:
      'https://www.google.com/maps/place/Eco-Thrift+-+Canfield/@41.2336219,-96.0442073,17z/data=!3m1!4b1!4m6!3m5!1s0x87938d8771cb8e6d:0x8b75ff46ec9d2adb!8m2!3d41.2336219!4d-96.0442073!16s%2Fg%2F11xw30bys8',
    /** Google reviews - swap for a canonical review URL when available. */
    reviewsUrl:
      'https://www.google.com/maps/place/Eco-Thrift+-+Canfield/@41.2336219,-96.0442073,17z/data=!3m1!4b1!4m6!3m5!1s0x87938d8771cb8e6d:0x8b75ff46ec9d2adb!8m2!3d41.2336219!4d-96.0442073!16s%2Fg%2F11xw30bys8',
  },
} as const

/** First name only, by owner request - no surname anywhere public. */
export const AUTHOR = {
  name: 'Bill',
  role: 'Owner',
  initials: 'B',
  photo: '/author/bill-rollins.jpg',
} as const

const SCHEMA_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/** schema.org Store / LocalBusiness. Pass settings hours (Python 0=Mon) when available. */
export function storeJsonLd(hours?: {
  open?: string
  close?: string
  closed_weekdays?: number[]
} | null) {
  const open = hours?.open ?? '09:00'
  const close = hours?.close ?? '18:00'
  const closed = new Set(hours?.closed_weekdays ?? [0, 6])
  const dayOfWeek = SCHEMA_WEEKDAYS.filter((_, i) => !closed.has(i))
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${SITE_URL}/#store`,
    name: 'Eco-Thrift - Canfield',
    description: STORE.metaDescription,
    url: SITE_URL,
    telephone: STORE.retail.phoneHref,
    email: STORE.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '8425 W Center Rd',
      addressLocality: 'Omaha',
      addressRegion: 'NE',
      postalCode: '68124',
      addressCountry: 'US',
    },
    openingHoursSpecification: dayOfWeek.length
      ? [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [...dayOfWeek],
            opens: open,
            closes: close,
          },
        ]
      : [],
    geo: {
      '@type': 'GeoCoordinates',
      latitude: STORE.retail.mapsLat,
      longitude: STORE.retail.mapsLng,
    },
  }
}

/** Fallback structured data using Canfield defaults. */
export const STORE_JSONLD = storeJsonLd()

/** Open Google Maps directions to the retail place pin. */
export function retailMapsDirectionsUrl(): string {
  const { mapsLat, mapsLng } = STORE.retail
  return `https://www.google.com/maps/dir/?api=1&destination=${mapsLat},${mapsLng}`
}

/** Interactive Google Maps embed for the retail store (no API key). */
export function retailMapsEmbedSrc(): string {
  const { name, mapsLat, mapsLng } = STORE.retail
  const q = `${encodeURIComponent(name)}+@${mapsLat},${mapsLng}`
  return `https://www.google.com/maps?q=${q}&z=16&output=embed`
}

/** Web-shop categories - keep in sync with apps/buying/taxonomy_v1.py (slugs via Django slugify). */
export interface ShopCategory {
  name: string
  slug: string
  description: string
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { name: 'Kitchen & dining', slug: 'kitchen-dining', description: '' },
  { name: 'Furniture', slug: 'furniture', description: '' },
  { name: 'Outdoor & patio furniture', slug: 'outdoor-patio-furniture', description: '' },
  { name: 'Home décor & lighting', slug: 'home-decor-lighting', description: '' },
  { name: 'Household & cleaning', slug: 'household-cleaning', description: '' },
  { name: 'Bedding & bath', slug: 'bedding-bath', description: '' },
  { name: 'Storage & organization', slug: 'storage-organization', description: '' },
  { name: 'Toys & games', slug: 'toys-games', description: '' },
  { name: 'Sports & outdoors', slug: 'sports-outdoors', description: '' },
  { name: 'Tools & hardware', slug: 'tools-hardware', description: '' },
  { name: 'Office & school supplies', slug: 'office-school-supplies', description: '' },
  { name: 'Electronics', slug: 'electronics', description: '' },
  { name: 'Baby & kids', slug: 'baby-kids', description: '' },
  { name: 'Health, beauty & personal care', slug: 'health-beauty-personal-care', description: '' },
  { name: 'Apparel & accessories', slug: 'apparel-accessories', description: '' },
  { name: 'Books & media', slug: 'books-media', description: '' },
  { name: 'Pet supplies', slug: 'pet-supplies', description: '' },
  { name: 'Party, seasonal & novelty', slug: 'party-seasonal-novelty', description: '' },
  { name: 'Mixed lots & uncategorized', slug: 'mixed-lots-uncategorized', description: '' },
]

