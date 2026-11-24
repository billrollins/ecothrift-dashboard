/**
 * Careers on a computer (Dash Update #211): the same data and states as the phone page (phone/pages/Careers.tsx; GET
 * /api/hiring/public/careers/ through src/careers/api.ts): hidden roles never come back from the server; not public or
 * no open role shows "No openings"; a Dash preview key shows the page early with a preview bar. The roles as equal
 * cards, then what we ask and room to grow side by side, then Apply.
 */
import { Link } from 'react-router-dom'
import { useCareers } from '../../careers/api'
import { Headline, PreviewBar, RoleIcon } from '../../phone/pages/careers/parts'
import { useSeo } from '../../useSeo'
import { CAREERS } from '../words'
import './careers.css'

export function DeskNoOpenings() {
  return (
    <div className="dk-w dk-cr">
      <div className="dk-pt">
        <p className="dk-kick">{CAREERS.kick}</p>
        <h1 className="disp">{CAREERS.noneHead}</h1>
        <p>{CAREERS.noneLine}</p>
      </div>
      <Link className="btn btn-ink" to="/visit" style={{ marginTop: 20 }}>
        Visit the store
      </Link>
    </div>
  )
}

export function DeskCareersWait() {
  return <div className="dk-w dk-cr" aria-busy="true" style={{ minHeight: 520 }} />
}

export default function Careers() {
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
  if (loading) return <DeskCareersWait />
  if (!careers?.public || !page || careers.jobs.length === 0) return <DeskNoOpenings />
  const n = careers.jobs.length
  return (
    <div className="dk-cr-page">
      <PreviewBar on={careers.preview} />
      <section className="dk-cr-hero">
        <div className="dk-w">
          <p className="dk-kick">{CAREERS.kick}</p>
          <Headline text={page.headline || 'Now hiring'} className="dk-cr-h1" />
          <p className="dk-cr-sub tn">
            {n} open {n === 1 ? 'role' : 'roles'} · Omaha · {CAREERS.mission}
          </p>
        </div>
      </section>
      <div className="dk-w">
        <section className="dk-cr-roles" style={{ gridTemplateColumns: `repeat(${Math.min(3, n)}, minmax(0, 1fr))` }}>
          {careers.jobs.map((job) => (
            <Link className="dk-cr-role" key={job.slug} to={`/careers/${job.slug}`}>
              <span className="ic">
                <RoleIcon slug={job.slug} />
              </span>
              <h2>{job.title}</h2>
              <p>{job.tagline}</p>
              <em>See the role ›</em>
            </Link>
          ))}
        </section>
        <section className="dk-cr-two">
          {page.what_we_ask ? (
            <div className="dk-cr-band ink">
              <h2 className="disp">{CAREERS.ask}</h2>
              <p>{page.what_we_ask}</p>
              {page.pay ? <p className="pay">{page.pay}</p> : null}
            </div>
          ) : null}
          {page.growth ? (
            <div className="dk-cr-band cream">
              <h2 className="disp">{CAREERS.grow}</h2>
              <p>{page.growth}</p>
            </div>
          ) : null}
        </section>
        <section className="dk-cr-apply">
          {page.photo_url ? <img src={page.photo_url} alt="The Eco-Thrift team at work in the store" width={560} height={373} loading="lazy" /> : null}
          <div>
            <h2 className="disp">Apply</h2>
            <p>{page.apply_note || CAREERS.applyNote}</p>
            <Link className="btn btn-ink" to="/careers/apply">
              Apply
            </Link>
            <p className="dk-note">{CAREERS.where}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
