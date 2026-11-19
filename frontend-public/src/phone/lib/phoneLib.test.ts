import { describe, expect, it } from 'vitest'
import { isNewer } from '../shell/Prompts'
import { tagSku } from '../shell/TopBar'
import { bucks, count, money, shortDate, tagParts } from './format'
import { hoursRows, openStatus } from './hours'
import { parseSession } from './member'
import { find, itemById, parseStock } from './stock'

// The feed's shape (apps/storefront stock.json): cats in taxonomy order, rows as arrays.
const RAW = {
  v: 'x', as_of: '2026-11-19T12:00:00-06:00',
  cats: [
    { id: 'kitchen', name: 'Kitchen & dining', pieces: 2149 },
    { id: 'furniture', name: 'Furniture', pieces: 195 },
    { id: 'decor', name: 'Home décor & lighting', pieces: 1405 },
  ],
  trucks: [{ id: 7, name: 'Walmart', pallets: 21, pieces: 1255, listed: true }],
  instore: [
    [1, 'SMEG retro espresso machine with grinder', 0, 600, 1200, 102, 1, '0226011'],
    [2, 'Vitamix 5300 blender', 0, 200, 399.99, 28, 1, '0226541'],
    [3, 'Planked panel bed with arched headboard', 1, 584.5, 1669.99, 52.6, 1, '0227076'],
    [4, 'Brass table lamp', 2, 12, 0, 1.2, 3, '', 2],
  ] as Array<[number, string, number, number, number, number, number, string, number?]>,
  coming: [
    [10, 'Farmhouse hall tree with bench', 1, 482.98, 1, 0],
    [11, 'Casabrews espresso machine with grinder', 0, 449.99, 2, 0],
    [12, 'Lamp shade', 2, 0, 1, 0],
  ] as Array<[number, string, number, number, number, number]>,
}
const stock = parseStock(RAW)

describe('lib/stock find', () => {
  it('reads the compact rows into page ids, category ids and trucks', () => {
    expect(stock.instore[0]).toMatchObject({ id: 'p1', pid: 1, cat: 'kitchen', price: 600, retail: 1200, tb: 102, tag: '0226011' })
    expect(stock.coming[0]).toMatchObject({ id: 'm10', cat: 'furniture', retail: 482.98, qty: 1 })
    expect(stock.coming[0].where === 'coming' && stock.coming[0].truck?.name).toBe('Walmart')
  })

  it('reads the photo flag (9th field): 1 photo sheet, 2 stock photo, absent or 0 none', () => {
    const one = parseStock({ ...RAW, instore: [[5, 'Chair', 1, 10, 20, 0, 1, '1', 1], [6, 'Desk', 1, 10, 20, 0, 1, '2', 0]] })
    expect(one.instore.map((r) => r.where === 'instore' && r.photo)).toEqual(['sheet', null])
    expect(stock.instore.map((r) => r.where === 'instore' && r.photo)).toEqual([null, null, null, 'stock'])
  })

  it('matches every word at the start of a word, in the name or the category', () => {
    expect(find('instore', { q: 'espresso' }, stock).map((r) => r.id)).toEqual(['p1'])
    expect(find('instore', { q: 'Esp grind' }, stock).map((r) => r.id)).toEqual(['p1'])
    expect(find('instore', { q: 'presso' }, stock)).toEqual([]) // not inside a word
    expect(find('instore', { q: 'kitchen' }, stock).map((r) => r.id).sort()).toEqual(['p1', 'p2'])
    expect(find('instore', { q: 'decor' }, stock).map((r) => r.id)).toEqual(['p4']) // é is e
    expect(find('instore', { q: 'espresso bed' }, stock)).toEqual([])
  })

  it('finds a piece by its tag number', () => {
    expect(find('instore', { q: '0227076' }, stock).map((r) => r.id)).toEqual(['p3'])
  })

  it('filters by category and searches the trucks apart', () => {
    expect(find('instore', { cat: 'furniture' }, stock).map((r) => r.id)).toEqual(['p3'])
    expect(find('coming', { q: 'espresso' }, stock).map((r) => r.id)).toEqual(['m11'])
  })

  it('sorts best (biggest gap first, no retail last), low and high', () => {
    expect(find('instore', {}, stock).map((r) => r.id)).toEqual(['p3', 'p1', 'p2', 'p4'])
    expect(find('instore', { sort: 'low' }, stock).map((r) => r.id)).toEqual(['p4', 'p2', 'p3', 'p1'])
    expect(find('instore', { sort: 'high' }, stock).map((r) => r.id)).toEqual(['p1', 'p3', 'p2', 'p4'])
    expect(find('coming', {}, stock).map((r) => r.id)).toEqual(['m10', 'm11', 'm12'])
  })

  it('looks up one row by its page id', () => {
    expect(itemById('p2', stock)?.name).toBe('Vitamix 5300 blender')
    expect(itemById('m12', stock)?.name).toBe('Lamp shade')
    expect(itemById('p99', stock)).toBeNull()
    expect(find('instore', {}, null)).toEqual([])
  })
})

describe('lib/format', () => {
  it('money has thousands commas and two places', () => {
    expect(money(1200)).toBe('$1,200.00')
    expect(money(4.5)).toBe('$4.50')
    expect(money(1234567.891)).toBe('$1,234,567.89')
    expect(money(0)).toBe('$0.00')
  })

  it('bucks never carry a dollar sign', () => {
    expect(bucks(20)).toBe('20.00')
    expect(bucks(1234.5)).toBe('1,234.50')
    expect(bucks(102)).not.toContain('$')
  })

  it('tagParts splits the tag the way it is printed', () => {
    expect(tagParts(600)).toEqual({ dollars: '600', cents: '00' })
    expect(tagParts(19.99)).toEqual({ dollars: '19', cents: '99' })
    expect(tagParts(1669.99)).toEqual({ dollars: '1,669', cents: '99' })
  })

  it('counts and dates', () => {
    expect(count(35071)).toBe('35,071')
    expect(shortDate('2026-12-19')).toBe('Dec 19')
    expect(shortDate('')).toBe('')
    expect(shortDate(null)).toBe('')
  })
})

describe('the shell', () => {
  it('a 6 or 7 digit search is a tag number', () => {
    expect(tagSku('0226011')).toBe('ITM0226011')
    expect(tagSku(' 226011 ')).toBe('ITM0226011')
    expect(tagSku('12345')).toBeNull()
    expect(tagSku('12345678')).toBeNull()
    expect(tagSku('chair 2')).toBeNull()
  })

  it('the update bar shows only when both sides know a release and they differ', () => {
    expect(isNewer({ app: '2.317.0' }, '2.316.0')).toBe(true)
    expect(isNewer({ app: 'v2.316.0' }, '2.316.0')).toBe(false)
    expect(isNewer({}, '2.316.0')).toBe(false)
    expect(isNewer({ app: '2.317.0' }, '')).toBe(false)
    expect(isNewer(null, '2.316.0')).toBe(false)
  })

  it('the session keeps only what the page shows', () => {
    expect(parseSession({ status: 'signed_out' })).toEqual({ status: 'out', member: null })
    const s = parseSession({ status: 'member', member: { first_name: 'Ana', email: 'a@b.c', bucks_available: '35.00', bucks_use_by: '2026-12-19', ready: true } })
    expect(s).toEqual({ status: 'member', member: { first: 'Ana', bucks: 35, useBy: '2026-12-19', ready: true, finishing: false } })
  })

  it('a member with a step left in the app is finishing (no mobile number, or finish steps left)', () => {
    const m = (extra: Record<string, unknown>) => parseSession({ status: 'member', member: { first_name: 'Ana', ready: true, ...extra } }).member
    expect(m({ needs_phone: true })?.finishing).toBe(true)
    expect(m({ ready: false, finish_steps: ['selfie', 'sign'] })?.finishing).toBe(true)
    expect(m({ ready: false, finish_steps: [] })?.finishing).toBe(false) // only the register is left
    expect(m({ ready: false })?.finishing).toBe(false)
    expect(m({ finish_steps: ['selfie'] })?.finishing).toBe(false) // ready: steps are not required
  })
})

describe('lib/hours', () => {
  const hours = { timezone: 'America/Chicago', open: '09:00', close: '18:00', closed_weekdays: [6], overrides: [] }
  // 2026-11-19 is a Thursday. Chicago is UTC-6 in November.
  const at = (iso: string) => new Date(iso)

  it('open, before opening, after closing, Saturday night', () => {
    expect(openStatus(hours, at('2026-11-19T17:00:00Z'))).toEqual({ open: true, label: 'Open until 6 PM' })
    expect(openStatus(hours, at('2026-11-19T13:00:00Z'))).toEqual({ open: false, label: 'Opens 9 AM' })
    expect(openStatus(hours, at('2026-11-20T01:00:00Z'))).toEqual({ open: false, label: 'Opens 9 AM tomorrow' })
    expect(openStatus(hours, at('2026-11-22T01:00:00Z'))).toEqual({ open: false, label: 'Opens Monday 9 AM' })
  })

  it('a holiday closure counts', () => {
    const thanks = { ...hours, overrides: [{ label: 'Thanksgiving', date_start: '2026-11-26', date_end: '2026-11-26', closed: true }] }
    expect(openStatus(thanks, at('2026-11-26T17:00:00Z')).open).toBe(false)
    expect(openStatus(thanks, at('2026-11-26T01:00:00Z')).label).toBe('Opens Friday 9 AM')
    expect(hoursRows(thanks)).toEqual([['Monday to Saturday', '9 AM to 6 PM'], ['Sunday', 'Closed'], ['Thanksgiving, Nov 26', 'Closed']])
  })

  it('no hours in the feed falls back to the store default', () => {
    expect(hoursRows(null)).toEqual([['Monday to Saturday', '9 AM to 6 PM'], ['Sunday', 'Closed']])
  })
})
