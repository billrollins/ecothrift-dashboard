/**
 * Black Friday takes over the desktop site's home (owner 2026-11-24, Dash Update #220): "Desktop - FIRST Sale and Get
 * directions". A desktop-built panel under the desktop site's own header: the sale in his words and ONE button, Get
 * directions. No phone parts, ever (his rule the same day: "NEVER NEVER NEVER have the desktop app have Mobile elements
 * or be Mobile view"). The same words and sizes as the server's first paint (templates/public/black_friday_shell.html).
 */
import { retailMapsDirectionsUrl, STORE } from '../data/content'

export default function BlackFridayPanel() {
  return (
    <section className="bfd" aria-label="Black Friday" data-testid="bf-desktop">
      <div className="bfd__in">
        <p className="bfd__when">Fri &amp; Sat · Nov 27 to 28</p>
        <h1 className="bfd__title">
          Black <span>Friday</span>
        </h1>
        <p className="bfd__say">All prices reduced.</p>
        <p className="bfd__sub">No need to sign up for Thrift+. Just good deals.</p>
        <p className="bfd__hours">Fri 6 AM to 6 PM · Sat 9 AM to 6 PM</p>
        <a className="bfd__btn" href={retailMapsDirectionsUrl()} target="_blank" rel="noreferrer" data-testid="bf-directions">
          Get directions
        </a>
        <p className="bfd__addr">
          {STORE.retail.address} · <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
        </p>
      </div>
    </section>
  )
}
