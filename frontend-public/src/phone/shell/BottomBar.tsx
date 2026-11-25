/** The bottom bar (mockup shell/90-bottombar.html): four places, always under the thumb. Scan is the black one: a route
 *  of the phone site when the new scanner is on for this visit (the stamp's `scan`, scan/switch.ts), else a plain link
 *  (a full page load: the server answers with whichever scanner is on).
 *  Black Friday (owner 2026-11-24, Dash Update #228: "No in store tab Just Home Scan Thrift+"): three places, spread
 *  evenly (shell.css `.bb3`). The day is known at the first paint (the stamped feed), so the bar never changes under a thumb. */
import { Link, useLocation } from 'react-router-dom'
import { useDay } from '../lib/day'
import { scanIsRoute } from '../scan/switch'
import { IconHome, IconList, IconScan, IconTag } from './icons'
import { isHomePath } from './TopBar'

export function BottomBar() {
  const { pathname } = useLocation()
  const bf = useDay() === 'bf'
  const on = (yes: boolean) => (yes ? 'on' : undefined)
  const now = (yes: boolean) => (yes ? ('page' as const) : undefined)
  const home = isHomePath(pathname)
  const store = pathname.startsWith('/store')
  const plus = pathname.startsWith('/thriftplus')
  return (
    <nav className={bf ? 'bb bb3' : 'bb'} aria-label="Main">
      <Link className={on(home)} to="/" aria-current={now(home)}>
        <IconHome />
        Home
      </Link>
      {bf ? null : (
        <Link className={on(store)} to="/store" aria-current={now(store)}>
          <IconList />
          In store
        </Link>
      )}
      {scanIsRoute() ? (
        <Link className="scan" to="/scan" aria-current={now(pathname === '/scan')}>
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
      <Link className={on(plus)} to="/thriftplus" aria-current={now(plus)}>
        <IconTag />
        Thrift+
      </Link>
    </nav>
  )
}
