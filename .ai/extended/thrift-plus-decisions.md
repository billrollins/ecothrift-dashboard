<!-- Last updated: 2026-10-01 (the owner's final answers) -->
# Thrift+ decisions (owner's final answers, 2026-10-01)

**This file is the current word on Thrift+ rules.** Where it differs from [`thrift-plus-legal-memo.md`](thrift-plus-legal-memo.md) or [`thrift-plus-limited-warranty.md`](thrift-plus-limited-warranty.md), this file wins (the differences come from a later warranty and tax discussion). Where it differs from older notes in `discount-logic.md` or `thrift_plus_rewards.md` (banked rewards, the cover, 95% returns, "instant rebate"), this file wins and those need updating as each piece is built. Items marked **OPEN** still wait for the owner.

**Build status: nothing below is built yet** unless a line says so. Target for the register and tax work: the 10-12 / 10-13 ships.

## A. Returns and warranty

1. **Defect-only (main function), as a Limited Warranty.** Title: "Thrift+ Limited Warranty".
2. **3 days**, counted after the day of sale (bought Monday, back by Thursday). If the store is closed on day 3, the next open day counts. **OPEN: keep 3, or 7.**
3. **Store credit for 90% of the price paid, plus the sales tax on that amount.** Show it as the credit amount. Never call the 10% a "restocking fee" or any kind of fee. "Price paid" = the item's net price after the member discount. It never includes Thrift+ Balance loaded in the same sale. *(Was 95%.)*
4. **Credit the tax on the 90%.** $100 item at 7%: $90 credit plus $6.30 tax; the store keeps $10 plus $0.70 tax.
5. **Cash fallback only:** if store credit can't be used, refund the same amount in cash.
6. **Exclusions changed:**
   - **"Untested" is no longer an exclusion.** Most stock can't be tested, so the warranty covers untested items by default.
   - Excluded items: items flagged **NO THRIFT+ WARRANTY** (sold as-is or for parts); clothing and soft goods; 18+ items; crossbows.
   - Not covered on any item: scratches, wear, missing small parts, change of mind.
   - **Add a `no_warranty` flag to inventory items.** Member purchases are covered unless that flag is set or the item is in an excluded category.
   - **OPEN: add "items under $5 not covered"? yes/no.**
7. **Signs and tags:**
   - Existing "AS-IS No Returns" signs get one added line: "Only exception: Thrift+ members get a 3-day Limited Warranty on covered items. Ask at the register."
   - A small **NO THRIFT+ WARRANTY** sticker goes only on items deliberately sold as-is or for parts. No other tag changes.
   - Area signs in clothing, 18+ and crossbow areas: "NO THRIFT+ WARRANTY. Items here are sold as is to everyone. Final sale."
8. **Receipts:**
   - Members: each line marked **LW** (covered) or **NO WARRANTY**. Add: "LW items: Thrift+ Limited Warranty, 3 days, store credit. Full terms at the register (v. [date])." and "Other items: SOLD AS IS, NO WARRANTIES, INCLUDING MERCHANTABILITY."
   - Guests: "ALL ITEMS SOLD AS IS, NO WARRANTIES, INCLUDING MERCHANTABILITY. ALL SALES FINAL."
9. **OPEN: the address and phone for the poster.**

## B. Money

10. **Store credit never expires and has no fees.**
11. **Banked rewards are replaced by Thrift+ Balance** (below). It never expires and has no fees.
12. The instant reward is a **"Member discount"** line, applied before tax.
13. **Store credit and Thrift+ Balance are tenders, applied after tax.** The sale is taxed on its full price.
14. **Yes: ship the register tax changes in 10 to 13**, along with the Thrift+ Balance flow.
15. **OPEN: keep the monthly $10 threshold, change the amount, or drop it.**
16. Wording: **"Rewards start after your first $10 of rewards each month."** Remove "covers your card" everywhere. Nothing may be described as paying for membership.
17. **"No cash value"** on rewards, store credit and Thrift+ Balance. The only exception is the warranty cash fallback (#5). **Never use "Thrift+ Cash" as a name.**

## C. Wording and marketing

18. Replace **"instant rebate" with "member discount"** everywhere: app, register, receipts.
19. Slogan: **"Thrift+ members: the longer it waits, the less you pay."**
20. **Yes, publish the reward schedule** in the terms and in store. *(Reverses "never published".)*
21. **OPEN:** the size of "Rewards this trip" on the receipt.
22. **OPEN:** the launch email.
23. **Yes, draft the terms and privacy notice**; the attorney reviews them. Include the warranty, the Thrift+ Balance terms, and the rule that program changes apply only going forward.

## D. Signup, ID and photo

24. **The photo is optional.** Members without a photo show ID at each 18+ sale.
25. **Photo consent by a tap** on a customer-facing screen: "Used only so staff can confirm it's you. Never used for marketing, never shared, never run through face recognition."
26. **Minimum signup age 13.** **OPEN: members under 18 allowed? With parent consent?**
27. **Delete the photo** 24 months after the last purchase, or within 30 days of a request.
28. **ID notice:** "We look at your ID to confirm your name and that you're 18 or older. We don't scan, copy or keep it."
29. **A cashier photo-match confirm step for 18+ sales**, logged with cashier ID and time.
30. **An unchecked text opt-in** with written-consent wording, saying consent isn't a condition of purchase.

## E. Launch and release

31. **OPEN:** stock already on the floor (real age, a cap, or start fresh). Due 10-13.
32. **Keep the floor at 10% of the tag.**
33. **OPEN:** calculator sliders.
34. **OPEN:** the customer scanner's release date (planned Thu 10-08).
35. v2.112.0: shipped 2026-10-01 (see the calendar).

## New: Thrift+ Balance replaces banked rewards

When a member banks a reward, it becomes a **real gift-card purchase**, not a relabel of a full-price sale.

- **Register prompt every time:** "Take $X off, or bank it as $X × 1.05 Thrift+ Balance?" The default is take it off. Log which the member chose.
- **Banking rings two lines:**
  - the item with "Member discount −$X" (taxable on the net);
  - a separate **non-taxable** item code, "Thrift+ Balance load $X", credited at 105%.
- **Example:** $100 item with a $90 reward. Taxable: $10. Tax: $0.70. Balance load: $90, credited as $94.50. Customer pays $100.70.
- **Ledger:** per member: loads, the 5% bonus, redemptions and the running balance. Show the balance on every receipt and in the app.
- **Redemption:** Thrift+ Balance is a tender applied after tax. Never apply it as a discount before tax.
- **Two separate buckets:** purchased Thrift+ Balance, and unbanked rewards (including the monthly $10). Free rewards only become balance through the banking step.
- **Wording:** once loaded, never call the value a "reward". Every record, export, receipt and app screen says "item $10, balance load $90", never "paid $100, banked $90".
- **Card and receipt text:** "Thrift+ Balance never expires. No fees. No cash value."
- **Reporting:** the balance load is excluded from taxable sales and from Form 10 gross sales of goods. The balance is a liability until spent.
- **Returns:** warranty credit for an item is based on the item's net price. The balance load stays on the account and is not part of the item's price.
- **Optional:** let members load balance with plain cash.

## Warranty poster

Use the final text in [`thrift-plus-limited-warranty.md`](thrift-plus-limited-warranty.md), with **90%**, the **NO THRIFT+ WARRANTY** exclusion (not "untested"), and the line "We can't test most items. This warranty covers them anyway." Print a version date on the poster and on receipts. Keep every past version.

## Still open (the owner writes back)

| # | Question |
|---|---|
| 2 | Warranty: 3 days or 7 |
| 6 | Items under $5 not covered: yes or no |
| 9 | Address and phone for the poster |
| 15 | The monthly $10 threshold: keep, change, or drop |
| 21 | "Rewards this trip" size on the receipt |
| 22 | The launch email |
| 26 | Members under 18: allowed? With parent consent? |
| 31 | Stock already on the floor |
| 33 | Calculator sliders |
| 34 | Scanner release date |
