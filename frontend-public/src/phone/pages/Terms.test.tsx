import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NO_TEXTS, PRIVACY_NO_SHARING, SMS_NO_SHARING, THRIFT_PLUS_SIGN_IN_LINKS } from '../../data/legal'
import { THRIFT_PLUS_TERMS } from '../../data/thriftPlusTerms'
import { _setFeed, type HomeFeed } from '../lib/boot'
import Privacy from './Privacy'
import Terms, { sectionFromHash, siteLink } from './Terms'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function renderAt(url: string, el = <Terms />) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/terms" element={el} />
        <Route path="/privacy" element={el} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Every word the data file holds for a language, clause by clause. */
function allWords(lang: 'en' | 'es'): string[] {
  const t = THRIFT_PLUS_TERMS[lang]
  const out: string[] = [t.hero.title, t.hero.tagline, t.needToKnowTitle, t.chartTitle, t.faqTitle, t.fullTitle]
  for (const k of t.needToKnow) out.push(k.label, k.text)
  for (const r of t.chart) out.push(r.num, r.what, r.short)
  for (const f of t.faq) out.push(f.q, f.a)
  for (const p of t.perks) out.push(p.label, p.text)
  out.push(t.fullIntro.label, t.fullIntro.text, t.fullIntro.version)
  for (const s of t.sections) {
    out.push(s.title)
    for (const c of s.clauses) {
      if (c.n) out.push(c.n)
      if (c.label) out.push(c.label)
      if (c.text) out.push(c.text)
      for (const step of c.steps ?? []) out.push(step)
      for (const p of c.points ?? []) out.push(p.label, p.text)
    }
  }
  if (t.courtesyNote) out.push(t.courtesyNote)
  return out
}

beforeEach(() => {
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
  _setFeed({ thrift_plus_open: true } as unknown as HomeFeed)
})

describe('Terms', () => {
  it('reads anchors from the hash: #s1 to #s12 and #store-terms, nothing else', () => {
    expect(sectionFromHash('#s8')).toBe('s8')
    expect(sectionFromHash('#s12')).toBe('s12')
    expect(sectionFromHash('#store-terms')).toBe('store-terms')
    expect(sectionFromHash('#s13')).toBe('')
    expect(sectionFromHash('#es')).toBe('')
    expect(siteLink('/join')).toBe('/scan?view=join')
    expect(siteLink(undefined)).toBe('/')
  })

  it('renders every English word of the data file, every section anchor and the contents list', () => {
    const { container } = renderAt('/terms?lang=en')
    const text = container.textContent || ''
    for (const w of allWords('en')) expect(text, w).toContain(w)
    for (let n = 1; n <= 12; n += 1) {
      expect(container.querySelector(`#s${n}`), `#s${n}`).not.toBeNull()
      expect(container.querySelector(`.lg-toc a[href="#s${n}"]`), `chip ${n}`).not.toBeNull()
    }
    expect(container.querySelector('#store-terms')).not.toBeNull()
    expect(screen.getByTestId('terms-no-texts').textContent).toBe(NO_TEXTS)
    expect(container.querySelector('a[href^="tel:"], a[href^="mailto:"]')).toBeNull()
  })

  it('starts in Spanish from ?lang=es with every Spanish word, and the toggle switches and is remembered', () => {
    const { container } = renderAt('/terms?lang=es')
    const text = container.textContent || ''
    for (const w of allWords('es')) expect(text, w).toContain(w)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.textContent).toContain(THRIFT_PLUS_TERMS.en.sections[7].title)
    expect(window.localStorage.getItem('ecothrift.terms.lang')).toBe('en')
  })

  it('is calm: nothing opens or closes, the FAQ answers are on the page at rest, the chart rows do nothing', () => {
    const { container } = renderAt('/terms#s8')
    expect(container.querySelector('details, summary')).toBeNull()
    for (const f of THRIFT_PLUS_TERMS.en.faq) {
      const q = screen.getByRole('heading', { name: f.q })
      expect(q.nextElementSibling?.textContent).toBe(f.a)
      expect(q.nextElementSibling).toBeVisible()
    }
    expect(container.querySelectorAll('.lg-cr')).toHaveLength(THRIFT_PLUS_TERMS.en.chart.length)
    expect(container.querySelector('.lg-chart a')).toBeNull()
    expect(container.querySelector('.is-target')).toBeNull()
    expect(container.querySelector('.rail')).toBeNull()
  })

  it('keeps every anchor id and a plain contents link to each, in both languages', () => {
    for (const lang of ['en', 'es']) {
      const { container, unmount } = renderAt(`/terms?lang=${lang}`)
      for (const id of [...Array.from({ length: 12 }, (_, i) => `s${i + 1}`), 'store-terms']) {
        expect(container.querySelector(`#${id}`), id).not.toBeNull()
        expect(container.querySelector(`.lg-toc a[href="#${id}"]`), `contents ${id}`).not.toBeNull()
      }
      unmount()
    }
  })

  it('keeps the store terms word for word with the current site page (the sentences the Django test pins)', () => {
    const mine = fs.readFileSync(path.join(HERE, 'Terms.tsx'), 'utf8')
    for (const needed of ['{NO_TEXTS}', 'unsubscribe link', 'Giving an email is optional', 'never a condition of purchase',
      'honor it', 'to="/privacy"', 'own toll-free number', 'reply STOP to any text', 'Message and data rates may apply',
      'Texts are optional']) {
      expect(mine, needed).toContain(needed)
    }
  })
})

describe('Privacy', () => {
  it('carries the legal lines from data/legal.ts', () => {
    const { container } = renderAt('/privacy', <Privacy />)
    expect(screen.getByTestId('privacy-no-sharing').textContent).toBe(PRIVACY_NO_SHARING)
    expect(screen.getByTestId('privacy-sms-no-sharing').textContent).toBe(SMS_NO_SHARING)
    expect(screen.getByTestId('privacy-no-texts').textContent).toContain(NO_TEXTS)
    expect(container.textContent).toContain(THRIFT_PLUS_SIGN_IN_LINKS)
    expect(container.textContent).toContain('Reply STOP to any text and we send no more; reply HELP for help.')
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull()
  })
})
