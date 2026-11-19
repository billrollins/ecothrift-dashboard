/**
 * Home 6, how it works (mockup blocks/60-how.html): three steps as three picture cards, drawn from kit pieces
 * (the tag, a ThriftBucks amount, the register). The $100 / 20.00 example appears once.
 */
import { Link } from 'react-router-dom'
import { bucks, money } from '../../lib/format'
import './HowItWorks.css'

/** The store's own example (round-3 content: ECO.copy.howExample): a $100.00 tag that carries 20.00 ThriftBucks. */
const TAG = 100
const TB = 20

export default function HowItWorks() {
  return (
    <section className="hw" id="how">
      <div className="sh">
        <h2>How it works</h2>
        <Link to="/thriftplus">Thrift+</Link>
      </div>
      <div className="rail">
        <a className="hwc" href="/scan">
          <div className="hwp">
            <div className="hwh">
              <svg viewBox="0 0 30 26" aria-hidden="true">
                <path d="M15 1 C 6 6, 24 14, 15 25" />
              </svg>
              <span className="tag tn">
                <small>$</small>
                {TAG}
              </span>
            </div>
          </div>
          <div className="hwt">
            <span className="hwn disp tn">1</span>
            <b>The tag is the price</b>
          </div>
        </a>
        <Link className="hwc" to="/thriftplus">
          <div className="hwp">
            <span className="tag s tn">
              <small>$</small>
              {TAG}
            </span>
            <span className="hwa">→</span>
            <span className="hwb">
              <span className="disp tn">+{bucks(TB)}</span>
              <span className="lbl">ThriftBucks</span>
            </span>
          </div>
          <div className="hwt">
            <span className="hwn disp tn">2</span>
            <b>Members collect ThriftBucks</b>
          </div>
        </Link>
        <Link className="hwc" to="/thriftplus">
          <div className="hwp">
            <div className="hwr">
              <div>
                <span className="lbl">Keep</span>
                <span className="disp tn">
                  {bucks(TB)} <small>ThriftBucks</small>
                </span>
              </div>
              <div className="if-normal">
                <span className="lbl">Or pay today</span>
                <span className="disp tn">{money(TAG - TB / 2)}</span>
              </div>
              <div className="if-bf">
                <span className="lbl">Or pay today</span>
                <span className="disp tn">{money(TAG - TB)}</span>
              </div>
            </div>
          </div>
          <div className="hwt">
            <span className="hwn disp tn">3</span>
            <b>Keep them or use them</b>
          </div>
        </Link>
      </div>
      <p className="hwf fine">Thrift+ members. Most items.</p>
    </section>
  )
}
