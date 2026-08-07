import { Link } from 'react-router-dom'
import { useSeo } from '../useSeo'

export default function SellPage() {
  useSeo({
    title: 'Sell with us',
    description:
      'Eco-Thrift consignment is coming this summer. Sell your quality goods with us in Omaha - check back soon.',
    path: '/sell',
  })
  return (
    <div className="wrap">
      <div className="pagehead">
        <span className="eyebrow">Sell with us</span>
        <h1>Consign your quality items</h1>
      </div>

      <div className="section tight">
        <div className="comingsoon" style={{ marginBottom: 60 }}>
          <h3>Coming this summer - finally!</h3>
          <p>
            We&rsquo;re building out consignment so you can turn furniture, tools, and home goods
            you no longer need into earnings - and keep good things in circulation. Check back soon.
          </p>
          <div className="hbtns" style={{ justifyContent: 'center' }}>
            <Link className="btn btn--primary" to="/visit">
              Visit the store
            </Link>
            <Link className="btn btn--ghost" to="/shop">
              Browse the shop
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
