/**
 * The desktop header (Dash Update #211): the same two rows at the same height on every page, never a phone part (no
 * menu button, no bottom bar, no phone search row). Row one: the big logo, search, the store (open or not), the account.
 * Row two: every section of the site, always visible.
 *
 * Search works as on the phone (phone/shell/TopBar.tsx): Enter or the button opens /store?q=; on /store the box IS the
 * store's query (typing updates `?q=` with replace); a tag number (6 or 7 digits) opens that tag on /scan, which on a
 * computer is the tag-number page (pages/Scan.tsx).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useHome } from '../../phone/lib/boot'
import { bucks } from '../../phone/lib/format'
import { useOpenStatus } from '../../phone/lib/hours'
import { useMember } from '../../phone/lib/member'
import { IconClear, IconPerson, IconPin, IconScan, IconSearch } from '../../phone/shell/icons'
import { asset } from '../../phone/shell/Tag'
import { tagSku } from '../../phone/shell/TopBar'
import { NAV, SUB_NAV, navOn } from '../words'

function Search() {
  const loc = useLocation()
  const nav = useNavigate()
  const onStore = loc.pathname === '/store' || loc.pathname === '/store/'
  const urlQ = onStore ? new URLSearchParams(loc.search).get('q') || '' : ''
  const [local, setLocal] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const text = onStore ? urlQ : local

  // Leaving a page clears what was typed there (the store page shows its own query instead).
  const shownOn = useRef(loc.pathname)
  useEffect(() => {
    if (shownOn.current === loc.pathname) return
    shownOn.current = loc.pathname
    setLocal('')
  }, [loc.pathname])

  function type(value: string) {
    if (!onStore) return setLocal(value)
    const next = new URLSearchParams(loc.search)
    if (value) next.set('q', value)
    else next.delete('q')
    const s = next.toString()
    nav({ pathname: '/store', search: s ? `?${s}` : '' }, { replace: true })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const sku = tagSku(text)
    if (sku) {
      nav(`/scan?tag=${sku}`)
      return
    }
    if (onStore) return
    const t = text.trim()
    nav(t ? `/store?q=${encodeURIComponent(t)}` : '/store')
  }

  return (
    <form className={`dk-find${text ? ' has' : ''}`} role="search" onSubmit={submit} action="/store">
      <input
        ref={input}
        name="q"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search the store"
        aria-label="Search the store"
        value={text}
        onChange={(e) => type(e.target.value)}
      />
      <button type="button" className="clr" aria-label="Clear search" tabIndex={-1} onClick={() => { type(''); input.current?.focus() }}>
        <IconClear />
      </button>
      <button type="submit" className="go">
        <IconSearch />
        Search
      </button>
    </form>
  )
}

function Store() {
  const open = useOpenStatus(useHome()?.hours)
  return (
    <Link className="dk-store" to="/visit" aria-label={`${open.label}. 8425 W Center Rd. Visit`}>
      <IconPin />
      <span>
        <b className={`tn${open.open ? '' : ' shut'}`}>
          <i />
          {open.label}
        </b>
        <small>8425 W Center Rd, Omaha</small>
      </span>
    </Link>
  )
}

/** One slot of one size whoever is looking, so nothing moves when the session answers. */
function Account() {
  const { status, member } = useMember()
  if (status === 'member' && member?.finishing) {
    return (
      <Link className="dk-acct fin" to="/account/sign-in?view=finish">
        Finish joining
      </Link>
    )
  }
  if (status === 'member' && member) {
    const amount = bucks(member.bucks)
    return (
      <Link className="dk-acct in" to="/thriftplus" aria-label={`Thrift+: ${amount} ThriftBucks`}>
        <small>ThriftBucks</small>
        <b className="tn">{amount}</b>
      </Link>
    )
  }
  return (
    <Link className={`dk-acct out${status === 'unknown' ? ' wait' : ''}`} to="/account/sign-in">
      <IconPerson />
      Sign in
    </Link>
  )
}

export function Header() {
  const loc = useLocation()
  return (
    <header className="dk-head">
      <div className="dk-w dk-r1">
        <Link className="dk-logo" to="/" aria-label="Eco-Thrift home">
          <img src={asset('phone/eco-thrift-logo-white.svg')} width={212} height={52} alt="Eco-Thrift" decoding="async" />
        </Link>
        <Search />
        <Store />
        <Account />
      </div>
      <div className="dk-r2">
        <div className="dk-w dk-nav">
          <nav aria-label="Shop">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className={`${n.scan ? 'scan ' : ''}${navOn(n.to, loc.pathname, loc.search) ? 'on' : ''}`.trim() || undefined}
                aria-current={navOn(n.to, loc.pathname, loc.search) ? 'page' : undefined}>
                {n.scan ? <IconScan /> : null}
                {n.name}
              </Link>
            ))}
          </nav>
          <nav className="sub" aria-label="Help and info">
            {SUB_NAV.map((n) => (
              <Link key={n.to} to={n.to} className={navOn(n.to, loc.pathname, loc.search) ? 'on' : undefined}
                aria-current={navOn(n.to, loc.pathname, loc.search) ? 'page' : undefined}>
                {n.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
