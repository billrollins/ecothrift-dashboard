/**
 * Categories on a computer (Dash Update #211): every category as a picture tile with its count, biggest first, mixed
 * lots last (the phone's order: phone/pages/Categories.tsx `orderCats`). Until the stock is here the tiles stand in the
 * last known order with their badges kept but invisible, so nothing shifts when the counts arrive.
 */
import { Link } from 'react-router-dom'
import { useHome } from '../../phone/lib/boot'
import { count } from '../../phone/lib/format'
import { useStock } from '../../phone/lib/stock'
import { orderCats } from '../../phone/pages/Categories'
import { catPic } from '../../phone/shell/pictures'
import { useSeo } from '../../useSeo'
import '../pages/home/home.css'
import './info.css'

export default function Categories() {
  useSeo({ title: 'Categories', path: '/categories' })
  const feed = useHome()
  const { stock } = useStock()
  const cats = orderCats(stock?.cats)
  const pieces = feed?.shelf.pieces
  return (
    <div className="dk-w dk-info">
      <div className="dk-pt">
        <p className="dk-kick">
          <span className="tn" style={pieces === undefined ? { opacity: 0 } : undefined}>
            {pieces === undefined ? '0' : count(pieces)}
          </span>{' '}
          items in store today
        </p>
        <h1 className="disp">{cats.length} categories</h1>
      </div>
      <div className="dk-cg">
        {cats.map((c) => {
          const pic = catPic(c.id)
          const other = c.id === 'other'
          return (
            <Link key={c.id} className={`dk-cat${other ? ' other' : ''}`} to={`/store?cat=${encodeURIComponent(c.id)}`}>
              <b>{c.name}</b>
              {pic && !other ? <img src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" /> : null}
              <span className="cnt tn fade" style={c.pieces === null ? { opacity: 0 } : undefined}>
                {c.pieces === null ? '0' : count(c.pieces)}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
