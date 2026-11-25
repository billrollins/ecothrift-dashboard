/** The menu (mockup pages/menu.html): a plain full-screen list, open status on top, every place one 52 px row.
 *  No drawer, no animation. /scan is a plain link (a full page load: the server picks the scanner). Under "Help and info"
 *  the home's info tiles (words.ts INFO), same title, names and places (critic cycle 11-20).
 *  Black Friday (owner 2026-11-24, Dash Update #228: "menu: Home, Scan Thrift + no in store on truck categories. You can
 *  have visit"; "all help an info are still there too"): the shop rows go; Help and info stays whole. */
import { Link } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { useDay } from '../lib/day'
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

/** The shop's lists: not offered on Black Friday (their addresses still answer when typed). */
export const SHOP_PATHS = ['/store', '/store?where=coming', '/categories']

/** The menu's top rows for the day. */
export function menuRows(day: 'normal' | 'bf'): Row[] {
  return day === 'bf' ? ROWS.filter(([, to]) => !SHOP_PATHS.includes(to)) : ROWS
}

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
  const day = useDay()
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
        <Rows rows={menuRows(day)} />
        <p className="lbl mn-lbl">Help and info</p>
        <Rows rows={INFO.map((i): Row => [i.name, i.to])} />
      </nav>
    </div>
  )
}
