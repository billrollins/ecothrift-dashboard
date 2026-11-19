/**
 * One role (W4): `/careers/<slug>`. Same data and rules as the live role page (src/pages/careers/CareerRolePage.tsx):
 * a slug that is not an open role (or careers off) shows "No openings"; the Google Jobs posting rides along unless it
 * is a preview. Apply sits in a bar that never moves and opens the steps with this role picked.
 */
import { Link, useParams } from 'react-router-dom'
import { useCareers } from '../../careers/api'
import { useJsonLd, useSeo } from '../../useSeo'
import { BackRow, Loading, NoOpenings, PreviewBar, TYPE_LABEL, jobPosting } from './careers/parts'
import './careers.css'

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div className="cr-sec">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function CareerRole() {
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

  if (loading) return <Loading />
  if (!careers?.public || !job) return <NoOpenings />
  const page = careers.page

  const facts: Array<[string, string]> = [
    ['When', job.schedule],
    ['Hours', job.hours],
    ['Type', TYPE_LABEL[job.employment_type]],
    ['Pay', job.pay_text],
    ['Where', 'Our Canfield store, 8425 West Center Road, Omaha'],
    ['With', job.works_with],
  ]

  return (
    <div className="cr-has-nav">
      <PreviewBar on={careers.preview} />
      <BackRow fallback="/careers" label="All roles" />
      <section className="cr-hero">
        <div className="lbl">Careers at Eco-Thrift</div>
        <h1 className="disp cr-h1 cr-h1-role">{job.title}</h1>
        {job.tagline && <p className="cr-sub">{job.tagline}</p>}
      </section>

      <section className="cr-facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
      </section>

      <section className="cr-text">
        <div className="cr-sec">
          <h2>About the role</h2>
          <p>{job.summary}</p>
        </div>
        <List title="What you’ll do" items={job.duties} />
        <List title="What great looks like" items={job.success} />
        <List title="What we’re looking for" items={job.looking_for} />
        <List title="Nice to have" items={job.nice_to_have} />
        <List title="The physical side" items={job.physical} />
      </section>

      {page?.what_we_ask && (
        <section className="cr-band cr-ink">
          <h2 className="disp">What we ask</h2>
          <p>{page.what_we_ask}</p>
          {page.pay && <p className="cr-pay">{page.pay}</p>}
        </section>
      )}
      {page?.growth && (
        <section className="cr-band cr-cream">
          <h2 className="disp">Room to grow</h2>
          <p>{page.growth}</p>
        </section>
      )}
      <p className="fine cr-foot">About 5 minutes. A resume is optional.</p>

      <div className="cr-nav">
        <Link className="btn btn-ink cr-wide" to={`/careers/apply?role=${job.slug}`}>
          Apply for {job.title}
        </Link>
      </div>
    </div>
  )
}
