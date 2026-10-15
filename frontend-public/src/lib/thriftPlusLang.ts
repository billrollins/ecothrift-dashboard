import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { TermsLang } from '../data/thriftPlusTerms'

/**
 * English | Español for the Thrift+ pages (/terms and /thriftplus share it, so a choice on one carries to the other).
 * The order (owner 10-15): `?lang=` in the address, then the remembered toggle, then a Spanish phone, then English.
 */

const LANG_KEY = 'ecothrift.terms.lang'

/** `?lang=es|en` first, then `#es` / `#en` (the posters' "Escanee aquí para español"). */
export function langFromAddress(search: string, hash: string): TermsLang | null {
  const q = (new URLSearchParams(search).get('lang') || '').trim().toLowerCase()
  if (q.startsWith('es')) return 'es'
  if (q.startsWith('en')) return 'en'
  const h = hash.toLowerCase()
  if (h === '#es') return 'es'
  if (h === '#en') return 'en'
  return null
}

function rememberedLang(): TermsLang | null {
  try {
    const saved = window.localStorage.getItem(LANG_KEY)
    return saved === 'en' || saved === 'es' ? saved : null
  } catch {
    return null
  }
}

function rememberLang(lang: TermsLang) {
  try {
    window.localStorage.setItem(LANG_KEY, lang)
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

/** The phone's own language: Spanish when its first language starts with "es". */
function phoneLang(): TermsLang | null {
  try {
    const first = (navigator.languages && navigator.languages[0]) || navigator.language || ''
    return first.toLowerCase().startsWith('es') ? 'es' : null
  } catch {
    return null
  }
}

/** The order (owner 10-15): the address, then the phone's remembered toggle, then the phone's language, then English. */
export function pickLang(search: string, hash: string): TermsLang {
  return langFromAddress(search, hash) ?? rememberedLang() ?? phoneLang() ?? 'en'
}

/**
 * The page's language and the toggle's handler. A link inside the site to …?lang=… switches too; <html lang> follows
 * (screen readers, translation prompts) and is put back on leaving the page; a choice is remembered, and when the
 * address names a language it is kept in step, so a reload shows the same.
 */
export function useThriftPlusLang(): [TermsLang, (next: TermsLang) => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const [lang, setLang] = useState<TermsLang>(() => pickLang(location.search, location.hash))

  useEffect(() => {
    const fromAddress = langFromAddress(location.search, location.hash)
    if (fromAddress) setLang(fromAddress)
  }, [location.search, location.hash])

  useEffect(() => {
    const root = document.documentElement
    const before = root.getAttribute('lang') || 'en'
    root.setAttribute('lang', lang)
    return () => root.setAttribute('lang', before)
  }, [lang])

  const choose = (next: TermsLang) => {
    setLang(next)
    rememberLang(next)
    const params = new URLSearchParams(location.search)
    const hashLang = /^#(es|en)$/i.test(location.hash)
    if (params.has('lang') || hashLang) {
      if (params.has('lang')) params.set('lang', next)
      const search = params.toString()
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : '', hash: hashLang ? `#${next}` : location.hash },
        { replace: true },
      )
    }
  }

  return [lang, choose]
}

/** A link to another Thrift+ page that keeps `?lang=` when this address has one (it is not remembered). */
export function withLangFromAddress(path: string, search: string): string {
  const q = new URLSearchParams(search).get('lang')
  return q ? `${path}?lang=${encodeURIComponent(q)}` : path
}
