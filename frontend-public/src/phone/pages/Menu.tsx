/** The menu (mockup pages/menu.html): a plain full-screen list, open status on top, every place one 52 px row.
 *  No drawer, no animation. /scan is a plain link (a full page load: the server picks the scanner). Under "Help and info"
 *  the home's info tiles (words.ts INFO), same title, names and places (critic cycle 11-20). */
import { Link } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { useOpenStatus } from '../lib/hours'
import { INFO } from './words'
import './Menu.css'

type Row = [label: string, to: string, plain?: boolean]

const ROWS: Row[] = [
  ['Home', '/'],
  ['Scan a tag', '/scan', true],
  ['Thrift+', '/thriftplus'],
  ['In store', '/store'],
  ['On the truck', '/store?where=coming'],
  ['Categories', '/categories'],
  ['Visit', '/#visit'],
]

function Rows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map(([label, to, plain]) =>
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
    </>
  )
}

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
        <Rows rows={ROWS} />
        <p className="lbl mn-lbl">Help and info</p>
        <Rows rows={INFO.map((i): Row => [i.name, i.to])} />
      </nav>
    </div>
  )
}
