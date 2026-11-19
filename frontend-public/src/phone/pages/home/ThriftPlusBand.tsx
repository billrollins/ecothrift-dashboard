/**
 * Home 4, the Thrift+ band (mockup blocks/40-thriftplus.html). Signed out: what it is as one sum, then "Join free"
 * (the current join at /scan?view=join). Signed in (useMember): the name, the balance, the use-by date, "My Thrift+".
 * Both states sit in the same grid cell, so the band keeps one height whichever shows. No QR on home.
 */
import { Link } from 'react-router-dom'
import { bucks, shortDate } from '../../lib/format'
import { useMember } from '../../lib/member'
import { asset, Tag } from '../../shell/Tag'
import './ThriftPlusBand.css'

export default function ThriftPlusBand() {
  const { member } = useMember()
  const first = member?.first || 'Member'
  const useBy = shortDate(member?.useBy)
  const amount = bucks(member?.bucks ?? 0)
  return (
    <section className="tp" id="thriftplus">
      <img className="wm" src={asset('phone/thriftplus-wordmark-white.svg')} width={81} height={30} alt="Thrift+" loading="lazy" />
      <div className="tp-body">
        <div className="tp-st tp-out">
          <h2 className="disp">
            Collect <em>ThriftBucks</em>
          </h2>
          <div className="sumrow">
            <Tag price={100} cents="auto" />
            <div className="outs">
              <div className="out if-normal">
                <b className="tn">Keep 20.00 ThriftBucks</b>for your next visit
              </div>
              <div className="out if-bf">
                <b className="tn">20.00 ThriftBucks</b>come off today, in full
              </div>
              <div className="out if-normal">
                <b className="tn">Or pay $90.00</b>at the register today
              </div>
              <div className="out if-bf">
                <b className="tn">You pay $80.00</b>at the register today
              </div>
            </div>
          </div>
          <div className="cta">
            <a className="btn btn-lime" href="/scan?view=join">
              Join free
            </a>
            <p className="fine">
              Thrift+ members. Most items.
              <br />
              Free to join. Nothing owed.
            </p>
          </div>
        </div>

        <div className="tp-st tp-in">
          <h2 className="disp tp-hi">{first}, you have</h2>
          <div className="tp-bal">
            <p className="disp">
              <span className="tp-num tn" style={amount.length > 6 ? { fontSize: 76 } : undefined}>{amount}</span>
              <span className="tp-unit">ThriftBucks</span>
            </p>
          </div>
          {useBy ? (
            <p className="tp-use if-normal">
              Use by <b className="tn">{useBy}</b> at full value
            </p>
          ) : null}
          <p className="tp-use if-bf">
            <b>They come off today, in full</b>
          </p>
          <div className="cta">
            <Link className="btn btn-lime" to="/thriftplus">
              My Thrift+
            </Link>
            <p className="fine">
              Thrift+ members. Most items.
              <br />
              Show the QR at the register.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
