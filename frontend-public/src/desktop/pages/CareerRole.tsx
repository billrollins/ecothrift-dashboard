/**
 * One role on a computer (Dash Update #211): `/careers/<slug>`, the same data and rules as the phone page
 * (phone/pages/CareerRole.tsx): a slug that is not an open role (or careers off) shows "No openings"; the Google Jobs
 * posting rides along unless it is a preview. The role's text on the left; its facts and Apply in a panel on the right
 * that stays in view.
 */
import { Link, useParams } from 'react-router-dom'
import { useCareers } from '../../careers/api'
import { jobPosting, PreviewBar, TYPE_LABEL } from '../../phone/pages/careers/parts'
import { useJsonLd, useSeo } from '../../useSeo'
import { CAREERS } from '../words'
import { DeskCareersWait, DeskNoOpenings } from './Careers'
import './careers.css'

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div className="dk-cr-sec">
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
  if (loading) return <DeskCareersWait />
  if (!careers?.public || !job) return <DeskNoOpenings />
  const page = careers.page
  const facts: Array<[string, string]> = [
    ['When', job.schedule],
    ['Hours', job.hours],
    ['Type', TYPE_LABEL[job.employment_type]],
    ['Pay', job.pay_text],
    ['Where', CAREERS.roleWhere],
    ['With', job.works_with],
  ]
  return (
    <div className="dk-w dk-cr">
      <PreviewBar on={careers.preview} />
      <div className="dk-crumbs">
        <Link to="/careers">Careers</Link>
        <span className="sep">›</span>
        <span>{job.title}</span>
      </div>
      <div className="dk-cr-role-grid">
        <div>
          <p className="dk-kick">{CAREERS.kick}</p>
          <h1 className="disp dk-cr-rh">{job.title}</h1>
          {job.tagline ? <p className="dk-cr-tag">{job.tagline}</p> : null}
          <div className="dk-cr-sec">
            <h2>About the role</h2>
            <p>{job.summary}</p>
          </div>
          <List title="What you’ll do" items={job.duties} />
          <List title="What great looks like" items={job.success} />
          <List title="What we’re looking for" items={job.looking_for} />
          <List title="Nice to have" items={job.nice_to_have} />
          <List title="The physical side" items={job.physical} />
          {page?.what_we_ask ? (
            <div className="dk-cr-band ink" style={{ marginTop: 32 }}>
              <h2 className="disp">{CAREERS.ask}</h2>
              <p>{page.what_we_ask}</p>
              {page.pay ? <p className="pay">{page.pay}</p> : null}
            </div>
          ) : null}
        </div>
        <aside className="dk-cr-panel">
          <dl>
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="lbl">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          <Link className="btn btn-ink" to={`/careers/apply?role=${job.slug}`}>
            Apply for {job.title}
          </Link>
          <p className="dk-note">{CAREERS.applyFoot}</p>
        </aside>
      </div>
    </div>
  )
}
