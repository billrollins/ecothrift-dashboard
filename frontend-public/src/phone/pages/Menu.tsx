/** The menu (mockup pages/menu.html): a plain full-screen list, open status on top, every place one 52 px row.
 *  No drawer, no animation. /scan and /terms are the current apps (plain links, a full page load). */
import { Link } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { useOpenStatus } from '../lib/hours'
import './Menu.css'

type Row = [label: string, to: string, plain?: boolean]

const ROWS: Row[] = [
  ['Home', '/'],
  ['Scan a tag', '/scan', true],
  ['Thrift+', '/thriftplus'],
  ['In store', '/store'],
  ['Coming', '/store?where=coming'],
  ['Categories', '/categories'],
  ['Visit', '/#visit'],
  ['About', '/about'],
  ['Questions', '/questions'],
  ['Careers', '/careers'],
  ['Returns and policies', '/terms', true],
]

export default function Menu() {
  const open = useOpenStatus(useHome()?.hours)
  return (
    <div className="mn">
      <Link className="mn-open" to="/#visit">
        <span className={`open${open.open ? '' : ' shut'}`}>
          <i />
          {open.label}
        </span>
        <span className="ad">8425 W Center Rd</span>
      </Link>
      <nav className="mn-list" aria-label="Menu">
        {ROWS.map(([label, to, plain]) =>
          plain ? (
            <a key={label} href={to}>
              {label}
              <span>›</span>
            </a>
          ) : (
            <Link key={label} to={to}>
              {label}
              <span>›</span>
            </Link>
          ),
        )}
      </nav>
    </div>
  )
}
