/**
 * The Thrift+ terms page (ecothrift.us/terms), in English and Spanish.
 *
 * The words are copied word for word from `.ai/reference/thrift-plus-terms/terms-en.md` and `terms-es.md`
 * (the rulebook's IDs such as [J1] are left out: they are for the coder and reviewers, never printed).
 * When those files change, change thriftPlusTerms.en.ts / thriftPlusTerms.es.ts to match, and the version date
 * in both. The Spanish is a courtesy translation; the English controls.
 */
import { THRIFT_PLUS_TERMS_EN } from './thriftPlusTerms.en'
import { THRIFT_PLUS_TERMS_ES } from './thriftPlusTerms.es'

export type TermsLang = 'en' | 'es'

/** A bold lead-in, then the words ("**Free to join.** Nothing owed."). */
export interface LabeledLine {
  label: string
  text: string
}

/** One clause of the full terms: "1.1 …", "4.1 **Kept (Default).** …", a numbered list (8.4) or a bulleted one (8.5). */
export interface TermsClause {
  /** "1.1"; left out for a section with no numbered clause (§12 Contact). */
  n?: string
  label?: string
  text?: string
  /** Numbered steps (8.4 How). */
  steps?: string[]
  /** Bullets with a bold lead-in (8.5 What you get back). */
  points?: LabeledLine[]
}

export interface TermsSection {
  /** 1 to 12: the anchor is `#s<num>` (the returns section is #s8). */
  num: number
  title: string
  clauses: TermsClause[]
}

export interface ChartRow {
  /** "A.1" */
  num: string
  what: string
  short: string
  /** The full-terms section the row links to (#s<section>). */
  section: number
}

export interface TermsButton {
  label: string
  /** Where the button goes on this site. */
  href: string
  /** What the QR code holds. */
  qrUrl: string
  /** The address printed under the QR code. */
  caption: string
  qrAlt: string
}

export interface ThriftPlusTermsContent {
  lang: TermsLang
  /** Page chrome (not in the .md files). */
  ui: {
    seoTitle: string
    seoDescription: string
    home: string
    terms: string
    languageGroup: string
    storeTermsLink: string
    storeTermsTitle: string
  }
  /** Spanish only: the courtesy-translation line at the top of the page. */
  courtesyNote?: string
  hero: { title: string; tagline: string }
  needToKnowTitle: string
  needToKnow: LabeledLine[]
  buttons: { scan: TermsButton; join: TermsButton }
  chartTitle: string
  chartHead: { num: string; what: string; short: string; terms: string }
  chart: ChartRow[]
  faqTitle: string
  faq: { q: string; a: string }[]
  perksTitle: string
  /** Live perks only (M1 now). Add M2 to M4 when they are built; never before. */
  perks: LabeledLine[]
  fullTitle: string
  /** "**Thrift+ Membership Terms.** Eco-Thrift LLC, … · Version: <date>." */
  fullIntro: { label: string; text: string; version: string }
  sections: TermsSection[]
}

export const THRIFT_PLUS_TERMS: Record<TermsLang, ThriftPlusTermsContent> = {
  en: THRIFT_PLUS_TERMS_EN,
  es: THRIFT_PLUS_TERMS_ES,
}
