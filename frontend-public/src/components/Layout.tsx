import { Link, NavLink, Outlet } from 'react-router-dom'
import logoFooterImg from '../assets/logo-full-white-halfsize.png'
import logoImg from '../assets/logo-full-halfsize.png'
import { useAuth } from '../auth'
import { useCareers } from '../careers/api'
import { useCart } from '../cart'
import { retailMapsDirectionsUrl, STORE } from '../data/content'
import { useStoreHoursLabel } from '../lib/storeHours'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import AnnouncementBanner from './AnnouncementBanner'
import CartDrawer from './CartDrawer'

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined)

/**
 * The Thrift+ price scanner, one tap from every page (owner, 2026-10-08). A plain link: /scan is the
 * scanner app, a separate page. Shown only while Thrift+ is open.
 */
function PriceCheckLink() {
  return (
    <a className="btn btn--scan" href="/scan" title="Point your phone at any price tag to see its Member Price">
      <svg className="btn--scan__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 12h10" />
      </svg>
      <span>Price check</span>
    </a>
  )
}

export default function Layout() {
  const { config, loading } = useOnlineSalesConfig()
  const hoursLabel = useStoreHoursLabel()
  const { count, setOpen } = useCart()
  const { user, isLoading: authLoading } = useAuth()
  // The Careers link shows only while the careers page is public (never from a preview link).
  const { careers } = useCareers()
  const hiringOn = !!careers?.public && !careers.preview && careers.jobs.length > 0
  // Treat config load as indeterminate - don't flash "under construction" when shop is on.
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
              Website is under construction - online listings and holds are not available yet.
            </span>
          </div>
        </div>
      )}

      <AnnouncementBanner />
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
            {hiringOn && (
              <NavLink to="/careers" className={navClass}>
                Careers
              </NavLink>
            )}
          </nav>
          <div className="tools">
            {config.thrift_plus_open && <PriceCheckLink />}
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
            {hiringOn && <Link to="/careers">Careers</Link>}
            <a href={`mailto:${STORE.email}`}>Contact</a>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms</Link>
          </div>
          <div>
            <h4>Visit</h4>
            <p>{STORE.retail.address}</p>
            <p>{hoursLabel}</p>
            <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
            <a href={retailMapsDirectionsUrl()} target="_blank" rel="noreferrer">
              Get directions
            </a>
          </div>
        </div>
        <div className="ftbar">
          <div className="wrap">
            <span>
              © 2026 Eco-Thrift · <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
            </span>
            <span>{STORE.tagline}</span>
          </div>
        </div>
      </footer>
    </>
  )
}
