/**
 * /visit on a computer (Dash Update #211): its own page (on a phone it is home at its Visit block). The phone's Visit
 * block, imported whole (the drawn map of the corner, open or not, the week from the feed, Directions, Call), laid out
 * in two columns on a white card.
 */
import PhoneVisit from '../../phone/pages/home/Visit'
import { useSeo } from '../../useSeo'
import '../pages/home/home.css'
import './info.css'

export default function Visit() {
  useSeo({ title: 'Visit', description: 'Eco-Thrift, 8425 W Center Rd, Omaha: the southwest corner of 84th and Center. Hours and directions.', path: '/visit' })
  return (
    <div className="dk-w dk-info dk-vp">
      <div className="dk-pt">
        <p className="dk-kick">Visit Eco-Thrift</p>
        <h1 className="disp">One store in Omaha</h1>
      </div>
      <div className="dk-visit">
        <PhoneVisit />
      </div>
    </div>
  )
}
