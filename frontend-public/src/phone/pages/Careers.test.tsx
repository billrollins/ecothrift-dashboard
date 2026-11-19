import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CareerJob, Careers } from '../../careers/api'
import { partOfDay } from './careers/Picker'

function job(slug: string, title: string): CareerJob {
  return {
    slug, title, tagline: `${title} line.`, summary: 'About it.', duties: ['Do a thing'], success: [], looking_for: [],
    nice_to_have: [], physical: [], works_with: '', schedule: 'Flexible', hours: 'Up to 40', employment_type: 'part_time',
    pay_min: '15', pay_text: 'From $15/hr', questions: [], updated_at: '2026-11-01',
  }
}

const PAGE = {
  headline: 'Now hiring', roles_line: 'Retail', intro: ['Small team.'], hours_line: '', pay: 'Pay is based on skill.',
  what_we_ask: 'Give 100%.', apply_note: 'It takes about 5 minutes.', growth: 'Room to grow.', photo_url: '',
}
const OPEN: Careers = { public: true, preview: false, page: PAGE, questions: [], jobs: [job('retail', 'Retail'), job('processing', 'Processing')] }

type Call = { url: string; method: string; body?: unknown }
let calls: Call[] = []
let route: (url: string, method: string, body: unknown) => [number, unknown]

beforeEach(() => {
  calls = []
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
      calls.push({ url, method, body })
      const [status, data] = route(url, method, body)
      return new Response(JSON.stringify(data), { status })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

async function show(page: 'Careers' | 'CareerRole' | 'CareersInterview' | 'CareersOffer', url: string, path: string) {
  vi.resetModules() // a fresh careers cache (src/careers/api.ts keeps one per page load)
  const load = {
    Careers: () => import('./Careers'),
    CareerRole: () => import('./CareerRole'),
    CareersInterview: () => import('./CareersInterview'),
    CareersOffer: () => import('./CareersOffer'),
  }[page]
  const { default: Page } = await load()
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={path} element={<Page />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('careers list and role pages', () => {
  it('lists the open roles from GET careers/, each opening its page, and Apply', async () => {
    route = () => [200, OPEN]
    await show('Careers', '/careers', '/careers')
    expect(await screen.findByRole('link', { name: /Retail/ })).toHaveAttribute('href', '/careers/retail')
    expect(screen.getByText('2 open roles · Omaha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Apply' })).toHaveAttribute('href', '/careers/apply')
    expect(calls[0].url).toBe('/api/hiring/public/careers/')
  })

  it('not public: No openings; a preview key rides along and shows the preview bar', async () => {
    route = () => [200, { public: false, jobs: [] }]
    await show('Careers', '/careers', '/careers')
    await screen.findByText(/not hiring at the moment/)

    sessionStorage.clear()
    route = () => [200, { ...OPEN, preview: true }]
    window.history.replaceState(null, '', '/careers?preview=k1')
    await show('Careers', '/careers', '/careers')
    await screen.findByText(/hidden from the public/)
    expect(calls.at(-1)!.url).toBe('/api/hiring/public/careers/?preview=k1')
    expect(sessionStorage.getItem('ecothrift.careers.preview')).toBe('k1')
    window.history.replaceState(null, '', '/')
    sessionStorage.clear()
  })

  it('a role page shows its facts and applies with the role; an unknown slug shows No openings', async () => {
    route = () => [200, OPEN]
    await show('CareerRole', '/careers/retail', '/careers/:slug')
    expect(await screen.findByRole('link', { name: 'Apply for Retail' })).toHaveAttribute('href', '/careers/apply?role=retail')
    expect(screen.getByText('From $15/hr')).toBeInTheDocument()
    expect(document.head.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"JobPosting"')

    await show('CareerRole', '/careers/nope', '/careers/:slug')
    await screen.findAllByText(/not hiring at the moment/)
  })
})

const TIMES = [
  { start: '2026-11-23T10:00:00-06:00', end: '', day: '', date: '2026-11-23', label: '10:00 AM' },
  { start: '2026-11-23T14:00:00-06:00', end: '', day: '', date: '2026-11-23', label: '2:00 PM' },
]
const IV = { ok: true, first_name: 'Ana', roles: ['Retail'], length_minutes: 30, place: 'the store', interview: null, times: TIMES }
const BOOKED = { ...IV, interview: { start: TIMES[0].start, end: '', when: 'Monday at 10:00 AM', interviewer: 'Bill', place: 'the store' } }

describe('interview page', () => {
  it('books a time with the same POST', async () => {
    route = (url, method) => [200, method === 'POST' ? BOOKED : IV]
    await show('CareersInterview', '/careers/interview?t=tok', '/careers/interview')
    fireEvent.click(await screen.findByRole('button', { name: /Monday, November 23, 2 times/ }))
    fireEvent.click(screen.getByRole('button', { name: '2:00 PM' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Book Mon, Nov 23 at 2:00 PM/ })))
    await screen.findByText("You're set, Ana")
    expect(calls.at(-1)).toMatchObject({ url: '/api/hiring/public/interview/', method: 'POST', body: { t: 'tok', start: TIMES[1].start } })
  })

  it('asks in place before it cancels, then calls cancel/', async () => {
    route = (url) => [200, url.includes('cancel') ? IV : BOOKED]
    await show('CareersInterview', '/careers/interview?t=tok', '/careers/interview')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel interview' }))
    expect(calls.some((c) => c.url.includes('cancel'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel interview' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })))
    await screen.findByText('Pick a time, Ana')
    expect(calls.at(-1)).toMatchObject({ url: '/api/hiring/public/interview/cancel/', method: 'POST', body: { t: 'tok' } })
  })

  it('no token or a dead link says so', async () => {
    route = () => [404, { ok: false, detail: 'This interview link has expired.' }]
    await show('CareersInterview', '/careers/interview?t=old', '/careers/interview')
    await screen.findByText('This interview link has expired.')
    await show('CareersInterview', '/careers/interview', '/careers/interview')
    await screen.findByText('This page needs the link from your email.')
  })

  it('groups times by part of day', () => {
    expect([partOfDay('10:00 AM'), partOfDay('12:30 PM'), partOfDay('5:00 PM'), partOfDay('12:00 AM')]).toEqual([
      'Morning', 'Afternoon', 'Evening', 'Morning',
    ])
  })
})

const OFFER = {
  ok: true, status: 'sent', first_name: 'Ana', full_name: 'Ana Lopez', position: 'Retail', pay_rate: '15.00',
  start: 'Monday at 9:00 AM', respond_by: 'Friday', letter: 'Dear Ana,\n\n- Pay: $15\n- Start: Monday',
  acknowledgments: ['I can get there.', 'Pay is fine.'], consent: 'I agree to sign electronically.', has_pdf: true, texts: null,
}

describe('offer page', () => {
  it('signing checks the ticks, the name and the signature before it calls', async () => {
    route = () => [200, OFFER]
    await show('CareersOffer', '/careers/offer?t=tok', '/careers/offer')
    fireEvent.click(await screen.findByRole('button', { name: 'Sign and accept the offer' }))
    expect(screen.getByText('Tick each statement to accept.')).toBeInTheDocument()
    expect(screen.getByText('Tick the box to sign electronically.')).toBeInTheDocument()
    expect(screen.getByText('Sign in the box with your finger.')).toBeInTheDocument()
    expect(screen.getByLabelText('Your full legal name')).toHaveValue('Ana Lopez')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect(screen.getByText('Pay: $15')).toBeInTheDocument()
  })

  it('declines with the reason through decline/', async () => {
    route = (url) => [200, url.includes('decline') ? { ...OFFER, status: 'declined' } : OFFER]
    await show('CareersOffer', '/careers/offer?t=tok', '/careers/offer')
    fireEvent.click(await screen.findByRole('button', { name: 'I can’t accept this offer' }))
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: ' Took another job ' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Decline the offer' })))
    await screen.findByText('Thanks for letting us know')
    expect(calls.at(-1)).toMatchObject({ url: '/api/hiring/public/offer/decline/', body: { t: 'tok', reason: 'Took another job' } })
  })

  it('signed shows the PDF link; expired says so', async () => {
    route = () => [200, { ...OFFER, status: 'signed' }]
    await show('CareersOffer', '/careers/offer?t=a%20b', '/careers/offer')
    expect(await screen.findByRole('link', { name: 'Download your signed copy' })).toHaveAttribute(
      'href', '/api/hiring/public/offer/pdf/?t=a%20b',
    )
    route = () => [200, { ...OFFER, status: 'expired' }]
    await show('CareersOffer', '/careers/offer?t=tok', '/careers/offer')
    await waitFor(() => expect(screen.getByText('This offer has expired')).toBeInTheDocument())
  })
})
