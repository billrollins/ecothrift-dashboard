/** Numbers as the store writes them. ThriftBucks never carry a "$" (word rules, BRIEF3.md). */

function comma(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function two(n: number): [string, string] {
  const v = Number.isFinite(n) ? Math.abs(n) : 0
  const [whole, cents] = v.toFixed(2).split('.')
  return [comma(whole), cents]
}

/** `$1,200.00` */
export function money(n: number): string {
  const [whole, cents] = two(n)
  return `${n < 0 ? '-' : ''}$${whole}.${cents}`
}

/** `1,234.50` (ThriftBucks: no "$", ever). */
export function bucks(n: number): string {
  const [whole, cents] = two(n)
  return `${n < 0 ? '-' : ''}${whole}.${cents}`
}

/** The printed tag's parts: 600 -> {dollars: '600', cents: '00'}; 19.99 -> {dollars: '19', cents: '99'}. */
export function tagParts(n: number): { dollars: string; cents: string } {
  const [dollars, cents] = two(n)
  return { dollars, cents }
}

/** A plain count: 35071 -> `35,071`. */
export function count(n: number): string {
  return comma(String(Math.max(0, Math.round(Number(n) || 0))))
}

/** An ISO date (`2026-12-19`) as `Dec 19`; '' when missing or not a date. */
export function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(m[2]) - 1]
  return month ? `${month} ${Number(m[3])}` : ''
}
