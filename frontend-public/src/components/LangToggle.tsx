import type { TermsLang } from '../data/thriftPlusTerms'
import './LangToggle.css'

/** English | Español, top right of the Thrift+ pages (/terms, /thriftplus). */
export default function LangToggle({
  lang,
  label,
  onChoose,
}: {
  lang: TermsLang
  label: string
  onChoose: (lang: TermsLang) => void
}) {
  return (
    <div className="tp-lang" role="group" aria-label={label}>
      <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => onChoose('en')}>
        English
      </button>
      <button type="button" lang="es" aria-pressed={lang === 'es'} onClick={() => onChoose('es')}>
        Español
      </button>
    </div>
  )
}
