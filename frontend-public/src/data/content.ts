// Real Eco-Thrift copy, reconciled from the live-site scrape
// (.ai/reference/shopify-site-copy/site_copy.md). Reconciliations:
//  - Retail store is Eco-Thrift — Canfield (8425 W Center Rd). Applewood / 9717 Q St closed.
//  - Do not claim daily automatic markdowns on customer-facing copy (outdated).
//    The single "10% on Mondays" testimonial was dropped as inconsistent/outdated).
//
// Blog posts are no longer stored here — they are database-backed (see `apps.blog` and
// `fetchBlogPosts`/`fetchBlogPost` in `../api`), authored from the staff Blog Studio.

/** Canonical public origin (matches PUBLIC_SITE_CANONICAL_HOST on the server). */
export const SITE_URL = 'https://ecothrift.us'

/** Files in `frontend-public/public/` — use for `<img src>` (prod base is `/static/site/`). */
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
    name: 'Eco-Thrift — Canfield',
    address: '8425 W Center Rd, Omaha, NE 68124',
    hours: '9 AM – 6 PM, Monday – Saturday · Closed Sunday',
    phone: '(402) 881-9861',
    phoneHref: '+14028819861',
    /** Google Maps place pin (Eco-Thrift — Canfield), not street-address geocode. */
    mapsLat: 41.2336219,
    mapsLng: -96.0442073,
    mapsPlaceUrl:
      'https://www.google.com/maps/place/Eco-Thrift+-+Canfield/@41.2336219,-96.0442073,17z/data=!3m1!4b1!4m6!3m5!1s0x87938d8771cb8e6d:0x8b75ff46ec9d2adb!8m2!3d41.2336219!4d-96.0442073!16s%2Fg%2F11xw30bys8',
  },
} as const

export const AUTHOR = {
  name: 'Bill Rollins',
  role: 'Founder & CEO, Eco-Thrift',
  initials: 'BR',
  photo: '/author/bill-rollins.jpg',
} as const

/** schema.org Store / LocalBusiness for the retail location (used on Home + Visit). */
export const STORE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  '@id': `${SITE_URL}/#store`,
  name: 'Eco-Thrift — Canfield',
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
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
  ],
  geo: {
    '@type': 'GeoCoordinates',
    latitude: STORE.retail.mapsLat,
    longitude: STORE.retail.mapsLng,
  },
} as const

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

/** Web-shop categories — keep in sync with apps/buying/taxonomy_v1.py (slugs via Django slugify). */
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

export interface Step {
  n: number
  title: string
  text: string
}

export const HOW_IT_WORKS: Step[] = [
  {
    n: 1,
    title: 'Browse the floor',
    text: 'New finds arrive all week — brand-name overstock and gently used goods, inspected and ready. Most items are one of a kind.',
  },
  {
    n: 2,
    title: 'Know the price',
    text: 'Tags are clear on the shelf — no guessing. Most items are one of a kind, so if something catches your eye, grab it while you are here.',
  },
  {
    n: 3,
    title: 'Take it home',
    text: 'Pay in store and carry it out the same day, or reserve online and pick up at our Canfield store.',
  },
]

export interface Testimonial {
  quote: string
  who: string
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Great prices on new items — electronics, furniture, home goods, kids clothing. There is always something new to check out.',
    who: 'Frequent customer',
  },
  {
    quote:
      'Easy to navigate, easy to see what they are selling and know the price without pulling out your phone. A genuinely pleasant place to shop.',
    who: 'Verified shopper',
  },
  {
    quote:
      'It is hardly a thrift store — everything is brand new or very close. The prices are fair, and there is always something new to discover.',
    who: 'Regular customer',
  },
]
