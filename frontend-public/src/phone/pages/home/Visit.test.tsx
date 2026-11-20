/**
 * Home's visit block (owner 2026-11-20: "spruce up" the map): the drawn map stays true to the corner (WEST of S 84th St,
 * SOUTH of W Center Rd), nothing live, Directions opens the store's maps link, Call dials, the status and the week come
 * from the feed's hours and today's row is marked.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORE } from '../../../data/content'
import { _setFeed, type HomeFeed, type Hours } from '../../lib/boot'
import { hoursRows } from '../../lib/hours'
import Visit, { todayRow } from './Visit'

const HOURS: Hours = { timezone: 'America/Chicago', open: '09:00', close: '18:00', closed_weekdays: [6], overrides: [] }

beforeEach(() => {
  _setFeed({ day: 'normal', hours: HOURS } as unknown as HomeFeed)
})

afterEach(() => {
  vi.useRealTimers()
  _setFeed(null)
})

const num = (el: Element, a: string) => Number(el.getAttribute(a))

describe('Visit', () => {
  it('draws the store south of W Center Rd and west of S 84th St, and loads nothing', () => {
    const { container } = render(<Visit />)
    const svg = container.querySelector('.map svg')!
    const roads = [...svg.querySelectorAll('rect.rd')]
    const center = roads.find((r) => num(r, 'width') === 358)! // the street across
    const s84 = roads.find((r) => num(r, 'height') === 196)! // the street down
    const store = svg.querySelector('rect.outline')! // the whole building
    expect(num(store, 'y')).toBeGreaterThan(num(center, 'y') + num(center, 'height'))
    expect(num(store, 'x') + num(store, 'width')).toBeLessThan(num(s84, 'x'))
    expect(svg.textContent).toContain('W CENTER RD')
    expect(svg.textContent).toContain('S 84TH ST')
    expect(svg.textContent).toContain('ECO-THRIFT')
    // Eco-Thrift is the WEST half of its building only (owner 2026-11-20): the neighbours' half is east of it.
    const texts = [...svg.querySelectorAll('text')]
    const ours = texts.find((e) => e.textContent === 'ECO-THRIFT')!
    const mega = texts.find((e) => e.textContent === 'MEGA')!
    expect(num(mega, 'x')).toBeGreaterThan(num(ours, 'x'))
    expect(num(mega, 'x')).toBeLessThan(num(store, 'x') + num(store, 'width'))
    expect(container.querySelector('img, iframe, image, script')).toBeNull()
  })

  it('says the corner in words, opens maps for Directions and dials for Call', () => {
    render(<Visit />)
    expect(screen.getByRole('heading', { name: '84th & Center' })).toBeInTheDocument()
    expect(screen.getByText('Southwest corner')).toBeInTheDocument()
    expect(screen.getByText('West half of the building, next to Mega Saver')).toBeInTheDocument()
    expect(screen.getByText('8425 W Center Rd, Omaha, NE 68124')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Directions$/ })).toHaveAttribute('href', STORE.retail.mapsPlaceUrl)
    expect(screen.getByRole('link', { name: `Call ${STORE.retail.phone}` })).toHaveAttribute('href', `tel:${STORE.retail.phoneHref}`)
  })

  it('shows open or closed from the feed and marks today in the week', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T16:00:00Z')) // a Wednesday, 10 AM in Omaha
    const { container } = render(<Visit />)
    expect(screen.getByText('Open until 6 PM')).toBeInTheDocument()
    const now = container.querySelector('.hours .now')!
    expect(now.textContent).toContain('Monday to Saturday')
    expect(now.textContent).toContain('Today')
    expect(container.querySelectorAll('.hours em')).toHaveLength(1)
  })
})

describe('todayRow', () => {
  const at = (iso: string) => new Date(iso)

  it('finds the run of weekdays that holds today, or the closed day', () => {
    const rows = hoursRows(HOURS)
    expect(todayRow(HOURS, rows, at('2026-11-16T18:00:00Z'))).toBe(0) // Monday
    expect(todayRow(HOURS, rows, at('2026-11-21T18:00:00Z'))).toBe(0) // Saturday
    expect(todayRow(HOURS, rows, at('2026-11-22T18:00:00Z'))).toBe(1) // Sunday: closed
    expect(todayRow(HOURS, rows, at('2026-11-23T03:00:00Z'))).toBe(1) // still Sunday evening in Omaha
  })

  it('a holiday that covers today wins over its weekday', () => {
    const h: Hours = { ...HOURS, overrides: [{ label: 'Thanksgiving', date_start: '2026-11-26', date_end: '2026-11-26', closed: true }] }
    const rows = hoursRows(h)
    expect(rows[todayRow(h, rows, at('2026-11-26T18:00:00Z'))][0]).toBe('Thanksgiving, Nov 26')
    expect(todayRow(h, rows, at('2026-11-27T18:00:00Z'))).toBe(0)
  })

  it('reads "and" runs and split weeks', () => {
    const h: Hours = { ...HOURS, closed_weekdays: [0, 1, 6] } // open Wednesday to Saturday
    const rows = hoursRows(h)
    expect(rows.map((r) => r[0])).toEqual(['Wednesday to Saturday', 'Monday and Tuesday', 'Sunday'])
    expect(todayRow(h, rows, at('2026-11-17T18:00:00Z'))).toBe(1) // Tuesday
    expect(todayRow(h, rows, at('2026-11-19T18:00:00Z'))).toBe(0) // Thursday
  })
})
