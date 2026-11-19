/**
 * Words for the Categories, About and Questions pages (piece W3), copied from the approved round-3 mockup's
 * kit/content.js `ECO.copy` and pages/about.html, questions.html, policies.html. Plain words, no exclamation marks,
 * "Thrift+ members" beside any ThriftBucks claim, collect (never earn).
 */

export type Faq = { q: string; a: string }

/** ECO.copy.faq, with the mockup's two shortened answers (no list to hold from, no "On the way" screen). */
export const FAQ: Faq[] = [
  { q: 'What is Eco-Thrift?', a: 'A liquidation and thrift store in Omaha. We buy overstock and returns by the truckload and price them well under retail.' },
  { q: 'How do prices work?', a: 'Every piece has a tag price. That is what a non-member pays. Thrift+ members also collect ThriftBucks on most items.' },
  { q: 'What are ThriftBucks?', a: 'What Thrift+ members collect when they buy. Keep them for your next visit, good for 30 days at full value, or redeem them at the register the same day at 50%.' },
  { q: 'Why do some pieces have more ThriftBucks?', a: 'An item’s ThriftBucks grow the longer it sits on the shelf. Scan the tag to see today’s.' },
  { q: 'What does Thrift+ cost?', a: 'Free to join. Nothing owed.' },
  { q: 'Can I return something?', a: 'Thrift+ members have 3 days on qualifying items, with 80% back as Thrift+ credit. Everything a non-member buys is sold AS IS.' },
  { q: 'Can you hold a piece for me?', a: 'No. First come, first served.' },
  { q: 'When does new stock arrive?', a: 'Trucks arrive most weeks.' },
]

export type Policy = { head: string; line: string; to: string }

/** ECO.copy.policies, each pointing at its page (and section where one exists). */
export const POLICIES: Policy[] = [
  { head: 'Returns', line: 'Thrift+ members: 3 days on qualifying items, 80% back as Thrift+ credit. Non-members: sold AS IS.', to: '/terms#s8' },
  { head: 'Thrift+ terms', line: 'How ThriftBucks are collected, kept and redeemed.', to: '/terms' },
  { head: 'Privacy', line: 'What we keep and why.', to: '/privacy' },
  { head: 'Texts', line: 'We text sign-in codes and links only.', to: '/terms#store-terms' },
]

export const ABOUT = {
  label: 'About Eco-Thrift',
  head: 'Big-store stock.',
  headEm: 'Well under retail.',
  sub: ['Liquidation and thrift,', 'in Omaha.'],
  steps: ['We buy by the truckload', 'We check every piece', 'It goes on the shelf, well under retail'],
  stepsHead: 'Every piece checked',
  tagline: 'Another chance for',
  taglineEm: 'everything and everyone',
}
