/**
 * Home 7, visit: where the store is and whether it is open, in two seconds (owner 2026-11-20: "I dont love the map
 * look ... try to spruce it up"; critic cycle in workspace/critic/visit/).
 *
 * The map is drawn here, in the kit's colours, never a live map or tiles (speed first). It is true to the corner (owner:
 * the store is WEST of S 84th St and SOUTH of W Center Rd): the building sits back from the corner with its lot in
 * front, entered from Center and from 84th (checked against OpenStreetMap; nothing traced). North is up.
 * Then open or not and the week from the feed's `hours` (lib/hours), the corner in words, Directions (the store's maps
 * link: the phone's maps app opens on it) and Call (a tel: link).
 */
import { STORE } from '../../../data/content'
import { useHome } from '../../lib/boot'
import type { Hours } from '../../lib/boot'
import { DEFAULT_HOURS, hoursRows, useOpenStatus } from '../../lib/hours'
import './Visit.css'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** The store's date and weekday (0 = Monday, as the feed's `closed_weekdays`). */
function storeToday(now: Date, tz: string): { ymd: string; wd: number } {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const get = (t: string) => f.find((p) => p.type === t)?.value || ''
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
    return { ymd: `${get('year')}-${get('month')}-${get('day')}`, wd: wd < 0 ? 0 : wd }
  } catch {
    return { ymd: now.toISOString().slice(0, 10), wd: (now.getDay() + 6) % 7 }
  }
}

/** Which of hoursRows' rows is today: a holiday that covers today, else the run of weekdays that holds it. */
export function todayRow(hours: Hours | null | undefined, rows: Array<[string, string]>, now: Date = new Date()): number {
  const h = hours && typeof hours === 'object' ? hours : DEFAULT_HOURS
  const { ymd, wd } = storeToday(now, h.timezone || DEFAULT_HOURS.timezone)
  const overrides = h.overrides || []
  const weekRows = rows.length - overrides.length
  const ov = overrides.findIndex((o) => o.date_start <= ymd && ymd <= o.date_end)
  if (ov >= 0) return weekRows + ov
  for (let i = 0; i < weekRows; i += 1) {
    const label = rows[i][0]
    const [a, b] = label.includes(' to ') ? label.split(' to ') : label.includes(' and ') ? label.split(' and ') : [label, label]
    const from = DAYS.indexOf(a)
    const to = DAYS.indexOf(b)
    if (label.includes(' and ') ? wd === from || wd === to : from <= wd && wd <= to) return i
  }
  return -1
}

/** The logo's round mark (public/phone/eco-thrift-logo-white.svg, its first two paths), 296 units square. */
const MARK = [
  'M25.9 147.5C25.9 214.7 80.4 269.2 147.6 269.2L147.6 269.2C214.8 269.2 269.3 214.7 269.3 147.5L269.3 147.5C269.3 80.3 214.8 25.8 147.6 25.8L147.6 25.8C80.4 25.8 25.9 80.3 25.9 147.5M71.9 180.7C76.3 213.3 100.6 238.9 144.6 246.2L142 243.9ZM187.1 86.4C173.2 68.9 158.1 54 147.6 43.6C137.2 54 122 68.9 108.1 86.4L147.6 122ZM153.2 243.9L150.6 246.2C194.6 238.9 218.9 213.3 223.3 180.7ZM122.3 150.3L127 154.6L147.6 173.1L168.1 154.7L208.3 118.5L208.2 118.3C204.9 111.9 201 105.6 196.8 99.6L153 139L147.6 143.9L142.2 139L98.4 99.6C94.2 105.6 90.4 111.9 87 118.3L86.9 118.5L122.3 150.3ZM215.3 134.1L161.4 182.7L147.6 195.1L125.2 174.9L79.9 134.1C76.9 142.2 74.9 150.2 74 157.9L147.6 224.3L221.3 157.9C220.3 150.2 218.3 142.2 215.3 134.1',
  'M12.3 88.4C-20.2 163 13.9 250.2 88.5 282.7L88.5 282.7C107.1 290.9 127.3 295.1 147.5 295.1L147.5 295.1C150.9 295.1 154.3 294.9 157.8 294.7L157.8 294.7C212.9 290.8 260.8 257 282.8 206.5L282.8 206.5C300.8 165.3 299.2 118.7 278.2 78.8L278.2 78.8C273.7 70.3 268.4 62.2 262.4 54.7L262.4 54.7C259.4 51 256.2 47.4 252.9 44L252.9 44C251 42.2 248 42.1 246.2 44L246.2 44C244.3 45.8 244.3 48.8 246.1 50.7L246.1 50.7C249.2 53.8 252.2 57.2 255 60.7L255 60.7C260.6 67.7 265.6 75.2 269.8 83.2L269.8 83.2C289.4 120.6 291 164.1 274.1 202.8L274.1 202.8C253.5 250 208.7 281.6 157.1 285.2L157.1 285.2C135 286.8 112.6 282.9 92.3 274L92.3 274C22.5 243.6 -9.5 162 21 92.2L21 92.2C50.9 23.9 130.8 -8.5 199.7 19.6L199.7 19.6L197.4 23.9C197.1 24.5 197.1 25.3 197.5 25.9L197.5 25.9C197.9 26.6 198.6 26.9 199.4 26.9L199.4 26.9L219 26.1C219.7 26.1 220.4 25.7 220.7 25L220.7 25C221.1 24.3 221 23.6 220.6 22.9L220.6 22.9L210.2 6.4C209.8 5.7 209.1 5.4 208.3 5.4L208.3 5.4C207.6 5.4 206.9 5.8 206.6 6.5L206.6 6.5L204.1 11.2C185.8 3.6 166.8 0 148 0L148 0C91 0 36.4 33.2 12.3 88.4',
]

/** Trees along the streets: a little warmth, nothing to read. */
const TREES: Array<[number, number]> = [
  [52, 36], [70, 38], [196, 36], [214, 38], [282, 34], [300, 36], [318, 34], [336, 36],
  [280, 98], [280, 118], [16, 108], [34, 110], [104, 186], [122, 184],
]

function Map() {
  return (
    <svg viewBox="0 0 358 196" aria-hidden="true">
      {TREES.map(([x, y]) => <circle key={`${x}-${y}`} className="tree" cx={x} cy={y} r="5.5" />)}
      {/* Neighbours: plain blocks, no names. */}
      <rect className="nb" x="84" y="10" width="28" height="22" rx="2" />
      <rect className="nb" x="124" y="6" width="40" height="26" rx="2" />
      <rect className="nb" x="284" y="10" width="12" height="12" rx="2" />
      <rect className="nb" x="302" y="10" width="12" height="12" rx="2" />
      <rect className="nb" x="320" y="10" width="12" height="12" rx="2" />
      <rect className="nb" x="338" y="10" width="12" height="12" rx="2" />
      <rect className="nb" x="296" y="86" width="34" height="24" rx="2" />
      <rect className="nb" x="292" y="138" width="20" height="40" rx="2" />
      <rect className="nb" x="-4" y="128" width="96" height="40" rx="2" />
      <rect className="nb" x="80" y="84" width="18" height="14" rx="2" />
      <rect className="nb" x="190" y="170" width="18" height="12" rx="2" />
      {/* The store's lot: in front of it (north) and along 84th, with the two driveways. */}
      <path className="lot" d="M108 79h130v80h-10v-50H108z" />
      <path className="stall" d="M116 83v8M124 83v8M132 83v8M140 83v8M148 83v8M156 83v8M182 83v8M190 83v8M198 83v8M206 83v8M214 83v8M222 83v8M230 83v8M230 116h6M230 124h6M230 132h6M230 140h6M230 148h6" />
      <rect className="rd" x="164" y="73" width="10" height="7" />
      <rect className="rd" x="237" y="94" width="5" height="10" />
      {/* The roads: both are wide, divided streets. */}
      <rect className="rd" x="0" y="46" width="358" height="28" />
      <rect className="rd" x="241" y="0" width="26" height="196" />
      <path className="edge" d="M0 46H241M267 46H358M0 74H164M174 74H241M267 74H358M241 0V46M267 0V46M241 74V94M241 104V196M267 74V196" />
      <path className="median" d="M0 60H236M272 60H358M254 0V41M254 79V196" />
      <text className="nm" x="12" y="65.2">W CENTER RD</text>
      <text className="nm" transform="translate(259.2 188) rotate(-90)">S 84TH ST</text>
      {/* The store: the building wears the logo. */}
      <rect className="bldg-base" x="110" y="113" width="118" height="42" rx="5" />
      <rect className="bldg" x="110" y="109" width="118" height="42" rx="5" />
      <g transform="translate(117 118) scale(0.0811)">
        {MARK.map((d) => <path key={d.slice(0, 12)} className="mark" d={d} fillRule="evenodd" />)}
      </g>
      <text className="sign" x="147" y="135.5">ECO-THRIFT</text>
      {/* North. */}
      <g transform="translate(24 23)">
        <circle className="nbg" r="15" />
        <path className="nar" d="M0 -11.5L4.5 -3.5H-4.5z" />
        <text className="nn" y="10.5" textAnchor="middle">N</text>
      </g>
    </svg>
  )
}

export default function Visit() {
  const hours = useHome()?.hours
  const open = useOpenStatus(hours)
  const rows = hoursRows(hours)
  const today = todayRow(hours, rows)
  const maps = STORE.retail.mapsPlaceUrl
  return (
    <section className="visit" id="visit">
      <a className="map" href={maps} target="_blank" rel="noopener" aria-label="Directions to 8425 W Center Rd, southwest corner of 84th and Center">
        <Map />
      </a>
      <p className={`open${open.open ? '' : ' shut'}`}>
        <i />
        {open.label}
      </p>
      <h2 className="disp">84th &amp; Center</h2>
      <p className="corner">Southwest corner · 8425 W Center Rd</p>
      <p className="city">Omaha, NE 68124</p>
      <div className="acts">
        <a className="btn go" href={maps} target="_blank" rel="noopener">
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4L3.5 11l7 2.5L13 20.5z" /></svg>
          Directions
        </a>
        <a className="btn btn-line call tn" href={`tel:${STORE.retail.phoneHref}`} aria-label={`Call ${STORE.retail.phone}`}>
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4h3.5l1.8 4.4-2.3 1.5a11 11 0 0 0 6.1 6.1l1.5-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />
          </svg>
          {STORE.retail.phone}
        </a>
      </div>
      <div className="hours">
        {rows.map(([day, time], i) => (
          <div key={day} className={i === today ? 'now' : undefined}>
            <span>
              {day}
              {i === today ? <em>Today</em> : null}
            </span>
            <span>{time}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
