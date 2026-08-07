import { Link } from 'react-router-dom'
import { money, type CatalogItem } from '../api'

type Props = {
  items: CatalogItem[]
  onAdd?: (item: CatalogItem) => void
  showAdd?: boolean
  /** First N images load eagerly (e.g. first row); rest stay lazy. */
  eagerCount?: number
  className?: string
}

export default function ProductGrid({
  items,
  onAdd,
  showAdd = true,
  eagerCount = 0,
  className,
}: Props) {
  if (!items.length) return null
  const gridClass = ['prodgrid', className].filter(Boolean).join(' ')
  return (
    <div className={gridClass}>
      {items.map((it, index) => (
        <div className="prodcard" key={it.id}>
          <Link to={`/shop/${it.slug}`} className="prodthumb">
            {it.image ? (
              <img
                src={it.image.url}
                alt={it.image.alt || it.title}
                width={400}
                height={300}
                loading={index < eagerCount ? 'eager' : 'lazy'}
              />
            ) : (
              <span className="ph g3" />
            )}
            {it.on_sale && it.available > 0 && <span className="badge sale">Sale</span>}
            {it.available <= 0 && <span className="badge reserved">Reserved</span>}
          </Link>
          <div className="prodbody">
            {it.category_name && <div className="prodcat">{it.category_name}</div>}
            <Link to={`/shop/${it.slug}`} className="prodtitle">
              {it.title}
            </Link>
            <div className="prodmeta">{it.condition_display}</div>
            <div className="prodprice">
              {money(it.price)}
              {it.on_sale && it.compare_at_price && (
                <span className="was">{money(it.compare_at_price)}</span>
              )}
            </div>
            {showAdd && onAdd && (
              <button
                type="button"
                className="btn btn--primary prodadd"
                disabled={it.available <= 0}
                onClick={() => onAdd(it)}
              >
                {it.available > 0 ? 'Add to hold list' : 'Reserved'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
