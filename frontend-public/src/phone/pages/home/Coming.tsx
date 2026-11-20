/**
 * Home 5, on the truck (mockup blocks/50-coming.html): pieces on trucks that are paid for and not here yet (the feed's
 * `coming`). The picture area is a calm text tile (the category in small capitals): the feed gives a truck piece no
 * photo of its own, and a card never shows a stand-in picture (owner 11-19). Then the name, "Retail $..." when the
 * truck's list gives one, the truck as a small label. Never a tag price: a piece is priced when it is checked in.
 */
import { Link } from 'react-router-dom'
import { useHome, type ComingItem, type Truck } from '../../lib/boot'
import { money } from '../../lib/format'
import { catName } from '../../lib/stock'
import './Coming.css'

function Card({ it, truck }: { it: ComingItem; truck: Truck | undefined }) {
  return (
    <Link className="pc" to={`/store/item/m${it.id}`}>
      <div className="ph-img ph-txt">
        <span className="lbl ph-cat">{catName(it.cat)}</span>
        {truck ? <span className="cm-chip lbl">{truck.name}</span> : null}
      </div>
      <p className="nm">{it.name}</p>
      <p className="cm-rt tn">
        {it.retail > 0 ? (
          <>
            Retail <b>{money(it.retail)}</b>
          </>
        ) : null}
      </p>
    </Link>
  )
}

export default function Coming() {
  const feed = useHome()
  const items = feed?.coming?.items || []
  if (!items.length) return null
  const trucks = new Map((feed?.coming.trucks || []).map((t) => [t.id, t]))
  return (
    <section className="cm" id="coming">
      <div className="sh">
        <h2>On the truck</h2>
        <Link className="cm-n" to="/store?where=coming">
          See all
        </Link>
      </div>
      <div className="rail">
        {items.map((it) => (
          <Card key={it.id} it={it} truck={trucks.get(it.truck)} />
        ))}
      </div>
    </section>
  )
}
