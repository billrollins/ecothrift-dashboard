/**
 * The top of every page (mockup shell/01-top.html): the lime strip and the store line on home only; the logo row
 * scrolls away; the search row sticks. Search: Enter or the button opens /store?q=; a tag number (6 or 7 digits) opens
 * the scanner on that tag (/scan?tag=ITM<7 digits>). On /store the box IS the store's query: typing updates `?q=`
 * (replace), so the Store page only reads `useSearchParams().get('q')`.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { bucks } from '../lib/format'
import { useOpenStatus } from '../lib/hours'
import { useMember } from '../lib/member'
import { leaveGuest, scanIsRoute } from '../scan/switch'
import { asset } from './Tag'
import { IconClear, IconMenu, IconPerson, IconPin, IconSearch } from './icons'

/** A tag number as typed (6 or 7 digits) -> the scanner's SKU, else null. */
export function tagSku(text: string): string | null {
  const t = text.trim()
  return /^\d{6,7}$/.test(t) ? `ITM${t.padStart(7, '0')}` : null
}

export function isHomePath(pathname: string): boolean {
  return pathname === '/' || pathname === '/visit' || pathname === '/visit/'
}

function Account() {
  const { status, member } = useMember()
  if (status === 'member' && member) {
    const amount = bucks(member.bucks)
    return (
      <Link className="acct fade" to="/thriftplus" aria-label={`Thrift+: ${amount} ThriftBucks`}>
        <span className="in">
          <small>ThriftBucks</small>
          <b className="tn" style={amount.length > 6 ? { fontSize: 15 } : undefined}>{amount}</b>
        </span>
      </Link>
    )
  }
  // Signed out, and the moment before we know (the same slot, invisible): sign-in is the scanner's, at /scan (a route
  // when the new scanner is on, else a full page load). A phone scanning without signing in leaves that first.
  const cls = `acct fade${status === 'unknown' ? ' wait' : ''}`
  const inner = (
    <span className="out">
      <IconPerson />
      <small>Sign in</small>
    </span>
  )
  return scanIsRoute() ? (
    <Link className={cls} to="/scan" aria-label="Sign in" onClick={leaveGuest}>
      {inner}
    </Link>
  ) : (
    <a className={cls} href="/scan" aria-label="Sign in" onClick={leaveGuest}>
      {inner}
    </a>
  )
}

function Search() {
  const loc = useLocation()
  const nav = useNavigate()
  const onStore = loc.pathname === '/store' || loc.pathname === '/store/'
  const params = new URLSearchParams(loc.search)
  const urlQ = onStore ? params.get('q') || '' : ''
  const [local, setLocal] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const text = onStore ? urlQ : local

  // Leaving a page clears what was typed there (the store page shows its own query instead). Not on the first render:
  // what someone typed while the page was starting stays.
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
      if (scanIsRoute()) {
        input.current?.blur()
        nav(`/scan?tag=${sku}`)
      } else window.location.assign(`/scan?tag=${sku}`)
      return
    }
    input.current?.blur()
    if (onStore) return
    const t = text.trim()
    nav(t ? `/store?q=${encodeURIComponent(t)}` : '/store')
  }

  return (
    <div className="find">
      <form className={`box${text ? ' has' : ''}`} role="search" onSubmit={submit} action="/store">
        <input
          ref={input}
          name="q"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Search the store"
          aria-label="Search the store"
          value={text}
          onChange={(e) => type(e.target.value)}
        />
        <button type="button" className="clr" aria-label="Clear search" tabIndex={-1} onClick={() => { type(''); input.current?.focus() }}>
          <IconClear />
        </button>
        <button type="submit" className="cam" aria-label="Search">
          <IconSearch />
        </button>
      </form>
    </div>
  )
}

export function TopBar() {
  const loc = useLocation()
  const home = isHomePath(loc.pathname)
  const feed = useHome()
  const open = useOpenStatus(feed?.hours)
  return (
    <>
      {home ? (
        <Link className="strip" to="/#thriftplus">
          <span className="if-normal">Thrift+ members collect ThriftBucks on most items</span>
          <span className="if-bf">Thrift+ members: your ThriftBucks come off today.</span>
          <b className="if-out if-normal">Join free</b>
        </Link>
      ) : null}
      <header className="top">
        <div className="row">
          <Link className="menu" to="/menu" aria-label="Menu">
            <IconMenu />
          </Link>
          <Link className="home" to="/" aria-label="Eco-Thrift home">
            <img className="logo" src={asset('phone/eco-thrift-logo-white.svg')} width={244} height={60} alt="Eco-Thrift" decoding="async" />
          </Link>
          <Account />
        </div>
      </header>
      <Search />
      {home ? (
        <Link className="storeline" to="/#visit">
          <IconPin />
          <span>Omaha · 8425 W Center Rd</span>
          <span className={`open${open.open ? '' : ' shut'}`}>
            <i />
            {open.label}
          </span>
        </Link>
      ) : null}
    </>
  )
}
