import { Link, useLocation } from 'react-router-dom'
import LangToggle from '../components/LangToggle'
import ScanIcon from '../components/ScanIcon'
import { absolutePublicAssetUrl, publicAssetUrl } from '../data/content'
import { POSTER_ALT, THRIFT_PLUS_ABOUT, THRIFT_PLUS_IMAGES, type AboutPoster } from '../data/thriftPlusAbout'
import { THRIFT_PLUS_TERMS } from '../data/thriftPlusTerms'
import { useThriftPlusLang, withLangFromAddress } from '../lib/thriftPlusLang'
import { useSeo } from '../useSeo'
import './ThriftPlusPage.css'

/**
 * ecothrift.us/thriftplus: "What is Thrift+?" (owner 10-15), the three posters with a short text each, beside the
 * terms (/terms). English | Español like /terms (lib/thriftPlusLang.ts); the posters stay in English. Words:
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
            <Poster poster={poster} eager={i === 0} />
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
