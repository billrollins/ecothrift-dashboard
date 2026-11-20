import { Link, useLocation } from 'react-router-dom'
import LangToggle from '../components/LangToggle'
import ScanIcon from '../components/ScanIcon'
import { absolutePublicAssetUrl, publicAssetUrl } from '../data/content'
import {
  POSTER_ALT,
  THRIFT_PLUS_ABOUT,
  THRIFT_PLUS_IMAGES,
  THRIFTBUCKS_EXAMPLE,
  type AboutPoster,
  type ExampleWords,
} from '../data/thriftPlusAbout'
import { THRIFT_PLUS_TERMS } from '../data/thriftPlusTerms'
import { useThriftPlusLang, withLangFromAddress } from '../lib/thriftPlusLang'
import { useSeo } from '../useSeo'
import './ThriftPlusPage.css'

/**
 * ecothrift.us/thriftplus: "What is Thrift+?" (owner 10-15), the three posters with a short text each, beside the
 * terms (/terms); since 11-20 the Get ThriftBucks section shows the standard example (rulebook V12, Dash Update #197)
 * in place of its poster, which still shows an older lamp example. English | Español like /terms (lib/thriftPlusLang.ts); the posters stay in English. Words:
 * data/thriftPlusAbout.ts, from .ai/reference/thrift-plus-posters/11-website.md. Only while Thrift+ is open
 * (App.tsx ThriftPlusRoute).
 */

/** Tap a poster to open it full size. Phones load the 650 px file; wider screens pick by density. */
function Poster({ poster, eager }: { poster: AboutPoster; eager: boolean }) {
  const full = publicAssetUrl(`thriftplus/${poster.file}.webp`)
  const small = publicAssetUrl(`thriftplus/${poster.file}-650.webp`)
  return (
    <a className="tpa-poster" href={full}>
      <picture>
        <source media="(max-width: 640px)" srcSet={small} />
        <img
          src={full}
          srcSet={`${small} 650w, ${full} 1300w`}
          sizes="(min-width: 900px) 320px, 260px"
          width={650}
          height={950}
          alt={POSTER_ALT[poster.id]}
          lang="en"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      </picture>
    </a>
  )
}

const money = (n: number) => `$${n.toFixed(2)}`
const bucks = (n: number) => n.toFixed(2)

/**
 * The standard ThriftBucks example (rulebook V12), in place of the Get ThriftBucks poster: the same numbers and words
 * as the phone site and the scanner. ThriftBucks are a number with the word, never "$".
 */
function ThriftBucksExample({ w }: { w: ExampleWords }) {
  const e = THRIFTBUCKS_EXAMPLE
  return (
    <div className="tpa-ex" data-testid="thriftbucks-example">
      <p className="tpa-ex__lbl">{w.label}</p>
      <p className="tpa-ex__h">{w.heading}</p>
      <div className="tpa-ex__item">
        <div>
          <span className="tpa-ex__k">{w.retail}</span>
          <s className="tpa-ex__retail">{money(e.retail)}</s>
        </div>
        <div>
          <span className="tpa-ex__k">{w.tag}</span>
          <span className="tpa-ex__tag">{money(e.tag)}</span>
        </div>
      </div>
      <p className="tpa-ex__carry">{w.carry}</p>
      <p className="tpa-ex__now">
        {w.now}
        <b>{bucks(e.bucks)} ThriftBucks</b>
      </p>
      <p className="tpa-ex__pick">{w.pick}</p>
      <div className="tpa-ex__two">
        <div>
          <small>{w.keep.label}</small>
          <b>
            {w.keep.pay} {money(e.tag)}
          </b>
          <span>
            {bucks(e.bucks)} {w.keep.line}
          </span>
        </div>
        <div>
          <small>{w.use.label}</small>
          <b>
            {w.use.pay} {money(e.today)}
          </b>
          <span>{w.use.line}</span>
        </div>
      </div>
      <p className="tpa-ex__non">
        {w.non.before}
        <b>{money(e.tag)}</b>
        {w.non.after}
      </p>
    </div>
  )
}

export default function ThriftPlusPage() {
  const location = useLocation()
  const [lang, choose] = useThriftPlusLang()
  const c = THRIFT_PLUS_ABOUT[lang]
  const ui = THRIFT_PLUS_TERMS[lang].ui
  const termsHref = withLangFromAddress('/terms', location.search)

  useSeo({
    title: c.seoTitle,
    description: c.seoDescription,
    path: '/thriftplus',
    image: absolutePublicAssetUrl(THRIFT_PLUS_IMAGES.og),
  })

  return (
    <div className="tpa" lang={lang}>
      <div className="wrap tpa__wrap">
        <div className="tpa__top">
          <div className="crumb tpa__crumb">
            <Link to="/">{ui.home}</Link> / <span>{c.title}</span>
          </div>
          <LangToggle lang={lang} label={ui.languageGroup} onChoose={choose} />
        </div>

        <header className="tpa-hero">
          <h1 className="tpa-hero__title">{c.title}</h1>
          <p className="tpa-hero__intro">{c.intro}</p>
          {/* /join and /scan are the Thrift+ app, not routes of this site: plain links. */}
          <div className="tpa-hero__btns">
            <a className="btn btn--light" href="/join">
              {c.buttons.join}
            </a>
            <a className="btn tpa-btn--line" href="/scan">
              <ScanIcon />
              <span>{c.buttons.open}</span>
            </a>
            <Link className="btn tpa-btn--line" to={termsHref}>
              {c.buttons.terms}
            </Link>
          </div>
        </header>

        {c.posters.map((poster, i) => (
          <section key={poster.id} id={poster.id} className="tpa-sec" aria-labelledby={`${poster.id}-title`}>
            {poster.example ? <ThriftBucksExample w={c.example} /> : <Poster poster={poster} eager={i === 0} />}
            <div className="tpa-sec__text">
              <h2 id={`${poster.id}-title`} className="tpa-sec__title">
                {poster.heading}
              </h2>
              <p>{poster.text}</p>
            </div>
          </section>
        ))}

        <p className="tpa-closing">
          {c.closing.before}
          <Link to={termsHref}>{c.closing.link}</Link>
          {c.closing.after}
        </p>
      </div>
    </div>
  )
}
