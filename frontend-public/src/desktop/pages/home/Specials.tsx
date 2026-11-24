/**
 * Home 1 on a computer: the specials as equal boxes side by side (owner: "equal boxes"), the same cards as the phone's
 * swiped row (phone/pages/home/Specials.tsx) in the same order: No Thrift+? (rulebook V11, the one ThriftBucks
 * explainer behind Example, V12), the Black Friday teaser until Sat Nov 28, BO-HO-GO while the phone shows it, 3-day
 * returns. Dated cards come and go by themselves; the row keeps one height, so nothing below it moves.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHome } from '../../../phone/lib/boot'
import { useMember } from '../../../phone/lib/member'
import { IconCheck } from '../../../phone/shell/icons'
import { ThriftBucksExample } from '../../../phone/shell/ThriftBucksExample'
import { Tag } from '../../../phone/shell/Tag'
import { BF_TEASER, BOHO, JOIN_HREF, RETURNS_CARD, SHOUT } from '../../words'

/** Store-time (Omaha, UTC-6 in winter) day boundaries, as the phone's cards. */
export const BF_TEASER_ENDS = Date.parse('2026-11-29T06:00:00Z') // after Sat Nov 28
const BOHO_STARTS = Date.parse('2026-11-27T06:00:00Z')
const BOHO_ENDS = Date.parse('2027-01-01T06:00:00Z')

function Shout() {
  const member = useMember().status === 'member'
  const b = useHome()?.bucks
  const known = Boolean(b && b.share > 0 && b.typical > 0)
  const [example, setExample] = useState(false)
  return (
    <div className="dk-sp-c dk-sp-shout">
      <h2 className="disp">
        <span>{SHOUT.lines[0]}</span>
        <span>{SHOUT.lines[1]}</span>
        <em>{SHOUT.lines[2]}</em>
      </h2>
      <ul className="dk-sp-ok">
        <li>
          <IconCheck />
          {known ? SHOUT.share(b!.share) : SHOUT.shareUnknown}
        </li>
        <li>
          <IconCheck />
          {known ? SHOUT.typical(b!.typical) : SHOUT.typicalUnknown}
        </li>
        <li>
          <IconCheck />
          {SHOUT.returns}
        </li>
      </ul>
      <div className="dk-sp-acts">
        {member ? (
          <Link className="btn dk-btn-green" to="/thriftplus">
            My Thrift+
          </Link>
        ) : (
          <Link className="btn dk-btn-green" to={JOIN_HREF}>
            Join free
          </Link>
        )}
        <button type="button" className="btn dk-sp-ex" onClick={() => setExample(true)}>
          Example
        </button>
      </div>
      {example ? <ThriftBucksExample onClose={() => setExample(false)} joinHref={member ? undefined : JOIN_HREF} /> : null}
    </div>
  )
}

function Teaser() {
  return (
    <Link className="dk-sp-c dk-sp-bf" to="/visit">
      <span className="lbl">{BF_TEASER.when}</span>
      <h2 className="disp">
        Black <em>Friday</em>
      </h2>
      <p className="sub">{BF_TEASER.line}</p>
      <span className="dk-sp-more">Get directions ›</span>
    </Link>
  )
}

function Boho({ when }: { when: string }) {
  return (
    <Link className="dk-sp-c dk-sp-boho" to="/store?cat=apparel">
      <span className="lbl">{BOHO.label}</span>
      <h2 className="disp">BO-HO-GO</h2>
      <div className="dk-sp-steps">
        {BOHO.steps.map(([k, v]) => (
          <div key={k}>
            <b className="disp">{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="dk-sp-pair">
        <ul className="tn">
          {BOHO.pair.map(([name, was]) => (
            <li key={name}>
              {name} <s>{was}</s>
            </li>
          ))}
        </ul>
        <div className="dk-sp-both">
          <Tag price={BOHO.both} cents="auto" deal />
          <small>for both</small>
        </div>
      </div>
      <p className="dk-sp-when">{when}</p>
    </Link>
  )
}

function Returns() {
  return (
    <Link className="dk-sp-c dk-sp-ret" to="/returns">
      <span className="lbl">{RETURNS_CARD.label}</span>
      <h2 className="disp">
        {RETURNS_CARD.head}
        <em>{RETURNS_CARD.who}</em>
      </h2>
      <div className="pct disp tn">
        {RETURNS_CARD.pct}
        <small>{RETURNS_CARD.pctLine}</small>
      </div>
    </Link>
  )
}

export default function Specials({ now = Date.now() }: { now?: number }) {
  const teaser = now < BF_TEASER_ENDS
  const boho = BOHO.on && now < BOHO_ENDS
  const n = 2 + (teaser ? 1 : 0) + (boho ? 1 : 0)
  return (
    <section className="dk-w dk-sp" id="top" aria-label="Specials" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <Shout />
      {teaser ? <Teaser /> : null}
      {boho ? <Boho when={now < BOHO_STARTS ? 'Starts Fri Nov 27' : 'Through Dec 31'} /> : null}
      <Returns />
    </section>
  )
}
