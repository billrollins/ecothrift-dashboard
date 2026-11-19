import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CareerJob, Careers, Question } from '../../careers/api'
import {
  DRAFT_KEY,
  buildForm,
  buildSteps,
  checkStep,
  firstErrorStep,
  loadDraft,
  packQuestions,
  saveDraft,
} from './careers/steps'

// apps/hiring/careers.py DEFAULT_QUESTIONS (types, required, after_roles), as the careers file serves them.
const DEFAULTS: Question[] = [
  { key: 'hours_per_week', label: 'How many hours a week do you want?', type: 'number', required: true, help: 'Up to 40.' },
  { key: 'days', label: 'Which days can you work?', type: 'multi', required: true, options: ['Monday', 'Tuesday'] },
  { key: 'earliest_start', label: 'Earliest start', type: 'time', required: false },
  { key: 'latest_finish', label: 'Latest finish', type: 'time', required: false },
  { key: 'start_date', label: 'When can you start?', type: 'text', required: true },
  { key: 'transportation', label: 'Transportation?', type: 'yes_no', required: true, must_be: 'yes' },
  { key: 'lifting', label: 'Lift 50 lbs?', type: 'yes_no', required: true, must_be: 'yes' },
  { key: 'age_18', label: 'Are you 18 or older?', type: 'yes_no', required: true, must_be: 'yes' },
  { key: 'work_authorized', label: 'Authorized?', type: 'yes_no', required: true, must_be: 'yes' },
  { key: 'pay_wanted', label: 'What hourly pay are you looking for?', type: 'text', required: true },
  { key: 'why_us', label: 'Why Eco-Thrift?', type: 'long_text', required: true },
  { key: 'proactive', label: 'Tell us about a time', type: 'long_text', required: true },
  { key: 'lead_interest', label: 'Lead your area?', type: 'choice', required: false, options: ['Yes', 'Maybe'] },
  { key: 'led_before', label: 'Led a team?', type: 'long_text', required: false },
  { key: 'heard_about', label: 'How did you hear about us?', type: 'choice', required: false, options: ['Facebook', 'Other'], after_roles: true },
]

function job(slug: string, title: string, questions: Question[] = []): CareerJob {
  return {
    slug, title, tagline: 'A line.', summary: 'About it.', duties: [], success: [], looking_for: [], nice_to_have: [],
    physical: [], works_with: '', schedule: '', hours: '', employment_type: 'part_time', pay_min: null, pay_text: '',
    questions, updated_at: '2026-11-01',
  }
}

const RETAIL = job('retail', 'Retail', [{ key: 'experience', label: 'Register experience?', type: 'long_text', required: true }])
const PROC = job('processing', 'Processing', [{ key: 'careful', label: 'Careful and fast?', type: 'long_text', required: true }])
const FULL: Careers = { public: true, questions: DEFAULTS, jobs: [RETAIL, PROC], sms_consent_text: '' }

const contact = { first_name: 'Ana', last_name: 'Lopez', phone: '402 555 1234', email: 'ana@example.com' }

describe('careers steps: the live form as screens', () => {
  it('packs the shared questions one or two a screen, yes/no with yes/no, a long answer alone', () => {
    const screens = packQuestions(DEFAULTS.filter((q) => !q.after_roles).map((q) => ({ key: q.key, q })))
    expect(screens.map((s) => s.map((i) => i.key))).toEqual([
      ['hours_per_week', 'days'],
      ['earliest_start', 'latest_finish'],
      ['start_date'],
      ['transportation', 'lifting'],
      ['age_18', 'work_authorized'],
      ['pay_wanted'],
      ['why_us'],
      ['proactive'],
      ['lead_interest', 'led_before'],
    ])
  })

  it('keeps every question: shared, then each picked role’s own, then resume with the after-roles one, then review', () => {
    const steps = buildSteps(FULL, ['retail'])
    expect(steps.map((s) => s.kind)).toEqual([
      'roles', 'name', 'contact', ...Array(9).fill('questions'), 'questions', 'resume', 'review',
    ])
    const keys = steps.flatMap((s) => ('items' in s ? s.items.map((i) => i.key) : []))
    expect(keys).toEqual([...DEFAULTS.filter((q) => !q.after_roles).map((q) => q.key), 'retail.experience', 'heard_about'])
    // a second role adds its own questions; none picked, none shown
    expect(buildSteps(FULL, ['retail', 'processing']).length).toBe(steps.length + 1)
    expect(buildSteps(FULL, []).length).toBe(steps.length - 1)
  })

  it('checks a screen with the live rules and only shows that screen’s errors', () => {
    const steps = buildSteps(FULL, ['retail'])
    const empty = { contact: { first_name: '', last_name: '', phone: '123', email: 'nope' }, roles: [], answers: {} }
    expect(checkStep(FULL, steps[0], empty)).toEqual({ roles: 'Pick at least one role.' })
    expect(checkStep(FULL, steps[1], empty)).toEqual({ first_name: 'Required.', last_name: 'Required.' })
    expect(checkStep(FULL, steps[2], empty)).toEqual({ phone: 'Enter a phone number with area code.', email: 'Enter an email address.' })
    // optional times pass blank; the role's own required question is required
    expect(checkStep(FULL, steps[4], empty)).toEqual({})
    const roleStep = steps.findIndex((s) => s.kind === 'questions' && s.job)
    expect(checkStep(FULL, steps[roleStep], { ...empty, roles: ['retail'] })).toEqual({ 'answers.retail.experience': 'Required.' })
  })

  it('sends a server error to the screen it belongs to', () => {
    const steps = buildSteps(FULL, ['retail'])
    expect(firstErrorStep(steps, { 'answers.why_us': 'Required.', phone: 'x' })).toBe(2)
    expect(steps[firstErrorStep(steps, { 'answers.why_us': 'Required.' })]).toMatchObject({ id: 'q:why_us' })
    expect(steps[firstErrorStep(steps, { resume: 'Too big.' })].kind).toBe('resume')
    expect(steps[firstErrorStep(steps, { other: 'x' })].kind).toBe('review')
  })

  it('builds the same request as the live form', () => {
    const data = buildForm(FULL, {
      contact: { ...contact, first_name: ' Ana ' },
      roles: ['retail'],
      answers: { days: ['Monday'], transportation: 'yes', earliest_start: '', 'retail.experience': 'Two years', 'processing.careful': 'no' },
      smsConsent: false,
      website: '',
      startedAt: 1234,
    })
    expect([...data.keys()]).toEqual([
      'first_name', 'last_name', 'phone', 'email', 'roles', 'answers', 'sms_consent', 'website', 'started_at',
    ])
    expect(data.get('first_name')).toBe('Ana')
    expect(data.getAll('roles')).toEqual(['retail'])
    // only answered questions, and only the picked roles' own
    expect(JSON.parse(String(data.get('answers')))).toEqual({ days: ['Monday'], transportation: 'yes', 'retail.experience': 'Two years' })
    expect(data.get('sms_consent')).toBe('false')
    expect(data.get('website')).toBe('')
    expect(data.get('started_at')).toBe('1234')
  })

  it('keeps a draft for the tab and survives junk in it', () => {
    sessionStorage.clear()
    expect(loadDraft()).toBeNull()
    saveDraft({ contact, roles: ['retail'], answers: { days: ['Monday'] }, smsConsent: true, startedAt: 99, resumeName: 'me.pdf' })
    expect(loadDraft()).toEqual({ contact, roles: ['retail'], answers: { days: ['Monday'] }, smsConsent: true, startedAt: 99, resumeName: 'me.pdf' })
    sessionStorage.setItem(DRAFT_KEY, '{"contact":{"first_name":3},"answers":{"a":1,"b":"ok"},"roles":"x"}')
    const d = loadDraft()!
    expect(d.contact.first_name).toBe('')
    expect(d.answers).toEqual({ b: 'ok' })
    expect(d.roles).toEqual([])
    sessionStorage.setItem(DRAFT_KEY, 'not json')
    expect(loadDraft()).toBeNull()
  })
})

// ── The page, with the careers calls mocked ────────────────────────────────────────────────────────────────────

const SMALL: Careers = {
  public: true,
  preview: false,
  practice: false,
  page: { headline: 'Now hiring', roles_line: '', intro: [], hours_line: '', pay: '', what_we_ask: '', apply_note: '', growth: '', photo_url: '' },
  questions: [
    { key: 'age_18', label: 'Are you 18 or older?', type: 'yes_no', required: true, must_be: 'yes' },
    { key: 'heard_about', label: 'How did you hear about us?', type: 'choice', required: false, options: ['Facebook', 'Other'], after_roles: true },
  ],
  sms_consent_text: '',
  jobs: [job('retail', 'Retail')],
}

type Call = { url: string; body?: BodyInit | null }
let calls: Call[] = []
let applyReply: () => Response

function mockFetch(careers: Careers) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body })
      if (url.startsWith('/api/hiring/public/careers/')) return new Response(JSON.stringify(careers), { status: 200 })
      if (url === '/api/hiring/public/apply/') return applyReply()
      return new Response('{}', { status: 404 })
    }),
  )
}

async function renderApply(url = '/careers/apply?role=retail') {
  vi.resetModules()
  const { default: CareersApply } = await import('./CareersApply')
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/careers/apply" element={<CareersApply />} />
      </Routes>
    </MemoryRouter>,
  )
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|Review|Send)$/ }))
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('careers apply page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
    Element.prototype.scrollIntoView = vi.fn()
    applyReply = () => new Response(JSON.stringify({ ok: true, first_name: 'Ana' }), { status: 201 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function fillToReview() {
    await screen.findByText('Which role?')
    expect(screen.getByRole('button', { name: /Retail/ })).toHaveAttribute('aria-pressed', 'true') // ?role= picked it
    next()
    await screen.findByText('Your name')
    next() // nothing typed: the step says so and stays
    expect(screen.getAllByText('Required.')).toHaveLength(2)
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument()
    type('First name', 'Ana')
    type('Last name', 'Lopez')
    next()
    await screen.findByText('How we reach you')
    type('Mobile phone', '402-555-1234')
    type('Email', 'ana@example.com')
    next()
    await screen.findByText('Are you 18 or older?')
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    next()
    await screen.findByRole('heading', { name: /^Resume/ })
    fireEvent.click(screen.getByRole('radio', { name: 'Facebook' }))
    next()
    await screen.findByText('Check and send')
  }

  it('walks the steps, checks each one, reviews, and sends the one request', async () => {
    mockFetch(SMALL)
    await renderApply()
    await fillToReview()
    expect(screen.getByText('Ana Lopez')).toBeInTheDocument()
    // the honeypot is on the page, hidden from people
    expect(document.querySelector('.cr-hp input')).toHaveValue('')
    await act(async () => next())
    await screen.findByText('Application sent')
    const sent = calls.find((c) => c.url === '/api/hiring/public/apply/')!
    const form = sent.body as FormData
    expect(form.getAll('roles')).toEqual(['retail'])
    expect(JSON.parse(String(form.get('answers')))).toEqual({ age_18: 'yes', heard_about: 'Facebook' })
    expect(form.get('website')).toBe('')
    expect(Number(form.get('started_at'))).toBeGreaterThan(0)
    expect(form.has('preview')).toBe(false)
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull() // sent: nothing kept
  })

  it('shows a server error on the step it belongs to', async () => {
    mockFetch(SMALL)
    applyReply = () =>
      new Response(JSON.stringify({ detail: 'Please fix the marked fields.', errors: { email: 'Enter an email address.' } }), { status: 400 })
    await renderApply()
    await fillToReview()
    await act(async () => next())
    await screen.findByText('How we reach you')
    expect(screen.getByText('Enter an email address.')).toBeInTheDocument()
    expect(screen.getByText('Please fix the marked fields.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('keeps the answers when the tab reloads', async () => {
    mockFetch(SMALL)
    const first = await renderApply()
    await screen.findByText('Which role?')
    next()
    await screen.findByText('Your name')
    type('First name', 'Ana')
    first.unmount()
    mockFetch(SMALL)
    await renderApply('/careers/apply?step=2')
    await screen.findByText('Your name')
    expect(screen.getByLabelText('First name')).toHaveValue('Ana')
  })

  it('a practice link skips the checks, as live, and says where it went', async () => {
    mockFetch({ ...SMALL, practice: true })
    await renderApply('/careers/apply')
    await screen.findByText('Which role?')
    expect(screen.getByText('Practice run.')).toBeInTheDocument()
    for (let i = 0; i < 5; i++) next()
    await screen.findByText('Check and send')
    await act(async () => next())
    await waitFor(() => expect(screen.getByText('Practice application sent')).toBeInTheDocument())
  })

  it('not public, or no open role: No openings', async () => {
    mockFetch({ public: false, jobs: [] })
    await renderApply()
    await screen.findByText(/not hiring at the moment/)
  })
})
