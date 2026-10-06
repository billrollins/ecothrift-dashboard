import { Link, useParams } from 'react-router-dom'
import '../../careers/careers.css'
import { useCareers, type CareerJob } from '../../careers/api'
import { SITE_URL } from '../../data/content'
import { useJsonLd, useSeo } from '../../useSeo'
import { NoOpenings, PreviewBar } from './CareersPage'

const TYPE_LABEL: Record<CareerJob['employment_type'], string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  full_or_part: 'Full or part time',
}

const SCHEMA_TYPE: Record<CareerJob['employment_type'], string[]> = {
  full_time: ['FULL_TIME'],
  part_time: ['PART_TIME'],
  full_or_part: ['FULL_TIME', 'PART_TIME'],
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <>
      <h2 className="cr-h2">{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Google Jobs reads this (schema.org JobPosting). Pay shows only the floor; the top is never public. */
function htmlList(heading: string, items: string[]): string {
  if (!items.length) return ''
  return `<p><strong>${escapeHtml(heading)}</strong></p><ul>${items.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
}

function jobPosting(job: CareerJob) {
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

export default function CareerRolePage() {
  const { slug = '' } = useParams()
  const { careers, loading } = useCareers()
  const job = careers?.jobs.find((j) => j.slug === slug)
  useSeo({
    title: job ? `${job.title} - Careers` : 'Careers',
    description: job ? `${job.title} at Eco-Thrift in Omaha. ${job.tagline} ${job.summary}`.slice(0, 300) : undefined,
    path: `/careers/${slug}`,
    noindex: !!careers?.preview || (!loading && !job),
  })
  useJsonLd(job && !careers?.preview ? jobPosting(job) : null)

  if (loading) {
    return (
      <div className="wrap" aria-busy="true">
        <div className="pagehead">
          <span className="skline" style={{ width: 220 }} />
        </div>
      </div>
    )
  }
  if (!careers?.public || !job) return <NoOpenings />

  return (
    <>
      <PreviewBar on={careers.preview} />
      <div className="wrap">
        <div className="pagehead">
          <Link className="eyebrow" to="/careers">
            ← All roles
          </Link>
          <h1>{job.title}</h1>
          <p className="lead">{job.tagline}</p>
        </div>
        <div className="cr-detail">
          <div className="cr-prose">
            <h2 className="cr-h2 cr-first">About the role</h2>
            <p>{job.summary}</p>
            <Section title="What you’ll do" items={job.duties} />
            <Section title="What great looks like" items={job.success} />
            <Section title="What we’re looking for" items={job.looking_for} />
            <Section title="Nice to have" items={job.nice_to_have} />
            <Section title="The physical side" items={job.physical} />
            {careers.page?.growth && (
              <>
                <h2 className="cr-h2">Room to grow</h2>
                <p>{careers.page.growth}</p>
              </>
            )}
            {careers.page?.what_we_ask && (
              <>
                <h2 className="cr-h2">What we ask</h2>
                <p>{careers.page.what_we_ask}</p>
              </>
            )}
            {careers.page?.pay && <p className="cr-pay">{careers.page.pay}</p>}
          </div>
          <aside className="cr-side">
            <dl>
              {job.schedule && (
                <>
                  <dt>When</dt>
                  <dd>{job.schedule}</dd>
                </>
              )}
              {job.hours && (
                <>
                  <dt>Hours</dt>
                  <dd>{job.hours}</dd>
                </>
              )}
              <dt>Type</dt>
              <dd>{TYPE_LABEL[job.employment_type]}</dd>
              {job.pay_text && (
                <>
                  <dt>Pay</dt>
                  <dd>{job.pay_text}</dd>
                </>
              )}
              <dt>Where</dt>
              <dd>Our Canfield store, 8425 West Center Road, Omaha</dd>
              {job.works_with && (
                <>
                  <dt>With</dt>
                  <dd>{job.works_with}</dd>
                </>
              )}
            </dl>
            <Link className="btn btn--primary btn--wide" style={{ width: '100%' }} to={`/careers/apply?role=${job.slug}`}>
              Apply for {job.title}
            </Link>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
              About 5 minutes. A resume is optional.
            </p>
          </aside>
        </div>
      </div>
    </>
  )
}
