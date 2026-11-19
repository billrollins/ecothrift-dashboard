/** The bottom bar (mockup shell/90-bottombar.html): four places, always under the thumb. Scan is the black one: a route
 *  of the phone site when the new scanner is on for this visit (the stamp's `scan`, scan/switch.ts), else a plain link
 *  (a full page load: the server answers with whichever scanner is on). */
import { Link, useLocation } from 'react-router-dom'
import { scanIsRoute } from '../scan/switch'
import { IconHome, IconList, IconScan, IconTag } from './icons'
import { isHomePath } from './TopBar'

export function BottomBar() {
  const { pathname } = useLocation()
  const on = (yes: boolean) => (yes ? 'on' : undefined)
  const home = isHomePath(pathname)
  return (
    <nav className="bb" aria-label="Main">
      <Link className={on(home)} to="/" aria-current={home ? 'page' : undefined}>
        <IconHome />
        Home
      </Link>
      <Link className={on(pathname.startsWith('/store'))} to="/store">
        <IconList />
        In store
      </Link>
      {scanIsRoute() ? (
        <Link className="scan" to="/scan" aria-current={pathname === '/scan' ? 'page' : undefined}>
          <span className="k">
            <IconScan />
          </span>
          Scan
        </Link>
      ) : (
        <a className="scan" href="/scan">
          <span className="k">
            <IconScan />
          </span>
          Scan
        </a>
      )}
      <Link className={on(pathname.startsWith('/thriftplus'))} to="/thriftplus">
        <IconTag />
        Thrift+
      </Link>
    </nav>
  )
}
