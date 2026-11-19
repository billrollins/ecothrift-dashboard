/**
 * Home 7, visit (mockup blocks/70-visit.html): a drawn map (the store is west of S 84th St and south of W Center Rd),
 * open or not and the hours from the feed's `hours`, the address, Directions (the site's maps link), and the phone
 * number as selectable text (no tel: link, word rules).
 */
import { STORE } from '../../../data/content'
import { useHome } from '../../lib/boot'
import { hoursRows, useOpenStatus } from '../../lib/hours'
import './Visit.css'

export default function Visit() {
  const hours = useHome()?.hours
  const open = useOpenStatus(hours)
  const maps = STORE.retail.mapsPlaceUrl
  return (
    <section className="visit" id="visit">
      <a className="map" href={maps} target="_blank" rel="noopener" aria-label="Map: 8425 W Center Rd">
        <svg viewBox="0 0 358 150" aria-hidden="true">
          <rect className="rd" x="0" y="46" width="358" height="30" />
          <rect className="rd" x="262" y="0" width="24" height="150" />
          <path className="rd-e" d="M0 46H262M286 46H358M0 76H262M286 76H358M262 0V46M286 0V46M262 76V150M286 76V150" />
          <path className="rd-c" d="M0 61H20M118 61H256M292 61H358" />
          <text className="nm" x="28" y="65">W CENTER RD</text>
          <text className="nm" transform="translate(278 142) rotate(-90)">S 84TH ST</text>
          <rect className="lot" x="98" y="114" width="74" height="22" rx="4" />
          <path className="pin" d="M135 114c-3-9-14-17-14-29a14 14 0 0 1 28 0c0 12-11 20-14 29z" />
          <circle className="dot" cx="135" cy="85" r="5.5" />
          <text className="here" x="158" y="104">Eco-Thrift</text>
        </svg>
      </a>
      <span className={`open${open.open ? '' : ' shut'}`}>
        <i />
        {open.label}
      </span>
      <h2 className="disp">8425 W Center Rd</h2>
      <p className="city">Omaha, NE 68124</p>
      <div className="acts">
        <a className="btn btn-ink" href={maps} target="_blank" rel="noopener">
          Directions
        </a>
        <span className="btn btn-line tn" style={{ userSelect: 'all' }}>
          {STORE.retail.phone}
        </span>
      </div>
      <div className="hours">
        {hoursRows(hours).map(([day, time]) => (
          <div key={day}>
            <span>{day}</span>
            <span>{time}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
