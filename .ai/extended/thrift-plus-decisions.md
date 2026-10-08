<!-- Last updated: 2026-10-08 (rebuilt as the one Thrift+ rulebook) -->
# Thrift+ rulebook

**The one place for every Thrift+ rule.** It replaces the 10-01 decisions list and wins over the legal memo, the warranty review, the launch kit notes and the older design notes in `thrift_plus_rewards.md` wherever they differ. Owner decisions are made on the rulebook page (https://claude.ai/artifact/GpgB6SUsKkiKkNBRJj31W4) and folded in here; then the rule's status becomes **Decided**. Code follows this file. A conflict or open item is never built on a guess.

Statuses: **Decided** · **How it works today** (a fact of the current build) · **Conflict** (two earlier answers disagree) · **Open** (no answer yet) · **CPA / attorney**. "Built" says whether production does it.

## The monthly $10 cover

*The biggest open question. It decides whether the signs can say "Free" and "Every Day".*

- **F1. What a banked reward legally is** (OPEN). Four candidates, compared question by question on one grid: https://claude.ai/artifact/AnH8RuYAKANXGoqBq1crxf. 1 Discount only (no banking). 2 Gift card: the member pays for Thrift+ credit with the rewards (x1.05). 3 Store credit: the member pays the tag and the store issues credit (x1.05). 4 Cash back, Kohl's Cash style: a dated reward certificate (x1.05) for a later trip. The taxes, legal lines and wind-down exposure follow from this pick.
  - Choices: "1. Discount only" / "2. Gift card" / "3. Store credit" / "4. Cash back"
  - Source: Your message 10-08. Built: n/a.
- **F2. What a warranty refund legally is** (OPEN). The 90% (tax included) goes back as credit on the same balance as banking, or as a cash or card refund. A refund was paid for, so it can never be a dated promotional certificate. Credit from a return may be reportable to the state after 3 years even on a gift card (the attorney confirms).
  - Choices: "Credit on the same balance (cash fallback)" / "Cash or card refund"
  - Source: Your message 10-08. Built: n/a.
- **C1. How the cover works today** (How it works today). The first $10 of a member's savings each calendar month pays for the membership. It resets on the 1st and never rolls over. Until $10 has been saved that month, the member pays the tag. Active staff are exempt (when the staff switch is on).
  - Source: Design 2026-09-25; built v2.110.0. Built: Yes.
- **C2. Keep the cover?** (Decided). Always. Every candidate keeps the $10 monthly cover.
  - Source: Your message 10-08 ("Always have a cover"). Built: Yes (it is on today).
- **C3. Cover wording (if the cover stays)** (Decided). Your words. Say the cover line every time "free" appears; the attorney checks "free" next to the cover.
  - Customer words: "Free to get your card. Your first $10 of rewards each month covers it, so you never pay anything out of pocket."
  - Source: Your message 10-08 (replaces 10-01 #16). Built: n/a.
- **C4. When we may say "Free"** (Decided). Only if the cover is dropped. With the cover: "No fee. Nothing out of pocket."
  - Source: Legal review; follows C2. Built: n/a.

## Joining

*Who can join and what a card needs before it works.*

- **J1. Who can join** (Decided). 18 or older. One membership holds up to 2 adults; both must be there to add the second, and the primary approves.
  - Source: 10-08 page (age); design 09-25 (2 adults). Built: Partly (2 adults yes; the age rule is not enforced yet).
- **J2. What a card needs before it works** (Decided). A photo, the required info (name and phone), an ID check, and a signature. Until all four are done the card is "not ready" and gives no Member Price.
  - Source: Owners' meeting 10-07. Built: No (due 10-12).
- **J3. The ID check** (Decided). Staff look at a photo ID to confirm the name, the age and that the face matches. Nothing from the ID is scanned, copied or kept: only "ID checked", by whom, when, and the 18+ flag.
  - Customer words: "We check your ID for age and keep nothing from it."
  - Source: 10-01 #28; meeting 10-07. Built: Partly.
- **J4. The photo** (Decided). Taken with the register's webcam at signup. Used only so staff can confirm it is you: never for marketing, never shared, never face recognition. Deleted 24 months after the last purchase, or within 30 days of a request.
  - Customer words: "Your photo protects your card balance."
  - Source: 10-01 #25 #27; 10-08 (webcam). Built: Partly (a file picker today; the webcam view is due 10-12).
- **J5. The signature** (CPA / attorney). Signed on the register's touch screen. It covers the photo release and says the member can read the full Thrift+ terms (QR and website). Ask the attorney: is that enough to bind the terms and the release?
  - Customer words: "I agree to the Thrift+ terms and the photo release. I can read them at ecothrift.us/thriftplus. (draft)"
  - Source: Meeting 10-07; 10-08 (touch screen). Built: No (due 10-12).
- **J6. Staff memberships** (Decided). Free for active staff (no monthly cover) while your "Thrift+ free for staff" switch is on. It starts off. There is no other staff discount.
  - Source: 10-07. Built: Yes.
- **J7. 18+ items** (Decided). Membership never replaces the ID check: staff check ID at every 18+ sale.
  - Customer words: "18+ items: ID checked every time."
  - Source: Meeting 10-07. Built: Yes.
- **J8. Joining from a phone** (OPEN). Not possible today: every member signs up at a register. The sign reviewers suggest "start on your phone, finish at the register" so a 2-minute signup doesn't hold up the line on a Saturday.
  - Choices: "After launch" / "Before launch" / "No"
  - Source: Sign review 10-08. Built: No.

## Member Price

*What members pay, and how it moves.*

- **P1. Guests and members** (Decided). Guests pay the tag. Members pay Member Price (the tag minus the member discount) on almost everything. Not included: consignment items, an item's first 7 days on the floor, and back stock not yet seen on the floor.
  - Customer words: "Lower prices on almost everything."
  - Source: Design 09-25; 10-08. Built: Yes.
- **P2. The word members see** (Decided). "Rewards", in the app, on signs and receipts, and in general. Shoppers feel discounts as "I should have waited"; rewards feel like money they get today. "Member price" is used only as a plain description (tag minus rewards), never as the headline.
  - Source: Your message 10-08 (replaces "Member Price Always" and "Every Day"). Built: No (the app and register say "Member Price" and "Member discount" today).
- **P3. How Member Price grows** (Decided). After a 7-day wait the discount grows by 0.75% of the tag a day. A member never pays less than 10% of the tag. Changes happen overnight, and a discount never shrinks (except when an item is retagged).
  - Source: 10-08 (rate, wait); 10-01 #32 (floor). Built: No (the engine still uses the tag ÷ 90 a day; due 10-13).
- **P4. Launch jump start** (Decided). Stock already on the floor at launch counts as half its real age, at most 45 days.
  - Source: 10-08. Built: No (due 10-13).
- **P5. Back stock** (Decided). Anything not scanned in the last inventory and not processed since is back stock or shrink: no Member Price. Once it is scanned on the floor it matches its look-alikes already there (day 1 if there are none).
  - Source: 10-08. Built: No (due 10-13).
- **P6. Pacing duplicates and look-alikes** (Decided). Copies of one product, and look-alikes grouped as a family, share one pace, by the smooth rule: aim to sell the starting count ÷ 90 a day, whatever the days left; hold while on pace; grow up to 0.75% a day in proportion to how far behind; no deadline jump. The owner can set a family's own target (for example "sell 300 of these 900 in 90 days") and can pause discounting for a family. A daily review shows each family, its sales, and why it held or grew.
  - Source: Your answer 10-08 (launch kit). Built: Partly (pacing is built, not smooth; the controls and review are not).
- **P11. Back stock and the floor** (Decided). Dash shows clearly how many of each product are on the floor and how many are in back stock (or overstock). Staff mark items moved from back stock to the floor on their own page, and Dash suggests which items should move either way.
  - Source: Your answer 10-08 (launch kit). Built: No.
- **P7. What we say about the formula** (Decided). The formula is never published. The terms say only this line:
  - Customer words: "Member Price is set by Eco-Thrift, can change from day to day, and is shown in the Thrift+ scanner and at the register."
  - Source: 10-08 (replaces 10-01 #20 "publish the schedule"). Built: n/a.
- **P8. No cash value** (Decided). The member discount has no cash value.
  - Customer words: "Member Price has no cash value."
  - Source: 10-01 #17. Built: n/a.
- **P9. On the receipt** (Decided). A "Member discount" line, before tax. Never "instant rebate".
  - Source: 10-01 #12 #18. Built: Partly.
- **P10. Numbers on signs** (Decided). A number such as "members save about 18%" or "on 90% of items" goes on a sign only if the Calculator shows it true on launch day.
  - Source: Meeting 10-07. Built: n/a.

## Banking and the gift card

*Take the savings now, or bank them on a gift card.*

- **B1. Take it now, or bank it** (Decided). At checkout the register asks every time: take the savings now (pay Member Price), or bank them (pay the tag; the savings buy a gift card refill plus a 5% bonus). The default is take it now, and the choice is logged.
  - Customer words: "Pay $16.40, or pay $20.00 and get $3.78 on your Thrift+ gift card."
  - Source: 10-01; meeting 10-07. Built: Partly (banking is built as "banked rewards"; the gift card is not).
- **B2. What we call it** (Decided). "Thrift+ credit". Banking buys Thrift+ credit with the rewards, credited at 1.05x.
  - Source: Your message 10-08 (replaces "Thrift+ Balance" and "gift card"). Built: No.
- **B3. Expiry and fees** (Decided). Thrift+ credit never expires and has no fees. Getting a card is free today; say nothing that promises replacement cards will always be free.
  - Customer words: "Never expires. No fees on your credit."
  - Source: Meeting 10-07; your message 10-08 (replacement cards). Built: n/a.
- **B4. Cash for the credit** (CONFLICT). Recommended: rewards say "no cash value" (true: they are money off a price). Thrift+ credit was paid for, so it says "not redeemable for cash except where the law requires" (Nebraska has no small-balance cash-out rule that we know of; the attorney confirms). Neither label protects the store in a wind-down: credit holders are creditors whatever the card says. The protection is in B9.
  - Choices: "As recommended" / ""No cash value" on both"
  - Source: 10-01 #17; your question 10-08. Built: n/a.
- **B5. Spending it** (Decided). Pays for anything at Eco-Thrift, as a payment after tax.
  - Source: 10-01 #13. Built: No.
- **B6. Buying a gift card outright** (OPEN). Let anyone load a Thrift+ gift card with cash or a card at the register (no bonus).
  - Choices: "Yes" / "Not now"
  - Source: 10-01 (optional). Built: No.
- **B7. Unclaimed property** (CPA / attorney). In Nebraska a gift card with no expiry and no fees is never presumed abandoned, but a return credit is reported to the state after 3 years. Ask the attorney: does a warranty refund put on the gift card count as a gift card?
  - Source: Legal memo. Built: n/a.
- **B8. Gift card disclosures** (CPA / attorney). The exact federal gift card wording for the card, the receipts and the terms. The attorney drafts it or checks Claude's draft.
  - Source: Legal memo. Built: n/a.
- **B9. Wind-down safeguards** (OPEN). So outstanding credit can never outrun the store: keep the cash received for credit in a separate account (members paid the tag, so the money is already in); cap each member's credit (banking stops at the cap); keep the right to stop new banking or end rewards going forward, with credit already issued always honored; show the total owed in Dash daily. Applies to forms A and B.
  - Choices: "All four, cap $200" / "All four, cap $100" / "All four, my cap (note)" / "Not now"
  - Source: Your question 10-08. Built: Partly (the Overview shows what is owed).

## Limited Warranty and returns

*What members can bring back, and what they get.*

- **W1. What it covers** (Decided). "Thrift+ Limited Warranty", for members only: an item whose main function doesn't work (a lamp lights, a blender blends). Untested items are covered.
  - Customer words: "We can't test most items. This warranty covers them anyway."
  - Source: 10-01; meeting 10-07. Built: Partly.
- **W2. How long** (Decided). 7 days, counted after the day of sale. If the store is closed on day 7, the next open day counts.
  - Source: Meeting 10-07 (7 days); 10-01 (counting). Built: No (built for 3 days).
- **W3. What they get back** (Decided). 90% of everything they paid for the item, tax included, on the Thrift+ gift card. That is the only remedy, with one fallback: if the gift card can't be used, the same amount in cash.
  - Customer words: "90% of what you paid, tax included, on your Thrift+ gift card."
  - Source: 10-08 page; 10-01 #5 (cash fallback). Built: No (built as 95% store credit before tax).
- **W4. Not covered** (Decided). Items marked NO THRIFT+ WARRANTY (sold as-is or for parts), clothing and soft goods, 18+ items, crossbows. Never covered on any item: scratches, wear, missing small parts, a change of mind.
  - Source: 10-01 #6. Built: Partly.
- **W5. Items under $5** (OPEN). Leave items under $5 out of the warranty?
  - Choices: "Covered (no limit)" / "Not covered under $5"
  - Source: 10-01 (open). Built: n/a.
- **W6. Making a claim** (Decided). Bring the item with the card or the phone number (the sales record proves the sale). Staff check the main function. A member can ask a manager to review a no.
  - Source: Legal review; 10-01. Built: Partly.
- **W7. Where the full text lives** (Decided). The full warranty, version-dated, as printed copies at every register and at ecothrift.us/thriftplus/warranty. Old versions are kept. It names Eco-Thrift LLC, 8425 West Center Road, Omaha, NE 68124, (402) 881-9861.
  - Source: 10-01; 10-08 (address). Built: No (the page is due 10-12).
- **W8. Guests** (Decided). Everything is sold AS IS. All sales final.
  - Customer words: "All sales final. Sold AS IS."
  - Source: Design. Built: Yes.

## AS IS notices

*How everyone learns that everything else is final.*

- **A1. Tags** (Decided). No AS IS stamps on regular tags (too much stock).
  - Source: 10-08. Built: n/a.
- **A2. Receipts and the app** (Decided). Member receipts mark each line Limited Warranty or AS IS; guest receipts say everything is AS IS. The scanner app says it too.
  - Source: 10-08; 10-01 #8. Built: No (with the receipt work).
- **A3. The three store signs** (Decided). Prices (racks), Returns with a bold SOLD AS IS box (registers), and Meet Thrift+ (entrance) with the disclaimers.
  - Source: 10-08; signs v3. Built: n/a.
- **A4. Signs in the excluded areas** (CONFLICT). The legal review says each excluded category needs its own AS IS notice before the sale, or those items keep an implied warranty: small signs in the clothing, 18+ and crossbow areas ("NO THRIFT+ WARRANTY. Sold as is to everyone. Final sale."). The 10-08 plan has only the three main signs.
  - Choices: "Add the 3 small area signs" / "No area signs (accept the risk)"
  - Source: Legal review; 10-01 #7; 10-08. Built: n/a.
- **A5. Items sold as-is on purpose** (OPEN). For items deliberately sold as-is or for parts: a small NO THRIFT+ WARRANTY sticker (10-01), or only the Dash flag and the receipt (10-08: no stamps)?
  - Choices: "Sticker on those items only" / "Dash flag and receipt only"
  - Source: 10-01 #7; 10-08. Built: No.

## Sales tax

*What is taxed, and when.*

- **T1. The member discount** (Decided). Lowers the taxable price.
  - Source: Legal memo; CPA agreed 10-01. Built: No.
- **T2. Loading a gift card** (Decided). Not taxed. Kept out of taxable sales and Form 10 gross sales; a liability until it is spent.
  - Source: Legal memo; CPA agreed 10-01. Built: No.
- **T3. Paying with a gift card** (Decided). A payment after tax: the sale is taxed on its full price.
  - Source: Legal memo; CPA agreed 10-01. Built: No.
- **T4. Warranty refunds** (Decided). The 90% includes the tax, so the store takes that tax back on its return.
  - Source: 10-08. Built: No.
- **T5. The 5% bonus** (CPA / attorney). Ask the CPA: when bonus value is spent, is it a payment (the full price is taxed) or a store discount (it lowers the taxable price)?
  - Source: Open since 10-07. Built: n/a.
- **T6. The register change** (OPEN). Today the register taxes the full subtotal when credit or banked rewards are spent. Changing it to T1 to T3 needs your go.
  - Choices: "Go: build it" / "Wait"
  - Source: 10-01 #14. Built: No.

## Words and signs

*How we talk about all of this.*

- **V1. Voice** (Decided). Say what you get now, and "it might be gone tomorrow". Never "wait", "less" or "pay" as the pitch.
  - Source: Meeting 10-07. Built: n/a.
- **V2. Words we never use** (Decided). fee, dues, unlock, cash back, points, clawback, instant rebate, store credit, Thrift+ Cash, "the longer it waits".
  - Source: 10-01; meeting 10-07. Built: n/a.
- **V3. The tagline** (OPEN). It leads the website and the signup screen (the signs now lead with their own headline).
  - Choices: "Member Price Every Day." / "Today's find. Today's Member Price. Tomorrow it may be gone." / "One of a kind, at Member Price. Grab it now." / "Your own (note)"
  - Source: Launch kit. Built: n/a.
- **V4. Spanish** (OPEN). Both sign reviews suggest Spanish. The v3 signs carry one Spanish line each (a native speaker should check it).
  - Choices: "One Spanish line per sign" / "Full Spanish versions too" / "English only"
  - Source: Sign reviews 10-08. Built: n/a.
- **V6. Taxes and fine print come last** (Decided). Tax lines, legal lines and footnotes are written after the form is chosen, to match it exactly, and go to the CPA and the attorney together. No fine print is drafted against a form that may change.
  - Source: Your message 10-08. Built: n/a.
- **V5. Receipts** (Decided). Designed nearer testing, with many variations: AS IS and Limited Warranty lines apart, the bold NO REFUNDS block kept, and something good for Thrift+ at the bottom (lifetime savings or the gift card balance).
  - Source: Meeting 10-07. Built: No.

## Email (no texts)

*How we reach members and applicants.*

- **X1. Email-first: no texts** (Decided). Eco-Thrift sends no text messages; texting is parked (Twilio stays parked). Receipts, warranty returns, Thrift+ updates, store news, and applicant and staff messages all go by email from retail@ecothrift.us. At sign-up a member may give an email (optional) and tick two separate boxes, never pre-ticked and not needed to join. Every choice is recorded with the words shown. Members change them in My account, at the register, or with the unsubscribe link in every store news email. Store news to the whole list goes through a newsletter service (you pick it when the list is big enough), not the store mailbox.
  - Customer words: "Email me my Thrift+ updates (savings, gift card balance, receipts, returns). / Email me Eco-Thrift store news."
  - Source: Bill via master 2026-10-08 (D20); replaces the text boxes of v2.150.0. Built: Partly (built 10-08, not shipped; the unsubscribe link comes with the first store news email).

## Build notes (how banking rings up)

Kept from the 10-01 decisions; the name follows B2.

- Banking rings two lines: the item with "Member discount −$X" (taxed on the net), and a separate non-taxable item code "gift card load $X", credited at 105%. Example: $100 item, $90 reward: taxable $10, tax $0.70, load $90 credited as $94.50, customer pays $100.70.
- Ledger per member: loads, the 5% bonus, spending and the running balance. The balance shows on every receipt and in the app.
- Two buckets: the purchased balance, and unbanked rewards (including the monthly cover). Free rewards become balance only through the banking step. Once loaded, never call it a "reward": "item $10, gift card load $90", never "paid $100, banked $90".
- Warranty credit is based on the item's net price; a load in the same sale is not part of the item's price.

## Staff memberships (code)

The rule is J6. A membership is marked as a staff member's own in Dash (Thrift+ → Members → **This is a staff member's own membership**; `Account.staff_user`, one per person). `ledger.cover()` is $0 while the owner's switch is on (Settings → Store → Staff purchases, `pos.staff_purchases.thrift_plus_free`, off at first) and the person is active staff; when they leave, the cover comes back by itself. Code: `apps/thriftplus/services/ledger.py` `staff_free`, the `staff` action on the accounts API, `apps/pos/services/staff_purchases.py`.

## Related

- [`thrift-plus-legal-memo.md`](thrift-plus-legal-memo.md) and [`thrift-plus-limited-warranty.md`](thrift-plus-limited-warranty.md): the research behind these rules (older numbers there, such as 95% and 3 days, are superseded here).
- [`thrift-plus-demand-dimensions.md`](thrift-plus-demand-dimensions.md): later pricing ideas.
- [`../initiatives/thrift_plus_launch_kit.md`](../initiatives/thrift_plus_launch_kit.md): drafts and the launch to-do.
