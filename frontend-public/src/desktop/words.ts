/**
 * The desktop site's own words: only what the phone site does not export (Dash Update #211). Everything the phone site
 * keeps in a shared place is imported, never copied: phone/pages/words.ts (FAQ, INFO, RETURNS, POLICIES, ABOUT),
 * phone/shell/ThriftBucksExample.tsx (the one ThriftBucks example, rulebook V12), phone/pages/item/itemData.ts
 * (STOCK_LINE), data/content.ts (the store), data/legal.ts. The lines below are the phone pages' own inline words, kept
 * word for word with the file they come from named, so a later sweep can move both to one place.
 */
import { BOHO_ON } from '../phone/pages/home/Specials'
import { INFO } from '../phone/pages/words'

export type NavItem = { name: string; to: string; scan?: boolean }

/** Row two of the header, left: the shop (the phone menu's names, phone/pages/Menu.tsx ROWS). */
export const NAV: NavItem[] = [
  { name: 'In store', to: '/store' },
  { name: 'On the truck', to: '/store?where=coming' },
  { name: 'Categories', to: '/categories' },
  { name: 'Thrift+', to: '/thriftplus' },
  { name: 'Scan a tag', to: '/scan', scan: true },
  { name: 'Visit', to: '/visit' },
]

/** Row two, right: help and info (the phone's four, words.ts INFO, then the journal). */
export const SUB_NAV: NavItem[] = [...INFO.map((i) => ({ name: i.name, to: i.to })), { name: 'Blog', to: '/blog' }]

/** Is this header link the page we are on? */
export function navOn(to: string, pathname: string, search: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/'
  const coming = new URLSearchParams(search).get('where') === 'coming'
  if (to === '/store') return (p === '/store' && !coming) || p.startsWith('/store/item/p')
  if (to === '/store?where=coming') return (p === '/store' && coming) || p.startsWith('/store/item/m')
  if (to === '/visit') return p === '/visit'
  return p === to || p.startsWith(`${to}/`)
}

/** The join a non-member is offered on a computer: the desktop sign-in page's join (the phone's is /scan?view=join). */
export const JOIN_HREF = '/account/sign-in?view=join'
export const SIGN_IN_HREF = '/account/sign-in'

/** The store list's notes (phone/pages/Store.tsx and Item.tsx: plain notes the owner asked for, rulebook V14). */
export const NOT_HELD = 'Not held. First come, first served.'
export const LIST_BEHIND = 'Our list can run behind the shelf. It may already be sold.'
export const COMING_NOTE = 'On the next trucks. Not in store yet.'
export const COMING_NOT_HELD = 'Not held. Priced when the truck lands.'
export const PRICED_ON_ARRIVAL = 'Priced on arrival'
/** The item page (phone/pages/Item.tsx's words; the join line follows rulebook V14: who collects is in the line). */
export const ITEM = {
  joinWith: 'Thrift+ members collect these ThriftBucks. Thrift+ is free.',
  joinPlain: 'Thrift+ is free: ThriftBucks on most of our items.',
  comingNote: 'Not held. The price is set when it lands.',
  gone: 'This item is no longer listed',
  unreachable: 'We can’t load this item right now',
}

/** /thriftplus (phone/pages/ThriftPlus.tsx: the three numbers word for word; "Thrift+ is free": owner-approved, V12). */
export const THRIFT_PLUS = {
  line: 'Thrift+ is free. Members collect ThriftBucks on most of our items.',
  three: [
    ['30', 'days at full value'],
    ['50%', 'if you redeem the same day'],
    ['3', 'day returns, qualifying items'],
  ] as Array<[string, string]>,
  qrLine: 'Your member QR',
}

/** Sign in and Join on a computer (the steps' own words are the scanner's, phone/scan/signin). */
export const SIGN_IN = {
  head: 'Collect ThriftBucks',
  joinHead: 'Collect ThriftBucks',
  haveOne: 'Already a member?',
  newHere: 'Not a member yet?',
  soon: 'Thrift+ is coming soon',
  soonLine: 'Ask at the register.',
  linkUsed: "That link didn't work. Send a new one.",
  finishHead: (first: string) => (first ? `${first}, one more step` : 'One more step'),
  finishLine: 'Finish joining on your phone: scan this code, or open ecothrift.us/scan. Or ask at the register.',
  finishUrl: 'https://ecothrift.us/scan?view=finish',
}

/** Careers (phone/pages/Careers.tsx, CareerRole.tsx, careers/parts.tsx `NoOpenings`, word for word). */
export const CAREERS = {
  kick: 'Careers at Eco-Thrift',
  mission: 'Another Chance for Everything and Everyone.',
  ask: 'What we ask',
  grow: 'Room to grow',
  applyNote: 'It takes about 5 minutes.',
  applyFoot: 'About 5 minutes. A resume is optional.',
  where: 'Eco-Thrift, 8425 West Center Road, Omaha, NE 68124',
  roleWhere: 'Our Canfield store, 8425 West Center Road, Omaha',
  noneHead: 'No openings right now',
  noneLine: 'We’re not hiring at the moment. Check back soon, or stop by the store and say hello.',
}

/** The store list's one line (phone/pages/Store.tsx `sh-note`; the Black Friday line is #220's). */
export const STORE_NOTE = {
  normal: 'Thrift+ members collect ThriftBucks on most items.',
  bf: 'Black Friday, Fri & Sat: one price for everyone, the retail crossed out.',
}

/** The home's first card (rulebook V11, phone/pages/home/Specials.tsx `Shout`). */
export const SHOUT = {
  lines: ['No Thrift+?', 'You’re paying', 'way too much.'],
  share: (n: number) => `ThriftBucks on ${n}% of our items`,
  shareUnknown: 'ThriftBucks on most of our items',
  typical: (n: number) => `Typically ${n}% of the tag`,
  typicalUnknown: 'Collected by Thrift+ members',
  returns: '3-day returns for members',
}

/** The normal-day Black Friday teaser (phone/pages/home/Specials.tsx, the #220 words), until Sat Nov 28. */
export const BF_TEASER = {
  when: 'Fri & Sat, Nov 27 to 28',
  line: 'Store averages over 78% off retail. One price for everyone. Fri 6 AM to 6 PM, Sat 9 AM to 6 PM.',
}

/** BO-HO-GO (phone/pages/home/Specials.tsx `Boho`). Hidden while the phone hides it (#220: the register cannot ring it
 *  yet, so the site must not promise it): `on` follows the phone's BOHO_ON. */
export const BOHO = {
  on: BOHO_ON,
  label: 'Thrift+ members · Clothing',
  steps: [['BO', 'Buy one'], ['HO', 'Half off'], ['GO', 'Get one free']] as Array<[string, string]>,
  pair: [['Jeans', '$8.99'], ['Sweater', '$6.00']] as Array<[string, string]>,
  both: 4.5,
}

/** The every-day returns card (phone/pages/home/Specials.tsx; the 80% is words.ts RETURNS.back). */
export const RETURNS_CARD = {
  label: 'Every day',
  head: '3-day returns',
  who: 'Thrift+ members only',
  pct: '80%',
  pctLine: 'back as Thrift+ credit',
}

/** On Black Friday every price shown is the Black Friday price (#220: one price for everyone, no ThriftBucks shown):
 *  the label in place of the ThriftBucks line, as the scanners label it. */
export const BF_PRICE = 'Black Friday price'

/** Black Friday's front page, the owner's words (2026-11-24, Dash Update #220/#211; the phone's BlackFridayHero and
 *  the old desktop site's BlackFridayPanel say the same). One button: Get directions. */
export const BLACK_FRIDAY = {
  when: 'Fri & Sat · Nov 27 to 28',
  title: ['Black', 'Friday'],
  say: 'All prices reduced.',
  sub: 'No need to sign up for Thrift+. Just good deals.',
  hours: 'Fri 6 AM to 6 PM · Sat 9 AM to 6 PM',
  button: 'Get directions',
}

/** Scan on a computer (Mainline's call for the owner, 11-24): no camera here, a tag number instead. */
export const SCAN = {
  head: 'Scan a tag',
  line: 'Type the number on a price tag to see its price.',
  phoneHead: 'In the store? Scan with your phone.',
  phoneLine: 'Point your phone’s camera at this code, or go to ecothrift.us/scan.',
  phoneUrl: 'https://ecothrift.us/scan',
  where: '',
  bad: 'Type the 6 or 7 numbers on the tag.',
  notFound: 'We could not find that tag. Check the number and try again.',
  error: 'Could not reach the store. Try again.',
  gone: 'Sold or off the floor',
}
