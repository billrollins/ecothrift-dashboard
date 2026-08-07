import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SITE_URL } from './data/content'

const BRAND = 'Eco-Thrift'
const DEFAULT_TITLE = `${BRAND} - Restore, Reuse, Reimagine`
const DEFAULT_DESCRIPTION =
  'Eco-Thrift is a liquidation and thrift store in Omaha, NE. Quality goods at fair prices, with new finds every week. Shop in person or pick up at our store.'

export interface Seo {
  /** Page title (without the brand suffix); omit for the homepage default. */
  title?: string
  description?: string
  /** Canonical path (defaults to the current route's pathname). */
  path?: string
  type?: 'website' | 'article' | 'product'
  /** Absolute or root-relative image URL for social cards. */
  image?: string
  /** Keep this route out of search indexes (checkout, order, 404, etc.). */
  noindex?: boolean
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Manage the document head for a route: title, meta description, canonical URL,
 * Open Graph + Twitter tags, and the robots directive. Crawlers that execute JS
 * (Google) read these; static social scrapers fall back to the defaults baked
 * into index.html.
 */
export function useSeo(seo: Seo = {}) {
  const location = useLocation()
  const { title, description, path, type = 'website', image, noindex = false } = seo

  useEffect(() => {
    const fullTitle = title ? `${title} · ${BRAND}` : DEFAULT_TITLE
    const desc = description || DEFAULT_DESCRIPTION
    const canonical = `${SITE_URL}${path ?? location.pathname}`
    const absImage = image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : undefined

    document.title = fullTitle
    upsertMeta('name', 'description', desc)
    upsertMeta('name', 'robots', noindex ? 'noindex,follow' : 'index,follow')
    upsertLink('canonical', canonical)

    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:url', canonical)
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', desc)
    upsertMeta('name', 'twitter:card', absImage ? 'summary_large_image' : 'summary')
    if (absImage) {
      upsertMeta('property', 'og:image', absImage)
      upsertMeta('name', 'twitter:image', absImage)
    }

    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title, description, path, type, image, noindex, location.pathname])
}

/** Inject a JSON-LD structured-data block for the lifetime of the component.
 * Pass a falsy value (e.g. before data loads) to inject nothing. */
export function useJsonLd(data: unknown) {
  const json = data ? JSON.stringify(data) : ''
  useEffect(() => {
    if (!json) return
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = json
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [json])
}
