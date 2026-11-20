/**
 * Words for the Categories, About and Questions pages (piece W3), copied from the approved round-3 mockup's
 * kit/content.js `ECO.copy` and pages/about.html, questions.html, policies.html. Plain words, no exclamation marks,
 * "Thrift+ members" beside any ThriftBucks claim, collect (never earn).
 */

/** `example`: the answer ends with "See the example", which opens the one ThriftBucks window (rulebook V12). */
export type Faq = { q: string; a: string; example?: boolean }

/**
 * ECO.copy.faq, with the mockup's two shortened answers (no list to hold from, no "On the way" screen). Critic cycle
 * 11-20: one ThriftBucks answer, one line, that opens the standard example (V12; no second explainer); returns live
 * once, in the Policies list below.
 */
export const FAQ: Faq[] = [
  { q: 'What is Eco-Thrift?', a: 'A liquidation and thrift store in Omaha. We buy overstock and returns by the truckload.' },
  { q: 'How do prices work?', a: 'One tag price, the same for everyone.' },
  { q: 'What are ThriftBucks?', a: 'What Thrift+ members collect on most items.', example: true },
  { q: 'What does Thrift+ cost?', a: 'Free to join.' },
  { q: 'Can you hold an item for me?', a: 'No. First come, first served.' },
  { q: 'When does new stock arrive?', a: 'Trucks arrive most weeks.' },
]

export type Info = { name: string; line: string; to: string; icon: 'about' | 'questions' | 'careers' | 'returns' }

/**
 * The four places a shopper looks for at the bottom of a store site (critic cycle 11-20): one set of names and
 * destinations for the home's closing tiles, the menu and About's way onward. Returns opens the short Returns screen
 * (the full policy, terms section 8, is one tap further).
 */
export const INFO: Info[] = [
  { name: 'About', line: 'Who we are', to: '/about', icon: 'about' },
  { name: 'Questions', line: 'Prices, holds, policies', to: '/questions', icon: 'questions' },
  { name: 'Careers', line: 'Jobs in Omaha', to: '/careers', icon: 'careers' },
  { name: 'Returns', line: '3 days or AS IS', to: '/returns', icon: 'returns' },
]

/**
 * The Returns screen (critic cycle 11-20: a shopper wants the answer, not the contract): terms section 8 in its own
 * plain facts (8.2 what, 8.3 how long, 8.4 how, 8.5 what you get back) and section 9 (AS IS), then the full policy.
 */
export const RETURNS = {
  steps: [
    'Check your receipt for “3-day return”',
    'Bring it back within 3 calendar days. Bought Monday? Back by Thursday.',
    'Show your member QR, or give the phone number on your account, at the register',
  ],
  back: '80%',
  backLine: 'of what you paid, as Thrift+ credit',
  non: 'Sold AS IS. All sales final.',
}

/** `to` empty: the line says it all (no legal page to open). */
export type Policy = { head: string; line: string; to: string }

/** ECO.copy.policies, each pointing at its page (and section where one exists). */
export const POLICIES: Policy[] = [
  { head: 'Returns', line: 'Thrift+ members: 3 days on qualifying items, 80% back as Thrift+ credit. Non-members: sold AS IS.', to: '/returns' },
  { head: 'Thrift+ terms', line: 'How ThriftBucks are collected, kept and redeemed.', to: '/terms' },
  { head: 'Privacy', line: 'What we keep and why.', to: '/privacy' },
  { head: 'Texts', line: 'We text sign-in codes and links only.', to: '' },
]

/** About (owner 11-20: "too much info that is fluff"; never a claim that we check, test or inspect items). */
export const ABOUT = {
  label: 'About Eco-Thrift',
  head: 'Liquidation and thrift in Omaha',
  facts: [
    { head: 'Overstock and returns', line: 'We buy them from big stores by the truckload.', to: '', go: '' },
    { head: 'New trucks most weeks', line: '', to: '/#coming', go: 'See what is on the truck' },
  ],
}
