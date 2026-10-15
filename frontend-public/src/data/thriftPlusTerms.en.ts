/**
 * Thrift+ terms, English: word for word from `.ai/reference/thrift-plus-terms/terms-en.md` (10-12 text, with the
 * 10-15 §1.3 and §10.4). The English controls. See thriftPlusTerms.ts.
 */
import type { ThriftPlusTermsContent } from './thriftPlusTerms'

export const THRIFT_PLUS_TERMS_EN: ThriftPlusTermsContent = {
  lang: 'en',
  ui: {
    seoTitle: 'Thrift+ terms',
    seoDescription:
      'Thrift+ at Eco-Thrift: free to join, ThriftBucks on most items, and 3-day returns. All you need to know, the FAQ and the full terms.',
    home: 'Home',
    terms: 'Terms',
    languageGroup: 'Language',
    storeTermsLink: 'Store terms',
    storeTermsTitle: 'Store terms',
  },

  hero: {
    title: 'Thrift+',
    tagline: 'ThriftBucks, 3-day returns and more!',
  },

  needToKnowTitle: 'All you need to know',
  needToKnow: [
    { label: 'Free to join.', text: 'Nothing owed.' },
    {
      label: 'ThriftBucks on most items.',
      text: "They grow as an item sits, up to 95% of the tag. Scan any tag to see today's ThriftBucks.",
    },
    {
      label: 'Kept for next time, the Default.',
      text: 'Your ThriftBucks stay on your account. Use them from the next day, for 30 days, at full value.',
    },
    { label: 'Or redeem them instantly.', text: "At 50% of their value, off today's price. Just tell the cashier." },
    {
      label: '3-day returns.',
      text: 'Bring a qualifying item back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit.',
    },
    { label: 'Non-members pay the tag.', text: 'Everything a non-member buys is sold AS IS. All sales final.' },
  ],

  buttons: {
    scan: {
      label: 'Open the Scanner',
      href: '/scan',
      qrUrl: 'https://ecothrift.us/scan',
      caption: 'ecothrift.us/scan',
      qrAlt: 'QR code for ecothrift.us/scan',
    },
    join: {
      label: 'Join Thrift+',
      href: '/join',
      qrUrl: 'https://ecothrift.us/join',
      caption: 'ecothrift.us/join',
      qrAlt: 'QR code for ecothrift.us/join',
    },
  },

  chartTitle: 'The chart',
  chartHead: { num: '#', what: 'What', short: 'In short', terms: 'Full terms' },
  chart: [
    { num: 'A.1', what: 'Cost', short: 'Free to join. Nothing owed.', section: 2 },
    { num: 'A.2', what: 'Who can join', short: '18 or older. Up to 2 adults share one membership.', section: 1 },
    {
      num: 'A.3',
      what: 'Before your membership works',
      short: 'A photo, your name and phone, a photo ID check, and your signature.',
      section: 1,
    },
    { num: 'B.1', what: 'ThriftBucks', short: 'On most items. They grow as an item sits, up to 95% of the tag.', section: 3 },
    {
      num: 'B.2',
      what: 'Kept (Default)',
      short: 'They stay on your account. Use them from the next day, for 30 days, at full value.',
      section: 4,
    },
    { num: 'B.3', what: 'Redeemed instantly', short: "50% of their value, off today's price. Tell the cashier.", section: 4 },
    {
      num: 'B.4',
      what: 'Cash value',
      short: "None. ThriftBucks can't be sold, traded or moved to someone else.",
      section: 6,
    },
    { num: 'C.1', what: '3-day returns', short: 'Qualifying items, for any reason. Your receipt marks each one.', section: 8 },
    { num: 'C.2', what: 'How long', short: '3 calendar days after the day of sale.', section: 8 },
    {
      num: 'C.3',
      what: 'Back to you',
      short: '80% of what you paid, tax included, as Thrift+ credit. Never back to the way you paid.',
      section: 8,
    },
    {
      num: 'C.4',
      what: 'Not returnable',
      short: "Items marked AS IS on the tag or receipt, and items that don't qualify.",
      section: 8,
    },
    { num: 'D.1', what: 'Non-members', short: 'Sold AS IS. All sales final.', section: 9 },
    {
      num: 'D.2',
      what: 'Your photo and ID',
      short: 'Used only for verification. We never keep a copy of your ID.',
      section: 10,
    },
    {
      num: 'D.3',
      what: 'Email',
      short: 'Receipts, Thrift+ updates and sign-in links. Store news you can turn off. No texts.',
      section: 10,
    },
  ],

  faqTitle: 'FAQ',
  faq: [
    {
      q: 'Is Thrift+ really free?',
      a: "Yes. There's nothing to pay to join and nothing to pay each month. You never owe anything.",
    },
    {
      q: 'How do ThriftBucks grow?',
      a: "Most items collect ThriftBucks that grow the longer they sit in the store, up to 95% of the tag. Eco-Thrift sets them, and they can change from day to day. Scan any tag with the Thrift+ scanner to see today's ThriftBucks on it.",
    },
    {
      q: 'What does "redeem instantly" mean?',
      a: "Keeping your ThriftBucks is the Default: they stay on your account, and you can use them from the next day for 30 days at full value. If you'd rather use them right away, tell the cashier and redeem them instantly, at 50% of their value, off today's price. One choice covers the whole trip.",
    },
    {
      q: 'When do my ThriftBucks expire?',
      a: 'The ThriftBucks from each trip are good from the day after the trip through 30 days. Your receipts and My account show every use-by date, soonest first.',
    },
    {
      q: 'Can I use ThriftBucks on anything?',
      a: "On almost everything. ThriftBucks can't be used on consignment items. Thrift+ credit can.",
    },
    {
      q: 'Can I return something?',
      a: 'Yes, for any reason, if your receipt marks it "3-day return". Bring it to any register within 3 days after the day you bought it, with the member QR in your Thrift+ app or your phone number. You get 80% of what you paid, tax included, back as Thrift+ credit.',
    },
    {
      q: "What can't be returned?",
      a: "Anything marked AS IS on its tag or receipt, and items that don't qualify; your receipt marks every item. A returned item has to come back as it left: not broken, damaged or heavily used after the sale.",
    },
    {
      q: 'Is there a limit on returns?',
      a: 'We keep a record of returns. A member who returns items too often may have returns limited or refused.',
    },
    {
      q: 'Can I swap a return for something else?',
      a: 'No swaps. A return goes back to you as Thrift+ credit, which never expires, and you can spend it on anything in the store.',
    },
    {
      q: "How do I show I'm a member?",
      a: 'At the register, show the member QR in your Thrift+ app or give the phone number on your account.',
    },
    {
      q: 'Can my partner share my membership?',
      a: 'Yes. Up to 2 adults can share one membership and one balance. Both need to be at the register to add the second adult.',
    },
    {
      q: 'Do you keep my ID or photo?',
      a: "We look at your photo ID once to check your name and age, and we keep nothing from it. Your photo is used only so staff can confirm it's you. It's never used for marketing or shared, and it's deleted 24 months after your last purchase, or sooner if you ask.",
    },
    {
      q: 'Will you text me?',
      a: 'No. If you give us an email, we send receipts and Thrift+ updates. Store news emails always have an unsubscribe link.',
    },
    {
      q: 'Can I turn ThriftBucks into cash?',
      a: "No. ThriftBucks have no cash value. Thrift+ credit isn't cash either, except where these terms or the law say so.",
    },
  ],

  perksTitle: 'Member perks',
  // Live perks only (Design 10-15): M1 "Hold items online." / "Hold items from ecothrift.us for pickup." comes back
  // when online holds are switched on. No perks section until one is live.
  perks: [],

  fullTitle: 'Full terms',
  fullIntro: {
    label: 'Thrift+ Membership Terms.',
    text: 'EcoThrift LLC, 8425 West Center Road, Omaha, NE 68124 · (402) 881-9861',
    version: 'Version: October 15, 2026.',
  },

  sections: [
    {
      num: 1,
      title: 'Joining',
      clauses: [
        {
          n: '1.1',
          text: 'Thrift+ is a free membership program of EcoThrift LLC ("Eco-Thrift", "we"). You must be 18 or older to join.',
        },
        {
          n: '1.2',
          text: 'Up to 2 adults may share one membership and one account. Both must be present at a register to add the second adult, and the first adult approves.',
        },
        {
          n: '1.3',
          text: 'Your membership works only after we have your photo, your name and phone number, a check of your photo ID, and your signature on the register screen. Until then, your account collects and uses nothing. You may start on your phone at ecothrift.us/join with just your name and email (we email you a link to finish), then finish at any register, where we ask your phone number. No email? Join at any register.',
        },
        { n: '1.4', text: 'By signing, you agree to these terms and to the photo release in §10.' },
        { n: '1.5', text: 'Items for adults 18 and over require an ID check every time, member or not.' },
      ],
    },
    {
      num: 2,
      title: 'Free',
      clauses: [{ n: '2.1', text: 'Thrift+ is free to join. There are no monthly charges, and nothing is owed.' }],
    },
    {
      num: 3,
      title: 'ThriftBucks',
      clauses: [
        {
          n: '3.1',
          text: "Members collect ThriftBucks on most items. Consignment items don't carry ThriftBucks. Neither does an item in its first 7 days on the sales floor, or back stock that has not yet been on the floor.",
        },
        {
          n: '3.2',
          text: 'ThriftBucks grow as an item sits, up to 95% of its tag price. ThriftBucks are set by Eco-Thrift, can change from day to day, and are shown in the Thrift+ scanner and at the register.',
        },
      ],
    },
    {
      num: 4,
      title: 'Keeping ThriftBucks or redeeming them instantly',
      clauses: [
        {
          n: '4.1',
          label: 'Kept (Default).',
          text: 'Your ThriftBucks on a trip are saved to your account in full, automatically. They can be used from the day after the trip through the 30th day after it, at full value, and then they expire.',
        },
        {
          n: '4.2',
          label: 'Redeemed instantly.',
          text: "If you tell the cashier, you may instead redeem that trip's ThriftBucks instantly, at 50% of their value, taken off that day's price and rounded to the cent in your favor. One choice covers the whole trip.",
        },
        { n: '4.3', text: 'Instant redemption is not offered when Thrift+ credit covers the whole total (§5).' },
      ],
    },
    {
      num: 5,
      title: 'Using ThriftBucks and Thrift+ credit',
      clauses: [
        {
          n: '5.1',
          text: 'Thrift+ credit is always used first, automatically, as a payment after tax. Kept ThriftBucks apply to what is left, soonest use-by date first, as a reduction in price before tax.',
        },
        {
          n: '5.2',
          text: "ThriftBucks can't be used on consignment items; Thrift+ credit can. Items bought with ThriftBucks or Thrift+ credit still collect ThriftBucks.",
        },
        {
          n: '5.3',
          text: 'Your ThriftBucks, their use-by dates and your Thrift+ credit are shown on your receipts and in My account.',
        },
      ],
    },
    {
      num: 6,
      title: 'No cash value; no transfers',
      clauses: [
        {
          n: '6.1',
          text: 'ThriftBucks are a loyalty reward from Eco-Thrift, not something you buy. ThriftBucks have no cash value.',
        },
        {
          n: '6.2',
          text: "ThriftBucks and Thrift+ credit can't be sold, traded or transferred to anyone outside your membership.",
        },
        { n: '6.3', text: 'Nothing is charged to collect, keep or use ThriftBucks.' },
        {
          n: '6.4',
          text: 'If your phone is lost, or someone else has seen your member QR, ask at any register: we replace your member code, the old one stops at once, and your app shows the new one. Your ThriftBucks and credit stay on your account.',
        },
      ],
    },
    {
      num: 7,
      title: 'Thrift+ credit',
      clauses: [
        { n: '7.1', text: 'Thrift+ credit is the money part of a return (§8). It never expires.' },
        {
          n: '7.2',
          text: "Thrift+ credit can't be exchanged for cash, except as §8.5 provides or where the law requires. Thrift+ credit unused for 3 years is reported to the Nebraska State Treasurer as the law requires.",
        },
      ],
    },
    {
      num: 8,
      title: 'Thrift+ 3-day returns',
      clauses: [
        { n: '8.1', label: 'Who.', text: 'The Thrift+ member who bought the item on their account.' },
        {
          n: '8.2',
          label: 'What can be returned.',
          text: 'Items your receipt marks "3-day return", for any reason. We don\'t ask why, and we don\'t test items. Items marked AS IS on the tag or receipt can\'t be returned.',
        },
        {
          n: '8.3',
          label: 'How long.',
          text: "3 calendar days after the day of sale. Bought on a Monday? Bring it back by Thursday. The period isn't extended for a customer's reasons.",
        },
        {
          n: '8.4',
          label: 'How.',
          steps: [
            'Bring the item to any register within 3 days with the member QR in your Thrift+ app or the phone number on your account.',
            'It must be the item from that trip, not broken, damaged or heavily used after the sale.',
            'If we say no, you may ask a manager to review.',
          ],
        },
        {
          n: '8.5',
          label: 'What you get back.',
          points: [
            {
              label: 'What you paid:',
              text: '80% of what you paid for the item, tax included, as Thrift+ credit, which never expires. It is never refunded to the way you paid.',
            },
            {
              label: 'ThriftBucks you used on it:',
              text: '80% of any ThriftBucks you used come back as ThriftBucks with a fresh 30 days.',
            },
            {
              label: 'ThriftBucks the item collected:',
              text: 'you keep 20% of them. We take back the other 80% from your unspent ThriftBucks. If those were already spent, your credit is reduced by that amount; if they already expired, nothing is taken.',
            },
            {
              label: "When it's settled:",
              text: 'the return is settled on the day you bring it back, and no earlier receipt changes.',
            },
            { label: 'No swaps:', text: 'a return is never an exchange for another item.' },
            {
              label: 'Cash:',
              text: "if we can't provide usable Thrift+ credit (for example, if the store closes or your membership ends), we refund the same amount in cash.",
            },
          ],
        },
        {
          n: '8.6',
          label: 'Not a warranty.',
          text: '3-day returns are a return privilege for members. They are not a warranty, and every item is sold AS IS (§9).',
        },
        {
          n: '8.7',
          label: 'Too many returns.',
          text: 'We keep a record of returns. If a member returns items too often, or misuses returns, we may limit or refuse their returns, or end their membership (§11.3).',
        },
      ],
    },
    {
      num: 9,
      title: 'AS IS sales',
      clauses: [
        {
          n: '9.1',
          text: 'Every item is sold AS IS, with all faults, with no warranties, express or implied, including merchantability. Non-members: all sales final. Members may return qualifying items under §8.',
        },
      ],
    },
    {
      num: 10,
      title: 'Your photo, ID and email',
      clauses: [
        {
          n: '10.1',
          label: 'Photo.',
          text: "We take your photo at the register. It is used only so staff can confirm it's you. It is never used for marketing, shared, or used for face recognition. We delete it 24 months after your last purchase, or within 30 days of your request.",
        },
        {
          n: '10.2',
          label: 'ID.',
          text: 'Staff look at your photo ID once to check your name, age and face. Nothing from your ID is scanned, copied or kept. We record only that it was checked, by whom and when.',
        },
        {
          n: '10.3',
          label: 'Email.',
          text: "An email is optional. If you give one, we send receipts and Thrift+ updates, and store news that you can turn off at any time (the unsubscribe link in every store news email, My account, or any register). We don't send text messages.",
        },
        {
          n: '10.4',
          label: 'Signing in.',
          text: 'There is no password. Your join email has a link that signs you in to the Thrift+ app. On a new phone, or after you sign out, tap "Email me a sign-in link": we email you a link that works once and only for a short time (up to 30 minutes). A phone stays signed in for a year while you use it; signing out ends it.',
        },
      ],
    },
    {
      num: 11,
      title: 'Changes and ending',
      clauses: [
        {
          n: '11.1',
          text: 'We may change or end Thrift+ going forward. We will post notice in the store and at ecothrift.us before a change takes effect.',
        },
        {
          n: '11.2',
          text: 'ThriftBucks already collected stay usable until their use-by date, and Thrift+ credit is always honored or paid in cash.',
        },
        {
          n: '11.3',
          text: 'A membership ended for misuse loses its unused ThriftBucks; its Thrift+ credit is still honored.',
        },
      ],
    },
    {
      num: 12,
      title: 'Contact',
      clauses: [{ text: 'EcoThrift LLC · 8425 West Center Road, Omaha, NE 68124 · (402) 881-9861 · ecothrift.us' }],
    },
  ],
}
