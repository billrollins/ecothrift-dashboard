/**
 * Black Friday takes over the desktop home's first screen (owner 2026-11-24: "Desktop - FIRST Sale and Get directions
 * ... the only thing you see on front page is the sale and a button"; "i do not want the other buttons to completely
 * disappear"). The header and every section stay; the first screen is the sale in his words and ONE button, Get
 * directions; the rest of the home is below it. Built for a computer: a full-width poster under the desktop header,
 * never the phone's takeover. Shown while the home feed says `bf` or the server stamped `data-day="bf"`.
 */
import { retailMapsDirectionsUrl } from '../../../data/content'
import { BLACK_FRIDAY } from '../../words'

export default function BlackFriday() {
  return (
    <section className="dk-bf" id="top" aria-label="Black Friday" data-testid="bf-desktop-home">
      <div className="dk-w dk-bf-in">
        <p className="dk-bf-when">{BLACK_FRIDAY.when}</p>
        <h1 className="disp">
          {BLACK_FRIDAY.title[0]} <em>{BLACK_FRIDAY.title[1]}</em>
        </h1>
        <p className="dk-bf-say">{BLACK_FRIDAY.say}</p>
        <p className="dk-bf-sub">{BLACK_FRIDAY.sub}</p>
        <p className="dk-bf-hours tn">{BLACK_FRIDAY.hours}</p>
        <a className="btn dk-bf-btn" href={retailMapsDirectionsUrl()} target="_blank" rel="noopener" data-testid="bf-directions">
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 4L3.5 11l7 2.5L13 20.5z" />
          </svg>
          {BLACK_FRIDAY.button}
        </a>
      </div>
    </section>
  )
}
