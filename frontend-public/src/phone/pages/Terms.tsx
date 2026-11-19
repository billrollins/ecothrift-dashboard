/**
 * /terms on the phone site: the Thrift+ terms (English | Español) then the store terms, in the kit's look.
 * The words are the reviewed ones and are not edited here: data/thriftPlusTerms*.ts (both languages), data/legal.ts,
 * and the store terms copied word for word from pages/TermsPage.tsx (the current site's page, which the Django test
 * apps/core/tests/test_public_legal_pages.py pins; keep the two in step). Anchors #s1 to #s12 (returns #s8) and
 * #store-terms; the language order and the toggle are lib/thriftPlusLang.ts (shared with /thriftplus).
 * Phone site changes, layout only (owner 11-19: calm, nothing opens, nothing jumps): a plain contents list; the FAQ as
 * plain questions and answers; the chart as plain rows;
 * the two big buttons without their QR codes (this is the phone the QR would open); the phone number and the email as
 * selectable text (no tel: / mailto:). /join is the scanner's join view here.
 */
import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SITE_URL, STORE } from '../../data/content'
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED, NO_TEXTS } from '../../data/legal'
import { THRIFT_PLUS_ABOUT_LINE } from '../../data/thriftPlusAbout'
import { THRIFT_PLUS_TERMS, type TermsClause, type TermsLang } from '../../data/thriftPlusTerms'
import { useThriftPlusLang, withLangFromAddress } from '../../lib/thriftPlusLang'
import { useSeo } from '../../useSeo'
import { useHome } from '../lib/boot'
import { BackRow, Plain } from './legal/parts'
import './legal/legal.css'

/** The section a hash points at (#s1 … #s12, #store-terms); '' for none or a language hash. */
export function sectionFromHash(hash: string): string {
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  return /^s([1-9]|1[0-2])$/.test(id) || id === 'store-terms' ? id : ''
}

/** Where an "ecothrift.us/…" in the terms goes on the phone site (/join is the scanner's join view). */
export function siteLink(path: string | undefined): string {
  if (path === '/join') return '/scan?view=join'
  return path || '/'
}

// §8, §8.5 -> the section's anchor; ecothrift.us(/join) -> that page; the store phone -> selectable text.
const INLINE_LINK = /(§(\d+)(?:\.\d+)?)|(ecothrift\.us(\/[a-z]+)?)|(\(402\) 881-9861)/g

export function Linked({ text }: { text: string }) {
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
        <Link key={at} to={siteLink(m[4])}>
          {m[3]}
        </Link>,
      )
    } else {
      out.push(<Plain key={at}>{m[5]}</Plain>)
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function Clause({ clause }: { clause: TermsClause }) {
  const lead = (
    <>
      {clause.n && <span className="lg-cl-n">{clause.n}</span>}
      {clause.n && ' '}
      {clause.label && <strong>{clause.label}</strong>}
      {clause.label && clause.text && ' '}
      {clause.text && <Linked text={clause.text} />}
    </>
  )
  if (!clause.steps && !clause.points) return <p>{lead}</p>
  return (
    <div>
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

/** The store terms: word for word from pages/TermsPage.tsx `StoreTerms` (English only). */
function StoreTerms({ title }: { title: string }) {
  return (
    <section
      id="store-terms"
      className="lg-store lg-sec"
      lang="en"
      aria-labelledby="store-terms-title"
    >
      <h2 id="store-terms-title">{title}</h2>
      <p className="lg-date-in">Last updated: {LEGAL_LAST_UPDATED}</p>

      <p>
        These terms cover the Eco-Thrift website ({SITE_URL}) and the emails we send. Both are run by {LEGAL_ENTITY}.
      </p>

      <h3>Emails</h3>
      <ul>
        <li>
          <strong>Who sends:</strong> Eco-Thrift ({LEGAL_ENTITY}), from <Plain>{STORE.email}</Plain>.
        </li>
        <li>
          <strong>Always:</strong> the emails something you did needs, such as a receipt, an online hold, a Thrift+
          return, or a job application you sent us (interview times, reminders, and your first day if you&rsquo;re
          hired).
        </li>
        <li>
          <strong>Thrift+ members who give us an email:</strong> their Thrift+ updates (ThriftBucks, receipts and
          returns), and store news (new arrivals and sales).
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
          <strong>What:</strong> a one-time Thrift+ sign-in code or sign-in link, when you ask for it in the Thrift+ app,
          on {SITE_URL}, or at the register.
        </li>
        <li>
          <strong>How often:</strong> one text each time you ask. No marketing texts.
        </li>
        <li>
          <strong>Message and data rates may apply.</strong>
        </li>
        <li>
          <strong>Stop or get help:</strong> reply STOP to any text and we send no more; reply HELP for help, or call{' '}
          <Plain>{STORE.retail.phone}</Plain> or email <Plain>{STORE.email}</Plain>.
        </li>
        <li>
          <strong>Texts are optional</strong>, and never a condition of purchase or of joining Thrift+ (you can sign in
          with Google instead).
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
        <Plain>{STORE.retail.phone}</Plain>
        <br />
        <Plain>{STORE.email}</Plain>
      </p>
    </section>
  )
}

function LangSwitch({ lang, label, onChoose }: { lang: TermsLang; label: string; onChoose: (l: TermsLang) => void }) {
  return (
    <div className="lg-lang" role="group" aria-label={label}>
      <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => onChoose('en')}>
        English
      </button>
      <button type="button" lang="es" aria-pressed={lang === 'es'} onClick={() => onChoose('es')}>
        Español
      </button>
    </div>
  )
}

export default function Terms() {
  const location = useLocation()
  const [lang, choose] = useThriftPlusLang()
  const t = THRIFT_PLUS_TERMS[lang]
  const target = sectionFromHash(location.hash)
  // "New to Thrift+? See what it is →" only while Thrift+ is open (the home feed says so).
  const thriftPlusOpen = Boolean(useHome()?.thrift_plus_open)

  useSeo({ title: t.ui.seoTitle, description: t.ui.seoDescription, path: '/terms' })

  // The page loads after the browser looked for #s8 (it is lazy), so go there ourselves; once more after late layout,
  // unless the reader has moved.
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
    }, 500)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [target])

  return (
    <div className="lg" lang={lang}>
      <BackRow />
      <header className="lg-hd">
        <div className="lg-top">
          {thriftPlusOpen ? (
            <Link to={withLangFromAddress('/thriftplus', location.search)}>{THRIFT_PLUS_ABOUT_LINE[lang]}</Link>
          ) : (
            <span className="lbl">{t.ui.terms}</span>
          )}
          <LangSwitch lang={lang} label={t.ui.languageGroup} onChoose={choose} />
        </div>
        <h1 className="disp">{t.hero.title}</h1>
        <p className="lg-sub">{t.hero.tagline}</p>
      </header>

      <div className="lg-body">
        {t.courtesyNote && (
          <p className="lg-note" role="note">
            {t.courtesyNote}
          </p>
        )}

        <nav className="lg-toc" aria-label={t.fullTitle}>
          <ul>
            {t.sections.map((s) => (
              <li key={s.num}>
                <a href={`#s${s.num}`}>
                  §{s.num} {s.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#store-terms">{t.ui.storeTermsLink}</a>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="lg-know">
          <h2 id="lg-know">{t.needToKnowTitle}</h2>
          <ul className="lg-know">
            {t.needToKnow.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong> {item.text}
              </li>
            ))}
          </ul>
        </section>

        <div className="lg-gos">
          <Link className="btn btn-ink" to="/scan">
            {t.buttons.scan.label}
          </Link>
          <Link className="btn btn-lime" to={siteLink(t.buttons.join.href)}>
            {t.buttons.join.label}
          </Link>
        </div>

        <section aria-labelledby="lg-chart">
          <h2 id="lg-chart">{t.chartTitle}</h2>
          <div className="lg-chart">
            {t.chart.map((row) => (
              <div key={row.num} className="lg-cr">
                <span className="n tn">{row.num}</span>
                <span>
                  <span className="w">{row.what}</span>
                  <span className="s">{row.short}</span>
                </span>
                <span className="sec">§{row.section}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="lg-faq">
          <h2 id="lg-faq">{t.faqTitle}</h2>
          <div className="lg-faq">
            {t.faq.map((item) => (
              <div key={item.q} className="lg-qa">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {t.perks.length > 0 && (
          <section aria-labelledby="lg-perks">
            <h2 id="lg-perks">{t.perksTitle}</h2>
            <ul className="lg-know">
              {t.perks.map((perk) => (
                <li key={perk.label}>
                  <strong>{perk.label}</strong> <Linked text={perk.text} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="lg-full">
          <div className="lg-full-hd">
            <h2 id="lg-full">{t.fullTitle}</h2>
            <a href="#store-terms">{t.ui.storeTermsLink} ↓</a>
          </div>
          <p className="lg-intro">
            <strong>{t.fullIntro.label}</strong> <Linked text={t.fullIntro.text} /> · <span>{t.fullIntro.version}</span>
          </p>

          {t.sections.map((section) => {
            const id = `s${section.num}`
            return (
              <section
                key={id}
                id={id}
                className="lg-sec"
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

        <StoreTerms title={t.ui.storeTermsTitle} />
      </div>
    </div>
  )
}
