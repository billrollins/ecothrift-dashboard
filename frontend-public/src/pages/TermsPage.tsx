import QRCode from 'qrcode'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import LangToggle from '../components/LangToggle'
import ScanIcon from '../components/ScanIcon'
import { SITE_URL, STORE } from '../data/content'
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, NO_TEXTS } from '../data/legal'
import { THRIFT_PLUS_ABOUT_LINE } from '../data/thriftPlusAbout'
import { THRIFT_PLUS_TERMS, type TermsButton, type TermsClause } from '../data/thriftPlusTerms'
import { useThriftPlusLang, withLangFromAddress } from '../lib/thriftPlusLang'
import { useThriftPlusOpen } from '../thriftPlusOpen'
import { useSeo } from '../useSeo'
import './TermsPage.css'

/**
 * ecothrift.us/terms: the Thrift+ terms (every poster's footer QR), English | Español, then the store terms
 * (the website and the emails we send). Words: data/thriftPlusTerms*.ts, copied from
 * .ai/reference/thrift-plus-terms/terms-en.md and terms-es.md. Anchors #s1 to #s12 (returns: #s8); #store-terms.
 * The language order and the toggle are shared with /thriftplus (lib/thriftPlusLang.ts).
 */

/** The section a hash points at (#s1 … #s12, #store-terms); '' for none or a language hash. */
function sectionFromHash(hash: string): string {
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  return /^s([1-9]|1[0-2])$/.test(id) || id === 'store-terms' ? id : ''
}

// §8, §8.5 → the section's anchor; ecothrift.us(/join) → that page; the store phone → a call.
const INLINE_LINK = /(§(\d+)(?:\.\d+)?)|(ecothrift\.us(\/[a-z]+)?)|(\(402\) 881-9861)/g

function Linked({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE_LINK)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    if (m[1]) {
      out.push(
        <a key={at} href={`#s${m[2]}`}>
          {m[1]}
        </a>,
      )
    } else if (m[3]) {
      out.push(
        <a key={at} href={m[4] || '/'}>
          {m[3]}
        </a>,
      )
    } else {
      out.push(
        <a key={at} href={`tel:${STORE.retail.phoneHref}`}>
          {m[5]}
        </a>,
      )
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function QrCode({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((out) => {
        if (live) setSvg(out)
      })
      .catch(() => {
        if (live) setSvg('')
      })
    return () => {
      live = false
    }
  }, [value])
  return <div className="tp-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}

function BigButton({ button, icon }: { button: TermsButton; icon?: ReactNode }) {
  return (
    <div className="tp-go">
      {/* /scan and /join are their own pages, not routes of this site: plain links. */}
      <a className="btn btn--primary btn--xl tp-go__btn" href={button.href}>
        {icon}
        <span>{button.label}</span>
      </a>
      <div className="tp-go__qr">
        <QrCode value={button.qrUrl} label={button.qrAlt} />
        <span className="tp-go__url">{button.caption}</span>
      </div>
    </div>
  )
}

function Clause({ clause }: { clause: TermsClause }) {
  const lead = (
    <>
      {clause.n && <span className="tp-clause__n">{clause.n}</span>}
      {clause.n && ' '}
      {clause.label && <strong>{clause.label}</strong>}
      {clause.label && clause.text && ' '}
      {clause.text && <Linked text={clause.text} />}
    </>
  )
  if (!clause.steps && !clause.points) return <p className="tp-clause">{lead}</p>
  return (
    <div className="tp-clause">
      <p>{lead}</p>
      {clause.steps && (
        <ol>
          {clause.steps.map((step) => (
            <li key={step}>
              <Linked text={step} />
            </li>
          ))}
        </ol>
      )}
      {clause.points && (
        <ul>
          {clause.points.map((point) => (
            <li key={point.label}>
              <strong>{point.label}</strong> <Linked text={point.text} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The store terms: the website and the emails we send (email-first, D20). See data/legal.ts. The page's terms
 * before Thrift+ (10-08), kept word for word as the page's last section (#store-terms), in English.
 */
function StoreTerms({ title, highlighted }: { title: string; highlighted: boolean }) {
  return (
    <section
      id="store-terms"
      className={`tp-store${highlighted ? ' is-target' : ''}`}
      lang="en"
      aria-labelledby="store-terms-title"
    >
      <h2 id="store-terms-title" className="tp-h2 tp-h2--quiet">
        {title}
      </h2>
      <p className="articledate">Last updated: {LEGAL_LAST_UPDATED}</p>

      <div className="abody tp-store__body">
        <p>
          These terms cover the Eco-Thrift website ({SITE_URL}) and the emails we send. Both are run by{' '}
          {LEGAL_ENTITY}.
        </p>

        <h3>Emails</h3>
        <ul>
          <li>
            <strong>Who sends:</strong> Eco-Thrift ({LEGAL_ENTITY}), from{' '}
            <a href={`mailto:${STORE.email}`}>{STORE.email}</a>.
          </li>
          <li>
            <strong>Always:</strong> the emails something you did needs, such as a receipt, an online hold, a
            Thrift+ return, or a job application you sent us (interview times, reminders, and your first day if
            you&rsquo;re hired).
          </li>
          <li>
            <strong>Thrift+ members who give us an email:</strong> their Thrift+ updates (ThriftBucks,
            receipts and returns), and store news (new arrivals and sales).
          </li>
          <li>
            <strong>Stopping store news:</strong> every store news email has an unsubscribe link, and we honor it
            promptly. Thrift+ members can also turn store news off in their Thrift+ account or at any register.
          </li>
          <li>
            <strong>Giving an email is optional</strong>, and never a condition of purchase or of joining Thrift+.
          </li>
          <li>
            <strong>Privacy:</strong> see our <Link to="/privacy">Privacy Policy</Link> at {SITE_URL}/privacy.
          </li>
        </ul>

        <h3>Text messages</h3>
        <p data-testid="terms-no-texts">{NO_TEXTS}</p>
        <ul data-testid="terms-sms">
          <li>
            <strong>Who sends:</strong> Eco-Thrift ({LEGAL_ENTITY}), from its own toll-free number.
          </li>
          <li>
            <strong>What:</strong> a one-time Thrift+ sign-in code or sign-in link, when you ask for it in the Thrift+
            app, on {SITE_URL}, or at the register.
          </li>
          <li>
            <strong>How often:</strong> one text each time you ask. No marketing texts.
          </li>
          <li>
            <strong>Message and data rates may apply.</strong>
          </li>
          <li>
            <strong>Stop or get help:</strong> reply STOP to any text and we send no more; reply HELP for help, or call{' '}
            <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a> or email{' '}
            <a href={`mailto:${STORE.email}`}>{STORE.email}</a>.
          </li>
          <li>
            <strong>Texts are optional</strong>, and never a condition of purchase or of joining Thrift+ (you can sign
            in with Google instead).
          </li>
          <li>
            <strong>Privacy:</strong> we do not share mobile numbers or text-message consent with third parties or
            affiliates for marketing or promotional purposes. See our <Link to="/privacy">Privacy Policy</Link>.
          </li>
        </ul>

        <h3>Contact</h3>
        <p>
          {LEGAL_ENTITY}
          <br />
          {STORE.retail.address}
          <br />
          <a href={`tel:${STORE.retail.phoneHref}`}>{STORE.retail.phone}</a>
          <br />
          <a href={`mailto:${STORE.email}`}>{STORE.email}</a>
        </p>
      </div>
    </section>
  )
}

/** Public Terms: Thrift+ first (English | Español), then the store terms. */
export default function TermsPage() {
  const location = useLocation()
  // ?lang=, the remembered toggle, a Spanish phone, English; <html lang> follows (shared with /thriftplus).
  const [lang, choose] = useThriftPlusLang()
  const t = THRIFT_PLUS_TERMS[lang]
  const target = sectionFromHash(location.hash)
  const pageRef = useRef<HTMLDivElement>(null)
  // "New to Thrift+? See what it is →" only while Thrift+ is open (website spec, 10-15).
  const { open: thriftPlusOpen } = useThriftPlusOpen()

  useSeo({ title: t.ui.seoTitle, description: t.ui.seoDescription, path: '/terms' })

  // The header is sticky and taller on phones: section anchors stop just below it.
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>('.hdr')
    const page = pageRef.current
    if (!header || !page) return
    const apply = () =>
      page.style.setProperty('--tp-anchor-gap', `${Math.ceil(header.getBoundingClientRect().height) + 12}px`)
    apply()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply)
      return () => window.removeEventListener('resize', apply)
    }
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // The page loads after the browser looked for #s8, so scroll there ourselves; once more after late layout
  // (web fonts, the announcement bar), unless the reader has moved.
  useEffect(() => {
    if (!target) return
    const el = document.getElementById(target)
    if (!el) return
    let landedAt = -1
    const go = () => {
      el.scrollIntoView({ block: 'start' })
      landedAt = window.scrollY
    }
    const frame = window.requestAnimationFrame(go)
    const settle = window.setTimeout(() => {
      if (window.scrollY === landedAt) go()
    }, 600)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [target])

  return (
    <div className="tp" ref={pageRef} lang={lang}>
      <div className="wrap tp__wrap">
        <div className="tp__top">
          <div className="crumb tp__crumb">
            <Link to="/">{t.ui.home}</Link> / <span>{t.ui.terms}</span>
          </div>
          <LangToggle lang={lang} label={t.ui.languageGroup} onChoose={choose} />
        </div>

        {thriftPlusOpen && (
          <p className="tp-about">
            <Link to={withLangFromAddress('/thriftplus', location.search)}>{THRIFT_PLUS_ABOUT_LINE[lang]}</Link>
          </p>
        )}

        <header className="tp-hero">
          <h1 className="tp-hero__title">{t.hero.title}</h1>
          <p className="tp-hero__tagline">{t.hero.tagline}</p>
        </header>

        {t.courtesyNote && (
          <p className="tp-note" role="note">
            {t.courtesyNote}
          </p>
        )}

        <section className="tp-block" aria-labelledby="tp-know">
          <h2 id="tp-know" className="tp-h2">
            {t.needToKnowTitle}
          </h2>
          <ul className="tp-know">
            {t.needToKnow.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong> {item.text}
              </li>
            ))}
          </ul>
        </section>

        <div className="tp-gos">
          <BigButton button={t.buttons.scan} icon={<ScanIcon />} />
          <BigButton button={t.buttons.join} />
        </div>

        <section className="tp-block" aria-labelledby="tp-chart">
          <h2 id="tp-chart" className="tp-h2">
            {t.chartTitle}
          </h2>
          <table className="tp-chart">
            <thead>
              <tr>
                <th scope="col">{t.chartHead.num}</th>
                <th scope="col">{t.chartHead.what}</th>
                <th scope="col">{t.chartHead.short}</th>
                <th scope="col">{t.chartHead.terms}</th>
              </tr>
            </thead>
            <tbody>
              {t.chart.map((row, i) => {
                const newGroup = i > 0 && row.num[0] !== t.chart[i - 1].num[0]
                return (
                  <tr key={row.num} className={newGroup ? 'tp-chart__group' : undefined}>
                    <td className="tp-chart__num">
                      <a href={`#s${row.section}`}>{row.num}</a>
                    </td>
                    <th scope="row" className="tp-chart__what">
                      {row.what}
                    </th>
                    <td className="tp-chart__short">{row.short}</td>
                    <td className="tp-chart__terms">
                      <a href={`#s${row.section}`}>§{row.section}</a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="tp-block" aria-labelledby="tp-faq">
          <h2 id="tp-faq" className="tp-h2">
            {t.faqTitle}
          </h2>
          <div className="tp-faq">
            {t.faq.map((item) => (
              <details key={item.q} className="tp-faq__item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {t.perks.length > 0 && (
          <section className="tp-block" aria-labelledby="tp-perks">
            <h2 id="tp-perks" className="tp-h2">
              {t.perksTitle}
            </h2>
            <ul className="tp-know tp-know--perks">
              {t.perks.map((perk) => (
                <li key={perk.label}>
                  <strong>{perk.label}</strong> <Linked text={perk.text} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="tp-full" aria-labelledby="tp-full">
          <div className="tp-full__head">
            <h2 id="tp-full" className="tp-h2 tp-h2--quiet">
              {t.fullTitle}
            </h2>
            <a className="tp-full__jump" href="#store-terms">
              {t.ui.storeTermsLink} ↓
            </a>
          </div>
          <p className="tp-full__intro">
            <strong>{t.fullIntro.label}</strong> <Linked text={t.fullIntro.text} /> ·{' '}
            <span className="tp-full__version">{t.fullIntro.version}</span>
          </p>

          {t.sections.map((section) => {
            const id = `s${section.num}`
            return (
              <section
                key={id}
                id={id}
                className={`tp-sec${target === id ? ' is-target' : ''}`}
                aria-labelledby={`${id}-title`}
              >
                <h3 id={`${id}-title`}>
                  §{section.num} {section.title}
                </h3>
                {section.clauses.map((clause, i) => (
                  <Clause key={clause.n ?? i} clause={clause} />
                ))}
              </section>
            )
          })}
        </section>

        <StoreTerms title={t.ui.storeTermsTitle} highlighted={target === 'store-terms'} />
      </div>
    </div>
  )
}
