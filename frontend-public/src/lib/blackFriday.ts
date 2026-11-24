/**
 * Black Friday on the desktop site (owner 2026-11-24, Dash Update #220): the home page is the sale and one button.
 * The server stamps `<html data-day="bf">` on every page of the desktop site while it shows (apps/core/middleware.py),
 * so the page knows before its first paint and nothing swaps or moves.
 */
export function stampedBlackFriday(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-day') === 'bf'
}

export function useBlackFriday(): boolean {
  return stampedBlackFriday()
}
