/**
 * The store's day on the desktop site: 'normal' or 'bf' (Black Friday). The same source as the phone site (the home
 * feed's `day`, phone/lib/day.ts), plus the server's own stamp: apps/core/middleware.py may put `data-day="bf"` on
 * desktop.html (the Black Friday window, or the owner's Testing pick "Desktop: Black Friday"), and that stamp wins for
 * the whole visit, so the page paints in the sale's colours at once and never swaps back.
 */
import { useHome, type HomeFeed } from '../../phone/lib/boot'
import { applyDay, type Day } from '../../phone/lib/day'

/** Read once, before anything changes it: what the server put on <html>. */
const STAMPED: Day =
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-day') === 'bf' ? 'bf' : 'normal'

export function stampedDay(): Day {
  return STAMPED
}

export function deskDayOf(feed: HomeFeed | null, stamped: Day = STAMPED): Day {
  return stamped === 'bf' || feed?.day === 'bf' ? 'bf' : 'normal'
}

export function useDeskDay(): Day {
  const day = deskDayOf(useHome())
  if (typeof document !== 'undefined') applyDay(day)
  return day
}
