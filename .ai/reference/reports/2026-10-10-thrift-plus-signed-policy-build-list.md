<!-- Last updated: 2026-10-10 -->
# Thrift+ signed policy: the build list (system, Dash, register, scanner, website)

From the poster session (Thrift+ poster generation, 10-09 to 10-10). Bill and Carrie signed the Thrift+ policy on 10-09. Bill then settled the remaining details while we made the posters.

**Every rule is in the rulebook, [`../../extended/thrift-plus-decisions.md`](../../extended/thrift-plus-decisions.md).** IDs below point into it, and the rulebook wins over this list.

**Split (Bill, 10-10):**
- **Main session (`data_platform`):** all code, which is everything below.
- **Poster session:** the documents (rulebook, terms and FAQ wording, the full Limited Warranty text, the poster record).

**Uncommitted in the main tree:** the poster session's edits are in `.ai/` only:
- `.ai/extended/thrift-plus-decisions.md`, `.ai/context.md`, `.ai/initiatives/thrift_plus_launch_kit.md`;
- `.ai/reference/thrift-plus-posters/` (02, 06, 07), `.ai/reference/retired-pages/`, this report.

They are safe to ship with your next release. The poster build itself lives in `workspace/` (not in git).

## A. Reward engine

- **P3:**
  - after a 7-day wait, rewards grow 0.75% of the tag a day, **up to 95% of the tag** (was 90%);
  - no bonus for saving;
  - the engine still uses tag ÷ 90 a day (due 10-13).
- **P4:** stock on the floor at launch starts at **one third of its real age, at most 45 days**, then ages a day per day. The 7-day wait still applies (9 days old at launch: starts at day 3).
- **P5:** back stock:
  - age is frozen while an item is in back stock;
  - moving an item to back stock resets its age to 0, and the old age stays in its history;
  - the owner can resume the old age (owner-only, O1).
- **P6:** families of look-alikes:
  - they earn **nothing until the owner confirms** the family, shown as a large alert on the owner's page;
  - the owner sets a pace (sold per 90 days); rewards rise slowly toward it and **never come down**;
  - a watch list shows past sales, floor count, back stock count and prices;
  - the owner can change the pace, pause, or break a family apart;
  - a break-apart keeps today's prices, then each item moves on its own (the exact rule is still open: the owner calls it semi-firm).

## B. Full and Instant rewards

- **B1:** the **Full reward is the default and automatic**. The Instant reward (80% of the Full reward, off today's price) happens **only when the member tells the cashier**: the register stops asking every trip. v2.160.0 made Full the scanner's default; the register flow still needs this change.
- **B5:** a Full reward is usable **from the day after the sale through day 30**, then it expires. Only the Instant reward is used on the trip that earned it.
- **C5:** an unpaid cover takes **no benefit away** (rewards, warranty, holds, everything). v2.160.0's cover popup already says so.

## C. Limited Warranty and returns

- **W1, W10:** the one qualifying reason is that the **primary function** doesn't work. Processing (with AI) marks each item covered or not when it is priced. The mark shows on the item, the receipt line (A3) and the scanner.
- **W2:** 7 calendar days after the day of sale; **nothing extends it automatically**. The only exception: the store was closed and **the owner** authorizes it (logged, O1).
- **W3:** 80% of what they paid, tax included, back as **Thrift+ credit** (never expires; cash fallback). 80% of any Rewards used on the item come back as Rewards with a fresh 30 days. **The system still refunds 95%** (v2.160.0 notes), so this needs changing to 80%.
- **W4:** the member **keeps 20%** of the rewards the item earned. The other 80% is taken back:
  - first from what the item put into this month's cover;
  - then from unspent Rewards, soonest use-by first;
  - if those were already spent, the refund is reduced by the shortfall;
  - if they already expired, nothing is taken.
- **W6:** not covered:
  - clothing and soft goods, consumables, items without a primary function, parts, items marked AS IS;
  - **$10 or less after the reward** (price minus reward). This is a **setting**, default $10. The owner confirmed "after the reward" knowing a long-sitting item can drop under it.
  - 18+ items and crossbows are **not** excluded as a group.
- **W11:** a return is **settled on the return day** as a new transaction. Past trips, covers and tax are never reopened.
- **W12, W13:** the return happens at the register as a **cart line, from a Return button**:
  - **no swaps**;
  - the member comes from the cart, a card scan, or the last 4 of their phone;
  - their trips show newest first (trip number, date, item count), each opening like a drawer;
  - **one search box** takes a trip number (scannable from the receipt), an item number or description words, and opens every matching trip;
  - clicking an item shows whether it qualifies, and why not when it doesn't;
  - the normal path is click, scan, click, click.
- **O1:** an **owner-only authorizations list**, with a log of who asked, who approved, when and why:
  - a late warranty claim (store closed);
  - confirming, pacing, pausing or breaking a family;
  - resuming an item's age after back stock.

## D. Words, everywhere members look

Scanner, register, receipts, Dash, website.

- **"Instant reward"** and **"Full reward"**. "Instant is 80% of the Full reward." The label is **"Default"** (not "Automatic").
- **Never:** "bank" or "banked", "use now", "20% less", "Member price", "earn" (say **"collect"**), "pays for".
- **The cover:** the noun is "cover" and the verb is "covers": "The first $10 of Rewards you collect each month **covers** your card."
- **Rewards grow as an item sits, up to 95% of the tag.** The cap may be printed; the daily rate never is (P8).
- **J3:** "18+. ID is used only for verification." Members are 18+, and nothing from the ID is kept.
- **The warranty example:** "A blender blends. A mower mows." (not a lamp: a dead bulb is a part).

## E. Website

- **`ecothrift.us/terms`.** One address on every poster QR. The poster session writes its wording; you build the page. It holds:
  - an English/Spanish toggle;
  - a short, friendly "all you need to know";
  - one simple chart of every detail, each row numbered (A.1 …), where tapping a number jumps to the legal section that covers it in full;
  - a plain FAQ;
  - the full legal text, deliberately less eye-catching;
  - the live member perks (M1 to M4);
  - **big Scanner and Join buttons, each with its QR**, so any poster QR leads anywhere.
- **`ecothrift.us/join`.** One quick sign-up:
  - it is **the same page as the shop's customer sign-up for Holds** (one account system; smoother if possible);
  - Login, Join and the Thrift+ button go there; `/rewards`, `/thriftplus` and `/card` redirect to it;
  - **the phone start (J8):** name, phone, email; then finish at any register (photo, photo ID, signature).
- **A link to the terms** in the site footer.
- `ecothrift.us/scan` already works (it is the scanner QR on the posters).

## F. Scanner

- **A Thrift+ explainer popup:** the basics, the live perks (M1 to M4), and a link to the full terms.
- **The words in D throughout.**
- The poster's phone shows the scanner as of 10-10: the coupon brick, the velvet rope, and the **cart-bag** pill. The cart-bag change is uncommitted in the main tree (`ScannerTop.tsx`, `scannerTheme.tsx`, `cart-bag.webp`). Tell the poster session if that art changes, and the screenshot gets retaken.

## G. Receipts (A3, V6, B12)

- Each line is marked **Limited Warranty** or **AS IS**; guest receipts say all AS IS.
- Full rewards are shown with their **use-by date**, plus the balances.

## H. Member perks ("and more", M1 to M4)

- **M1:** online holds (live).
- **M2:** first pick on consignment (planned; ranked by total Rewards or tenure).
- **M3:** member-only sales for members who turn on event notifications (planned; email only).
- **M4:** more in the scanner (planned).

They are listed on `/terms`, its FAQ and the scanner explainer, never on the posters, and **never promised before built**.

## Posters (done, being test-printed)

- **Files:** `workspace/posters2/print/` (13 x 19 PDFs).
- **Record:** `.ai/reference/thrift-plus-posters/` (06-log has every decision).
- **QR targets:** `/join`, `/terms` (both to build) and `/scan`.
