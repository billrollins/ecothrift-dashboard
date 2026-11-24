/**
 * /scan on a computer (Dash Update #211; Mainline's call for the owner, 11-24): no camera here. A tag-number box that
 * shows that tag's price (the scanner's own public look-up, `GET /api/thriftplus/public/tag/<SKU>/`, asked as a "second
 * look" so a computer never counts as an in-store scan), and beside it a QR and the words to scan in the store with a
 * phone at ecothrift.us/scan.
 *
 * The scanner's addresses still work when they land on a computer: `?tag=` looks that tag up; `?view=join` opens the
 * desktop join; `?view=qr|card|bucks|account` the member's /thriftplus; `?view=finish` the finish screen; `?signin=`
 * (an emailed sign-in link opened on a computer) signs in once, then /thriftplus.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { bucks, money } from '../../phone/lib/format'
import { lookupTag } from '../../phone/scan/api'
import type { TagLookup } from '../../phone/scan/core'
import { CardQr } from '../../phone/scan/member/Qr'
import { handoverTo, showOfView } from '../../phone/scan/route'
import { actions, useAction } from '../../phone/scan/store'
import { Tag } from '../../phone/shell/Tag'
import { tagSku } from '../../phone/shell/TopBar'
import { useSeo } from '../../useSeo'
import { useDeskDay } from '../lib/day'
import { BF_PRICE, SCAN } from '../words'
import './scan.css'

/** What was typed as the scanner's SKU: 6 or 7 digits, or a full `ITM0123456`; else null. */
export function skuOf(text: string): string | null {
  const t = text.trim().toUpperCase()
  if (/^ITM\d{7}$/.test(t)) return t
  return tagSku(t)
}

/** Where a scanner address goes on a computer, or null to stay on this page. */
export function deskScanRedirect(params: URLSearchParams): string | null {
  const view = params.get('view')
  if (view === 'join') return '/account/sign-in?view=join'
  if (view === 'finish') return '/account/sign-in?view=finish'
  const show = showOfView(view)
  if (show) return handoverTo(show)
  return null
}

function Result({ r }: { r: TagLookup }) {
  const day = useDeskDay()
  if (r.status === 'not_found') return <div className="dk-sc-res miss">{SCAN.notFound}</div>
  if (r.status !== 'found') return <div className="dk-sc-res miss">{'message' in r && r.message ? r.message : SCAN.error}</div>
  const it = r.item
  const price = Number(it.price) || 0
  const retail = Number(it.retail_price ?? 0) || 0
  const tb = Number(it.reward) || 0
  return (
    <div className="dk-sc-res" data-testid="scan-result">
      <p className="dk-kick">
        {it.category_label} · Tag {it.sku.replace(/^ITM/, '')}
      </p>
      <h2>{it.title}</h2>
      <div className="dk-sc-nums">
        <Tag price={price} />
        <div>
          <span className="dk-strike tn">{retail > price ? <>Retail <s>{money(retail)}</s></> : null}</span>
          {day === 'bf' || (it as { black_friday?: boolean }).black_friday ? (
            <span className="dk-tb bf">{BF_PRICE}</span>
          ) : (
            <span className={`dk-tb tn${tb > 0 ? '' : ' none'}`}>{tb > 0 ? `+ ${bucks(tb)} ThriftBucks` : '0.00 ThriftBucks'}</span>
          )}
        </div>
      </div>
      <p className="dk-sc-facts">
        <span>{it.returnable ? 'Thrift+ 3-day returns' : 'AS IS · no returns'}</span>
        {it.available ? null : <span className="gone">{SCAN.gone}</span>}
      </p>
    </div>
  )
}

export default function Scan() {
  useSeo({ title: 'Scan a tag', path: '/scan' })
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [text, setText] = useState(() => (params.get('tag') || '').replace(/^ITM0?/i, ''))
  const [res, setRes] = useState<TagLookup | null>(null)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState(false)
  const link = useAction(actions.signInWithLink)
  const linkTried = useRef('')

  async function look(sku: string) {
    setBusy(true)
    setBad(false)
    const r = await lookupTag(sku, { again: true })
    setRes(r)
    setBusy(false)
  }

  // ?tag= from the header's search or a tag's QR opened on a computer.
  const tagParam = params.get('tag')
  useEffect(() => {
    const sku = tagParam ? skuOf(tagParam) : null
    if (sku) void look(sku)
  }, [tagParam])

  // An emailed sign-in link opened on a computer: signs in once, then the member's page.
  const token = params.get('signin')
  useEffect(() => {
    if (!token || linkTried.current === token) return
    linkTried.current = token
    void link
      .run(token)
      .then(() => nav('/thriftplus', { replace: true }))
      .catch(() => nav('/account/sign-in?link=used', { replace: true }))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const to = deskScanRedirect(params)
  if (to) return <Navigate to={to} replace />

  function submit(e: FormEvent) {
    e.preventDefault()
    const sku = skuOf(text)
    if (!sku) {
      setBad(true)
      setRes(null)
      return
    }
    setParams({ tag: sku }, { replace: true })
    if (sku === tagParam) void look(sku)
  }

  return (
    <div className="dk-w dk-sc">
      <div className="dk-pt">
        <p className="dk-kick">Prices</p>
        <h1 className="disp">{SCAN.head}</h1>
        <p>{SCAN.line}</p>
      </div>
      <div className="dk-sc-grid">
        <section className="dk-card dk-sc-box" aria-label="Look up a tag">
          <form onSubmit={submit} className={`dk-sc-form${bad ? ' bad' : ''}`}>
            <label htmlFor="dk-sc-in" className="dk-kick">
              Tag number
            </label>
            <div>
              <input id="dk-sc-in" inputMode="numeric" autoComplete="off" placeholder="0227851" value={text}
                onChange={(e) => setText(e.target.value)} className="tn" />
              <button type="submit" className="btn btn-ink" disabled={busy}>
                See the price
              </button>
            </div>
            <p className="dk-sc-msg">{bad ? SCAN.bad : SCAN.where}</p>
          </form>
          <div className="dk-sc-slot">{res ? <Result r={res} /> : <div className="dk-sc-res empty" aria-hidden="true" />}</div>
        </section>
        <aside className="dk-card dk-sc-phone">
          <div className="dk-sc-qr">
            <CardQr text={SCAN.phoneUrl} testId="scan-qr" />
          </div>
          <h2 className="dk-h">{SCAN.phoneHead}</h2>
          <p>{SCAN.phoneLine}</p>
          <Link className="dk-sc-more" to="/thriftplus">
            What is Thrift+ ›
          </Link>
        </aside>
      </div>
    </div>
  )
}
