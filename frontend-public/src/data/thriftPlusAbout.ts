/**
 * Thrift+ on the public website (owner 10-15): the home band, the Visit page's "Bring your phone", the
 * "What is Thrift+?" page (/thriftplus) and the line on /terms. Word for word from
 * `.ai/reference/thrift-plus-posters/11-website.md`; change that file first, then this one.
 *
 * The home band, the Visit block and the /terms line are English only (the spec gives no Spanish). The page has
 * both languages; its posters, and their alt text, stay in English. The Spanish lines are drafts for the
 * native-speaker check, alongside terms-es.md.
 */
import type { TermsLang } from './thriftPlusTerms'

/** The image files in frontend-public/public/thriftplus/ (from workspace/posters2/web/). */
export const THRIFT_PLUS_IMAGES = {
  appPhone: 'thriftplus/thriftplus-app-phone.webp', // 604 x 1256, transparent corners
  og: 'thriftplus/thriftplus-og.jpg', // 1200 x 630
} as const

/** 1. The home page band, directly under the hero. */
export const THRIFT_PLUS_HOME_BAND = {
  pill: 'NEW · THRIFT+',
  heading: 'Scan any tag. See its ThriftBucks.',
  text: 'Thrift+ is free to join. In the store, the Thrift+ app shows what any item gives back in ThriftBucks, and whether it has 3-day returns.',
  open: { label: 'Open the app', href: '/scan' },
  about: { label: 'What is Thrift+?', href: '/thriftplus' },
  imageAlt: 'The Thrift+ app scanning a price tag in the store',
} as const

/** 2. The Visit page, after the address and hours. */
export const THRIFT_PLUS_VISIT_BLOCK = {
  heading: 'Bring your phone',
  text: 'Scan any price tag with the Thrift+ app to see its ThriftBucks, and whether it has 3-day returns. Not a member yet? Join on your phone in a minute.',
  open: { label: 'Open the app', href: '/scan' },
  join: { label: 'Join', href: '/join' },
} as const

/** The header nav link (behind the switch). */
export const THRIFT_PLUS_NAV_LABEL = 'Thrift+'

/** The line at the top of /terms, to /thriftplus (Spanish: the Design session, 10-15). */
export const THRIFT_PLUS_ABOUT_LINE = { en: 'New to Thrift+? See what it is →', es: '¿Primera vez con Thrift+? Vea qué es →' } as const

export interface AboutPoster {
  /** The section's anchor on /thriftplus. */
  id: string
  /** Show the standard ThriftBucks example (rulebook V12) in place of the poster image. */
  example?: boolean
  /** thriftplus/<file>.webp (1300 x 1900) and thriftplus/<file>-650.webp (phones). */
  file: string
  heading: string
  text: string
}

export interface ThriftPlusAboutContent {
  lang: TermsLang
  /** The tab and SEO title; the site adds " · Eco-Thrift". */
  seoTitle: string
  seoDescription: string
  title: string
  intro: string
  buttons: { join: string; open: string; terms: string }
  posters: AboutPoster[]
  /** "The full rules are in the **Thrift+ terms**." The bold words link to /terms. */
  closing: { before: string; link: string; after: string }
  /** The standard ThriftBucks example's words (rulebook V12); the numbers are THRIFTBUCKS_EXAMPLE. */
  example: ExampleWords
}

/**
 * The standard ThriftBucks example (rulebook V12, owner 2026-11-20: "this needs to be very consistent across the app").
 * The same numbers as the phone site's `phone/shell/ThriftBucksExample.tsx` (`EXAMPLE`) and the scanner's info sheet;
 * change the rulebook first, then every surface (`.ai/extended/thrift-plus-surfaces.md`). The instant choice is half
 * the ThriftBucks' value (B1).
 */
export const THRIFTBUCKS_EXAMPLE = { retail: 200, tag: 100, bucks: 20, today: 90 } as const

export interface ExampleWords {
  label: string
  heading: string
  retail: string
  tag: string
  carry: string
  now: string
  pick: string
  keep: { label: string; pay: string; line: string }
  use: { label: string; pay: string; line: string }
  /** Before and after the bold price. */
  non: { before: string; after: string }
}

/** The posters' alt text: the posters stay in English, so the alt text does too. */
export const POSTER_ALT: Record<string, string> = {
  meet: 'Poster: Meet Thrift+. Free and easy membership, ThriftBucks that grow as items sit, and 3-day returns.',
  thriftbucks:
    'Poster: Get ThriftBucks. A member gets 13.69 ThriftBucks on a $49.36 lamp; a non-member gets none.',
  returns:
    "Poster: 3-day returns. Members can bring a qualifying item back within 3 days for 80% as Thrift+ credit; non-members can't.",
}

const EN: ThriftPlusAboutContent = {
  lang: 'en',
  seoTitle: 'What is Thrift+?',
  seoDescription: 'ThriftBucks, 3-day returns and more. Free to join. Nothing owed.',
  title: 'What is Thrift+?',
  intro: 'ThriftBucks, 3-day returns and more. Free to join. Nothing owed.',
  buttons: { join: 'Join', open: 'Open the app', terms: 'Full terms' },
  posters: [
    {
      id: 'meet',
      file: 'thriftplus-poster-1-meet',
      heading: 'Meet Thrift+',
      text: 'Membership is free and easy: join on your phone in a minute. After 7 days on our floor, most items start to carry ThriftBucks, and they grow every day. You have 3 days to bring a qualifying item back.',
    },
    {
      id: 'thriftbucks',
      file: 'thriftplus-poster-2-thriftbucks',
      heading: 'Get ThriftBucks',
      example: true,
      text: 'Thrift+ members collect ThriftBucks on most items. Keep them for your next visit, good for 30 days at full value, or use them now at 50% of their value. Non-members pay the tag.',
    },
    {
      id: 'returns',
      file: 'thriftplus-poster-3-returns',
      heading: '3-day returns',
      text: "Doesn't work? Bring it back within 3 days, for any reason, on qualifying items: 80% of what you paid comes back as Thrift+ credit. Non-members: all sales final, sold AS IS.",
    },
  ],
  closing: { before: 'The full rules are in the ', link: 'Thrift+ terms', after: '.' },
  example: {
    label: 'Example',
    heading: 'A normal item',
    retail: 'Retail',
    tag: 'Our tag',
    carry: 'After 7 days on our floor, most items start to carry ThriftBucks. They grow every day.',
    now: 'This one carries today',
    pick: 'Thrift+ members pick one',
    keep: { label: 'Keep them', pay: 'Pay', line: 'ThriftBucks come off your next visit' },
    use: { label: 'Use them now', pay: 'Pay', line: 'today' },
    non: { before: 'Non-member: pays ', after: '. All sales final.' },
  },
}

const ES: ThriftPlusAboutContent = {
  lang: 'es',
  seoTitle: '¿Qué es Thrift+?',
  // The spec's description is the intro; in Spanish, the Spanish intro.
  seoDescription: 'ThriftBucks, devoluciones en 3 días y más. Unirse es gratis. No se debe nada.',
  title: '¿Qué es Thrift+?',
  intro: 'ThriftBucks, devoluciones en 3 días y más. Unirse es gratis. No se debe nada.',
  buttons: { join: 'Únase', open: 'Abrir la app', terms: 'Términos completos' },
  posters: [
    {
      id: 'meet',
      file: 'thriftplus-poster-1-meet',
      heading: 'Conozca Thrift+',
      text: 'Ser miembro es gratis y fácil: únase en su teléfono en un minuto. Después de 7 días en nuestro piso, la mayoría de los artículos empiezan a tener ThriftBucks, y crecen cada día. Tiene 3 días para devolver un artículo que califique.',
    },
    {
      id: 'thriftbucks',
      file: 'thriftplus-poster-2-thriftbucks',
      heading: 'Reciba ThriftBucks',
      example: true,
      text: 'Los miembros de Thrift+ reúnen ThriftBucks en la mayoría de los artículos. Guárdelos para su próxima visita, válidos 30 días a su valor completo, o úselos ahora al 50% de su valor. Quienes no son miembros pagan la etiqueta.',
    },
    {
      id: 'returns',
      file: 'thriftplus-poster-3-returns',
      heading: 'Devoluciones en 3 días',
      text: '¿No funciona? Tráigalo dentro de 3 días, por cualquier razón, si el artículo califica: el 80% de lo que pagó se le regresa como crédito Thrift+. Quienes no son miembros: ventas finales, se vende AS IS.',
    },
  ],
  closing: { before: 'Las reglas completas están en los ', link: 'términos de Thrift+', after: '.' },
  example: {
    label: 'Ejemplo',
    heading: 'Un artículo normal',
    retail: 'Precio de tienda',
    tag: 'Nuestra etiqueta',
    carry: 'Después de 7 días en nuestro piso, la mayoría de los artículos empiezan a tener ThriftBucks. Crecen cada día.',
    now: 'Este tiene hoy',
    pick: 'Los miembros de Thrift+ eligen uno',
    keep: { label: 'Guárdelos', pay: 'Pague', line: 'ThriftBucks se restan en su próxima visita' },
    use: { label: 'Úselos ahora', pay: 'Pague', line: 'hoy' },
    non: { before: 'Quien no es miembro: paga ', after: '. Ventas finales.' },
  },
}

export const THRIFT_PLUS_ABOUT: Record<TermsLang, ThriftPlusAboutContent> = { en: EN, es: ES }
