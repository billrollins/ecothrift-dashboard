import { Link } from 'react-router-dom'
import { publicAssetUrl } from '../data/content'
import { THRIFT_PLUS_HOME_BAND, THRIFT_PLUS_IMAGES, THRIFT_PLUS_VISIT_BLOCK } from '../data/thriftPlusAbout'
import { useThriftPlusOpen } from '../thriftPlusOpen'
import ScanIcon from './ScanIcon'
import './ThriftPlusPromo.css'

/*
 * The Thrift+ app on the home page and the Visit page (owner 10-15: "a front and center mention of the Scanning app
 * on the front page and the Visit us"). Each shows only while Thrift+ is open (thriftPlusOpen.tsx): nothing points
 * shoppers at a closed app. /scan and /join are the Thrift+ app, not routes of this site: plain links.
 */

/** Home: directly under the hero, full width. Text left, the phone right (on phones: the phone left, above the text). */
export function ThriftPlusHomeBand() {
  const { open } = useThriftPlusOpen()
  if (!open) return null
  const b = THRIFT_PLUS_HOME_BAND
  return (
    <section className="tpband" aria-labelledby="tpband-title">
      <div className="wrap tpband__row">
        <img
          className="tpband__phone"
          src={publicAssetUrl(THRIFT_PLUS_IMAGES.appPhone)}
          alt={b.imageAlt}
          width={604}
          height={1256}
          decoding="async"
        />
        <div className="tpband__head">
          <span className="tpband__pill">{b.pill}</span>
          <h2 id="tpband-title" className="tpband__title">
            {b.heading}
          </h2>
        </div>
        <p className="tpband__text">{b.text}</p>
        <div className="tpband__btns">
          <a className="btn btn--primary" href={b.open.href}>
            <ScanIcon />
            <span>{b.open.label}</span>
          </a>
          <Link className="btn btn--ghost" to={b.about.href}>
            {b.about.label}
          </Link>
        </div>
      </div>
    </section>
  )
}

/** Visit: "Bring your phone", after the address and hours. */
export function ThriftPlusVisitBlock() {
  const { open } = useThriftPlusOpen()
  if (!open) return null
  const v = THRIFT_PLUS_VISIT_BLOCK
  return (
    <section className="tpvisit" aria-labelledby="tpvisit-title">
      <h2 id="tpvisit-title" className="tpvisit__title">
        {v.heading}
      </h2>
      <p className="tpvisit__text">{v.text}</p>
      <div className="tpvisit__btns">
        <a className="btn btn--primary" href={v.open.href}>
          <ScanIcon />
          <span>{v.open.label}</span>
        </a>
        <a className="btn btn--ghost" href={v.join.href}>
          {v.join.label}
        </a>
      </div>
    </section>
  )
}
