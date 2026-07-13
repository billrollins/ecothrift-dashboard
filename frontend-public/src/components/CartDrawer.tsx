import { Link } from 'react-router-dom'
import { money } from '../api'
import { useCart } from '../cart'

export default function CartDrawer() {
  const { lines, subtotal, open, setOpen, remove, setQty, count } = useCart()

  return (
    <>
      <div
        className={`cartoverlay${open ? ' show' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <aside className={`cartdrawer${open ? ' open' : ''}`} aria-label="Shopping cart" aria-hidden={!open}>
        <div className="carthead">
          <h3>Your cart {count > 0 ? `(${count})` : ''}</h3>
          <button className="cartclose" onClick={() => setOpen(false)} aria-label="Close cart">
            ×
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="cartempty">
            <p>Your cart is empty.</p>
            <Link className="btn btn--primary" to="/shop" onClick={() => setOpen(false)}>
              Browse the shop
            </Link>
          </div>
        ) : (
          <>
            <div className="cartlines">
              {lines.map((l) => (
                <div className="cartline" key={l.slug}>
                  <Link to={`/shop/${l.slug}`} className="cartthumb" onClick={() => setOpen(false)}>
                    {l.image ? <img src={l.image} alt={l.title} /> : <span className="ph g3" />}
                  </Link>
                  <div className="cartline-main">
                    <Link to={`/shop/${l.slug}`} className="cartline-title" onClick={() => setOpen(false)}>
                      {l.title}
                    </Link>
                    <div className="cartline-price">{money(l.price)}</div>
                    <div className="cartqty">
                      <button onClick={() => setQty(l.slug, l.qty - 1)} aria-label="Decrease quantity">
                        −
                      </button>
                      <span>{l.qty}</span>
                      <button
                        onClick={() => setQty(l.slug, l.qty + 1)}
                        disabled={l.qty >= l.stock}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                      <button className="cartremove" onClick={() => remove(l.slug)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="cartfoot">
              <div className="cartsub">
                <span>Subtotal</span>
                <b>{money(subtotal)}</b>
              </div>
              <p className="cartnote">
                Request a hold online — pay and pick up in store. No shipping, delivery, or online
                payment.
              </p>
              <Link className="btn btn--primary cartcheckout" to="/checkout" onClick={() => setOpen(false)}>
                Request a hold
              </Link>
              <Link className="cartcontinue" to="/shop" onClick={() => setOpen(false)}>
                Continue shopping
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
