/**
 * The desktop footer (Dash Update #211): a real footer, light like the phone site's close (owner 11-20: the black bar
 * "VERY ugly", a second logo "redundant"). Four columns: the shop, Thrift+, help and info (the phone's four places,
 * words.ts INFO, and the journal), the store; then one quiet line: Privacy, Thrift+ terms, the release (owner
 * 2026-10-20: staff can tell which version is live).
 */
import { Link } from 'react-router-dom'
import { STORE } from '../../data/content'
import { useHome } from '../../phone/lib/boot'
import { hoursRows } from '../../phone/lib/hours'
import { useMember } from '../../phone/lib/member'
import { JOIN_HREF, NAV, SIGN_IN_HREF, SUB_NAV } from '../words'

declare const __APP_VERSION__: string
export const PAGE_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

export function Footer() {
  const rows = hoursRows(useHome()?.hours)
  const member = useMember().status === 'member'
  return (
    <footer className="dk-foot">
      <div className="dk-w dk-fcols">
        <div>
          <h2>Shop</h2>
          <ul>
            {NAV.filter((n) => n.to !== '/visit' && n.to !== '/thriftplus').map((n) => (
              <li key={n.to}>
                <Link to={n.to}>{n.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Thrift+</h2>
          <ul>
            <li>
              <Link to="/thriftplus">{member ? 'My Thrift+' : 'What is Thrift+'}</Link>
            </li>
            {member ? null : (
              <>
                <li>
                  <Link to={JOIN_HREF}>Join free</Link>
                </li>
                <li>
                  <Link to={SIGN_IN_HREF}>Sign in</Link>
                </li>
              </>
            )}
            <li>
              <Link to="/returns">3-day returns</Link>
            </li>
            <li>
              <Link to="/terms">Thrift+ terms</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Help and info</h2>
          <ul>
            {SUB_NAV.map((n) => (
              <li key={n.to}>
                <Link to={n.to}>{n.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="vis">
          <h2>Visit</h2>
          <p>
            <b>84th &amp; Center</b>
            <br />
            {STORE.retail.address}
            <br />
            <span className="tn">{STORE.retail.phone}</span>
          </p>
          <p className="tn" style={{ marginTop: 10 }}>
            {rows.map(([d, t]) => (
              <span key={d}>
                {d}: {t}
                <br />
              </span>
            ))}
          </p>
          <p style={{ marginTop: 10 }}>
            <Link to="/visit">Map and directions</Link>
          </p>
        </div>
      </div>
      <div className="dk-w dk-fend">
        <span>Eco-Thrift · Omaha</span>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Thrift+ terms</Link>
        {PAGE_VERSION ? <span className="v tn">v{PAGE_VERSION}</span> : null}
      </div>
    </footer>
  )
}
