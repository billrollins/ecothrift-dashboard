/**
 * The store's day: 'normal' or 'bf' (Black Friday), from the home feed (AppSetting `storefront.day`).
 * It sets `data-day` on <html>, which recolours the kit (kit.css) and picks `.if-bf` / `.if-normal`.
 */
import { useHome, type HomeFeed } from './boot'

export type Day = 'normal' | 'bf'

export function dayOf(feed: HomeFeed | null): Day {
  return feed?.day === 'bf' ? 'bf' : 'normal'
}

/** Put the day on <html> (main.tsx does it once before the first render, so nothing repaints). */
export function applyDay(day: Day) {
  const html = document.documentElement
  if (html.getAttribute('data-day') !== day) html.setAttribute('data-day', day)
}

export function useDay(): Day {
  const day = dayOf(useHome())
  if (typeof document !== 'undefined') applyDay(day)
  return day
}
