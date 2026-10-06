import { Link } from 'react-router-dom'
import '../../careers/careers.css'
import { useCareers, type CareerJob } from '../../careers/api'
import { useSeo } from '../../useSeo'

export function PreviewBar({ on }: { on?: boolean }) {
  if (!on) return null
  return (
    <div className="cr-preview" role="status">
      <div className="wrap">Preview: the careers page is hidden from the public until you turn it on in Dash.</div>
    </div>
  )
}

export function PracticeBar({ on, children }: { on?: boolean; children?: React.ReactNode }) {
  if (!on) return null
  return (
    <div className="cr-preview" role="status">
      <div className="wrap">
        <b>Practice run.</b>{' '}
        {children ?? 'This is a test, not a real application. It shows in Dash with a Practice tag, and its emails start with [Practice].'}
      </div>
    </div>
  )
}

export function NoOpenings() {
  return (
    <div className="wrap">
      <div className="pagehead">
        <span className="eyebrow">Careers</span>
        <h1>Work at Eco-Thrift</h1>
      </div>
      <div className="section tight">
        <div className="comingsoon" style={{ marginBottom: 60 }}>
          <h3>No openings right now</h3>
          <p>We&rsquo;re not hiring at the moment. Check back soon, or stop by the store and say hello.</p>
          <div className="hbtns" style={{ justifyContent: 'center' }}>
            <Link className="btn btn--primary" to="/visit">
              Visit the store
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function jobMeta(job: CareerJob): string {
  return [job.schedule, job.hours].filter(Boolean).join(' · ')
}

export default function CareersPage() {
  const { careers, loading } = useCareers()
  const page = careers?.page
  useSeo({
    title: 'Careers',
    description: page
      ? `${page.headline}: ${page.roles_line}. ${page.intro[0] ?? ''}`.slice(0, 300)
      : 'Work at Eco-Thrift in Omaha: retail, processing and restoration.',
    path: '/careers',
    noindex: !!careers?.preview,
  })

  if (loading) {
    return (
      <div className="wrap" aria-busy="true">
        <div className="pagehead">
          <span className="skline" style={{ width: 220 }} />
        </div>
      </div>
    )
  }
  if (!careers?.public || !page || careers.jobs.length === 0) return <NoOpenings />

  return (
    <>
      <PreviewBar on={careers.preview} />
      <section className="cr-hero">
        <div className="wrap">
          <span className="eyebrow">Careers at Eco-Thrift</span>
          <h1>{page.headline}</h1>
          <div className="cr-roles">{page.roles_line}</div>
          <div className="cr-mission">Another Chance for Everything and Everyone.</div>
          <div className="hbtns">
            <Link className="btn btn--light" to="/careers/apply">
              Apply now
            </Link>
          </div>
          {page.photo_url && (
            <div className="cr-hero-photo">
              <img src={page.photo_url} alt="The Eco-Thrift team at work in the store" />
            </div>
          )}
        </div>
      </section>

      <div className="wrap cr-body">
        <div className="cr-prose">
          {page.intro.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
        </div>

        <h2 className="cr-h2">{page.hours_line || 'Open roles'}</h2>
        <div className="cr-roles-grid">
          {careers.jobs.map((job) => (
            <article className="cr-role" key={job.slug}>
              <h3>{job.title}</h3>
              <div className="cr-tag">{job.tagline}</div>
              <p>{job.summary}</p>
              <div className="cr-meta">{jobMeta(job)}</div>
              <div className="cr-links">
                <Link className="btn btn--primary" to={`/careers/apply?role=${job.slug}`}>
                  Apply
                </Link>
                <Link className="btn btn--ghost" to={`/careers/${job.slug}`}>
                  More about it
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="cr-ask">
          <h3>What we ask</h3>
          <p>{page.what_we_ask}</p>
          {page.pay && <p className="cr-pay">{page.pay}</p>}
        </div>

        {page.growth && (
          <div className="cr-growth">
            <h3>Room to grow</h3>
            <p>{page.growth}</p>
          </div>
        )}

        <div className="cr-bottom">
          <Link className="btn btn--primary btn--xl" to="/careers/apply">
            Apply now
          </Link>
          {page.apply_note && <p>{page.apply_note}</p>}
          <p>Eco-Thrift, 8425 West Center Road, Omaha, NE 68124</p>
        </div>
      </div>
    </>
  )
}
