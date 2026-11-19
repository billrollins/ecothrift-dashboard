/**
 * Shared pieces of the careers pages (W4): the preview and practice bars, "not hiring", the back row, the quiet
 * loading block, and the Google Jobs posting (the live role page's, copied: importing that page would pull in the
 * current site's careers.css).
 */
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CareerJob } from '../../../careers/api'
import { SITE_URL } from '../../../data/content'

export function PreviewBar({ on }: { on?: boolean }) {
  if (!on) return null
  return (
    <div className="cr-bar" role="status">
      Preview: the careers page is hidden from the public until you turn it on in Dash.
    </div>
  )
}

export function PracticeBar({ on, children }: { on?: boolean; children?: ReactNode }) {
  if (!on) return null
  return (
    <div className="cr-bar" role="status">
      <b>Practice run.</b>{' '}
      {children ?? 'This is a test, not a real application. It shows in Dash with a Practice tag, and its emails start with [Practice].'}
    </div>
  )
}

/** Back one page when this visit came from inside the site, else to `fallback`. */
export function BackRow({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  const navigate = useNavigate()
  const inside = typeof window !== 'undefined' && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  return (
    <div className="cr-back">
      <button className="backrow" type="button" onClick={() => (inside ? navigate(-1) : navigate(fallback))}>
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {label}
      </button>
    </div>
  )
}

/** While the careers file is on its way: the hero's own size, so nothing jumps when it lands. */
export function Loading() {
  return (
    <div aria-busy="true">
      <div className="cr-back" />
      <section className="cr-hero cr-wait" />
    </div>
  )
}

export function NoOpenings() {
  return (
    <>
      <BackRow fallback="/" />
      <section className="cr-hero">
        <div className="lbl">Careers at Eco-Thrift</div>
        <h1 className="disp cr-h1">
          No openings <span>right now</span>
        </h1>
        <p className="cr-sub">We&rsquo;re not hiring at the moment. Check back soon, or stop by the store and say hello.</p>
      </section>
      <section className="cr-band cr-lime">
        <Link className="btn btn-ink cr-wide" to="/#visit">
          Visit the store
        </Link>
      </section>
    </>
  )
}

/** The page's green headline: the last word in lime ("Now hiring" -> NOW / HIRING). */
export function Headline({ text, className = 'cr-h1' }: { text: string; className?: string }) {
  const words = text.trim().split(/\s+/)
  const last = words.pop() ?? ''
  return (
    <h1 className={`disp ${className}`}>
      {words.join(' ')} <span>{last}</span>
    </h1>
  )
}

export const TYPE_LABEL: Record<CareerJob['employment_type'], string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  full_or_part: 'Full or part time',
}

const SCHEMA_TYPE: Record<CareerJob['employment_type'], string[]> = {
  full_time: ['FULL_TIME'],
  part_time: ['PART_TIME'],
  full_or_part: ['FULL_TIME', 'PART_TIME'],
}

export function jobMeta(job: CareerJob): string {
  return [job.schedule, job.hours].filter(Boolean).join(' · ')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function htmlList(heading: string, items: string[]): string {
  if (!items.length) return ''
  return `<p><strong>${escapeHtml(heading)}</strong></p><ul>${items.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
}

/** Google Jobs reads this (schema.org JobPosting). Pay shows only the floor; the top is never public. */
export function jobPosting(job: CareerJob) {
  const description =
    `<p>${escapeHtml(job.summary)}</p>` +
    htmlList("What you'll do", job.duties) +
    htmlList('What great looks like', job.success) +
    htmlList("What we're looking for", job.looking_for) +
    htmlList('Nice to have', job.nice_to_have) +
    htmlList('The physical side', job.physical) +
    (job.works_with ? `<p>You'll work with ${escapeHtml(job.works_with)}.</p>` : '') +
    (job.schedule ? `<p>${escapeHtml(job.schedule)}. ${escapeHtml(job.hours)}.</p>` : '')
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description,
    responsibilities: job.duties.join('; '),
    qualifications: job.looking_for.join('; '),
    skills: job.nice_to_have.join('; '),
    physicalRequirement: job.physical.join('; '),
    datePosted: (job.updated_at || '').slice(0, 10),
    employmentType: SCHEMA_TYPE[job.employment_type],
    directApply: true,
    url: `${SITE_URL}/careers/${job.slug}`,
    hiringOrganization: { '@type': 'Organization', name: 'Eco-Thrift', sameAs: SITE_URL },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '8425 West Center Road',
        addressLocality: 'Omaha',
        addressRegion: 'NE',
        postalCode: '68124',
        addressCountry: 'US',
      },
    },
  }
  if (job.pay_min) {
    posting.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: { '@type': 'QuantitativeValue', minValue: Number(job.pay_min), unitText: 'HOUR' },
    }
  }
  return posting
}

/** A role's picture in the list: a register for retail, a tag for processing, a wrench for restoration. */
export function RoleIcon({ slug }: { slug: string }) {
  const s = slug.toLowerCase()
  const d = s.includes('retail') || s.includes('cashier')
    ? 'M3 10h18v10H3zM6 10V5h8v5M7 14h2M11 14h2M15 14h2'
    : s.includes('restor') || s.includes('repair')
      ? 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z'
      : 'M3 12V4h8l9 9-8 8zM7.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
