import { Link, useParams } from 'react-router-dom'
import '../../careers/careers.css'
import { useCareers, type CareerJob } from '../../careers/api'
import { SITE_URL } from '../../data/content'
import { useJsonLd, useSeo } from '../../useSeo'
import { jobMeta, NoOpenings, PreviewBar } from './CareersPage'

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Google Jobs reads this (schema.org JobPosting). Pay shows only the floor; the top is never public. */
function jobPosting(job: CareerJob) {
  const description =
    `<p>${escapeHtml(job.summary)}</p>` +
    (job.duties.length ? `<ul>${job.duties.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : '') +
    (job.schedule ? `<p>${escapeHtml(job.schedule)}. ${escapeHtml(job.hours)}.</p>` : '')
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description,
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
            <p>{job.summary}</p>
            {job.duties.length > 0 && (
              <>
                <h2 className="cr-h2">What you&rsquo;ll do</h2>
                <ul>
                  {job.duties.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
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
              <dd>8425 West Center Road, Omaha</dd>
            </dl>
            <Link className="btn btn--primary btn--wide" style={{ width: '100%' }} to={`/careers/apply?role=${job.slug}`}>
              Apply for {job.title}
            </Link>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>{jobMeta(job)}</p>
          </aside>
        </div>
      </div>
    </>
  )
}
