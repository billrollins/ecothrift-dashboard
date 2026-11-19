/**
 * Careers (W4; look: round3 pages/careers.html, prefix `cr`). Same data and states as the live page
 * (src/pages/careers/CareersPage.tsx): GET /api/hiring/public/careers/ through src/careers/api.ts; hidden roles never
 * come back from the server; not public (or no open role) shows "No openings"; a Dash preview key (?preview=) shows
 * the page early with a preview bar. Each role card opens its page; the lime band opens the steps form.
 */
import { Link } from 'react-router-dom'
import { useCareers } from '../../careers/api'
import { useSeo } from '../../useSeo'
import { BackRow, Headline, Loading, NoOpenings, PreviewBar, RoleIcon } from './careers/parts'
import './careers.css'

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

  if (loading) return <Loading />
  if (!careers?.public || !page || careers.jobs.length === 0) return <NoOpenings />
  const n = careers.jobs.length

  return (
    <>
      <PreviewBar on={careers.preview} />
      <BackRow fallback="/" />
      <section className="cr-hero">
        <div className="lbl">Careers at Eco-Thrift</div>
        <Headline text={page.headline || 'Now hiring'} />
        <p className="cr-sub tn">
          {n} open {n === 1 ? 'role' : 'roles'} · Omaha
        </p>
        <p className="cr-mission">Another Chance for Everything and Everyone.</p>
      </section>

      <section className="cr-roles">
        {careers.jobs.map((job) => (
          <Link className="cr-role" key={job.slug} to={`/careers/${job.slug}`}>
            <span className="cr-ic">
              <RoleIcon slug={job.slug} />
            </span>
            <span className="cr-role-t">
              <h2>{job.title}</h2>
              <p>{job.tagline}</p>
            </span>
            <span className="cr-go" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </section>

      {page.what_we_ask && (
        <section className="cr-band cr-ink">
          <h2 className="disp">What we ask</h2>
          <p>{page.what_we_ask}</p>
          {page.pay && <p className="cr-pay">{page.pay}</p>}
        </section>
      )}

      {page.growth && (
        <section className="cr-band cr-cream">
          <h2 className="disp">Room to grow</h2>
          <p>{page.growth}</p>
        </section>
      )}

      {page.photo_url && (
        <section className="cr-photo">
          <img src={page.photo_url} alt="The Eco-Thrift team at work in the store" width={390} height={260} loading="lazy" />
        </section>
      )}

      <section className="cr-band cr-lime">
        <h2 className="disp cr-big">Apply</h2>
        <p>{page.apply_note || 'It takes about 5 minutes.'}</p>
        <Link className="btn btn-ink cr-wide" to="/careers/apply">
          Apply
        </Link>
        <p className="fine cr-where">Eco-Thrift, 8425 West Center Road, Omaha, NE 68124</p>
      </section>
    </>
  )
}
