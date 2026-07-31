import { Link, NavLink, Outlet } from 'react-router-dom'
import logoFooterImg from '../assets/logo-full-white-halfsize.png'
import logoImg from '../assets/logo-full-halfsize.png'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { retailMapsDirectionsUrl, STORE } from '../data/content'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import CartDrawer from './CartDrawer'

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined)

export default function Layout() {
  const { config, loading } = useOnlineSalesConfig()
  const { count, setOpen } = useCart()
  const { user, isLoading: authLoading } = useAuth()
  // Treat config load as indeterminate — don't flash "under construction" when shop is on.
  const shopOn = config.online_sales_enabled
  const accountsOn = config.accounts_enabled
  const showUnderConstruction = !loading && !shopOn
  const accountLabel = authLoading ? 'Account' : user ? 'Account' : 'Sign in'
  const accountHref = !authLoading && user ? '/account' : '/account/sign-in'

  return (
    <>
      {showUnderConstruction && (
        <div className="util" role="status" aria-live="polite">
          <div className="wrap">
            <span className="util-badge">Under construction</span>
            <span className="util-msg">
              Website is under construction — online listings and holds are not available yet.
            </span>
          </div>
        </div>
      )}

      <header className="hdr">
        <div className="wrap">
          <Link className="logorow" to="/">
            <img className="logo" src={logoImg} alt="Eco-Thrift" width={244} height={60} />
          </Link>
          <nav className="nav">
            {!loading && shopOn && (
              <NavLink to="/shop" className={navClass}>
                Shop
              </NavLink>
            )}
            <NavLink to="/blog" className={navClass}>
              Blog
            </NavLink>
            <NavLink to="/sell" className={navClass}>
              Sell
            </NavLink>
            <NavLink to="/visit" className={navClass}>
              Visit
            </NavLink>
          </nav>
          <div className="tools">
            {loading ? null : shopOn ? (
              <>
                {accountsOn && (
                  <Link className="btn btn--ghost" to={accountHref}>
                    {accountLabel}
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setOpen(true)}
                  aria-label={count > 0 ? `Hold list, ${count} items` : 'Hold list'}
                >
                  Hold list{count > 0 ? ` (${count})` : ''}
                </button>
                <Link className="btn btn--primary" to="/shop">
                  Shop
                </Link>
              </>
            ) : (
              <Link className="btn btn--primary" to="/visit">
                Visit the store
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      {shopOn && <CartDrawer />}

      <footer className="ft">
        <div className="wrap">
          <div>
            <img className="ftlogo" src={logoFooterImg} alt="Eco-Thrift" width={220} height={54} />
            <p>Liquidation and thrift in Omaha, Nebraska.</p>
            <p>{STORE.tagline}</p>
          </div>
          <div>
            <h4>Store</h4>
            {shopOn && <Link to="/shop">Shop</Link>}
            <Link to="/visit">Visit us</Link>
            <Link to="/sell">Sell with us</Link>
            <Link to="/blog">Blog</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link to="/blog/navigating-growth">Our story</Link>
            <Link to="/blog">Blog</Link>
            <a href={`mailto:${STORE.email}`}>Contact</a>
          </div>
          <div>
            <h4>Visit</h4>
            <p>{STORE.retail.address}</p>
            <p>{STORE.retail.hours}</p>
            <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
            <a href={retailMapsDirectionsUrl()} target="_blank" rel="noreferrer">
              Get directions
            </a>
          </div>
        </div>
        <div className="ftbar">
          <div className="wrap">
            <span>© 2026 Eco-Thrift</span>
            <span>{STORE.tagline}</span>
          </div>
        </div>
      </footer>
    </>
  )
}
