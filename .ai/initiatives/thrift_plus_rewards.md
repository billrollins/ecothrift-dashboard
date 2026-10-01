<!-- initiative: slug=thrift-plus-rewards status=active updated=2026-09-25 -->
<!-- Last updated: 2026-09-25 -->

# Initiative: Thrift+ Rewards

**Status:** **Active**. Phases 1 and 2 built; Phase 1 ships Mon 09-28. **Launch: Tue 2026-10-20. Last project day: Thu 2026-10-15.** Day by day: [`.ai/calendar.md`](../calendar.md).

**Objective:** Thrift+ is a free membership whose time-based rewards replace markdowns. A member gets a lower price the longer an item sits. A guest always pays the tag price. The first $10 of rewards each month "covers the card", so the program is cash-positive and never creates an uncapped liability. At launch:
- staff can sign a member up in seconds and attach a card by scanning it;
- the register prices members and guests correctly, keeps the cover and store credit, prints the right receipts, handles member-only returns, and blocks 18+ items for unverified cards;
- customers can scan tags with the scanner app and see what they'd earn;
- the owner sees the program's numbers in Dash.

**Compass:** this file is the compass until launch. [`data_platform`](./data_platform.md) runs alongside it, as the owner's priority for everything else.

---

## Finish line

On 2026-10-20 the Thrift+ switch goes on. At the register:
- a cashier signs a customer up (ID check, photo, scan a blank card) and applies it to the current sale;
- a member's scan shows their photo and the member price;
- the receipt shows rewards and cover progress, and a guest's receipt shows what they would have earned.

A member returns a dead lamp within 3 days for store credit, and the lamp's rewards are reversed. On their phone, a member scans a tag and sees "You'd earn +$X". In Dash, the owner sees members, rewards, cover and scans-to-adds.

---

## Out of scope (for launch)

- **The banking extras** (+10% for banking, the 50% cap, dormancy). Banking itself **is** at launch (owner, 2026-09-25; see below); these extras are not, and the app never shows them.
- **Raising the cover to $20.** It waits for 60+ days of data.
- **Consignment invites** and **members-only sales and early access**. Hooks only.
- **Facial recognition.** A human looks at the photo.
- **Storing ID barcode data** (Neb. Rev. Stat. 60-4,111.01). Store only the name, phone, photo and a verified-18+ flag.
- **SMS of any kind** ("text JOIN" needs 10DLC registration; sign-in uses no texts). Not at launch.
- **Selling nicotine/vapes, alcohol, ammo or pseudoephedrine from pallets.**

---

## Design (owner, 2026-09-25; the reference spec)

**Core:**
- Free, never a bill, no cash ever owed.
- **The cover:** the first $10 of rewards each calendar month pays for the membership. After that, the rewards are theirs. It doesn't roll over, and it resets on the 1st. The code calls it `deductible`.
- Non-members are **guests**, and the tag shows the **guest price**. The register opener is "Do you have a card yet?"
- Words to avoid on signage: fee, dues, unlock, cash back, points, bonus, clawback.

**Rewards (the markdown engine):**
- Days 1–7: $0.
- From day 8: the reward grows by `starting_price / 90` a day, up to a per-item cap (the floor). The floor is never below the item's allocated cost.
- Day 90: an exit action (bundle, dollar bin, donate, scrap).
- **Bulk and product families pace by sell-through:** units left ÷ days left = the required rate. On or ahead of pace, the reward stops growing; behind pace, it keeps growing.
- **Families:** at processing, embed the item, find its neighbours, and ask an LLM "same family?" once. The daily math is deterministic, never an LLM. A last variant, or one whose scans-to-adds lags its family, resumes its own climb.
- **Hard rules:** a reward never decreases, never exceeds the floor, and recomputes overnight only. Every change is logged with a reason. The schedule is never published.
- **Signals logged per item:** days on the floor, scans, adds, passes, feedback, sale date, and the reward at sale.
- Cheap items (under about $30) barely respond, so their day-90 exit is the real markdown.

**Members, identity and cards:**
- **Signup:**
  - Check ID: the name matches, and it sets the 18+ flag.
  - Take a photo.
  - Scan a pre-printed blank card and apply it to the sale.
  - No ID means an unverified card: it earns rewards, but has no returns and no 18+ purchases.
- The photo shows on every scan.
- **Up to 2 adults per card.** Both must be present to add the second, and the primary approves. The primary can remove the second; the second can only remove themselves.
- Revocation (for theft, tag switching or return abuse) kills the whole card.
- **Data:**
  - `accounts`: internal id, cover progress, credit balance, status;
  - `people`: account, name, phone, photo, verified_18, role primary/secondary;
  - `cards`: a random code with a check digit, person, status unissued/active/dead, issued_at.
  - The card code is never the account id. Phone is a second way to look someone up.
- **Cards:** stock cards have full-colour fronts. The **back is printed by our print server** as a front/back PDF with the numbered QR and the code. Blanks are preloaded as `unissued`.

**Returns:**
- Members only, for items bought while a member.
- Primary-function failure only. Not cosmetic issues, secondary functions, missing parts, or remorse.
- Excluded: as-is, for parts, untested, clothing and soft goods, age-restricted items, crossbows.
- The window is 3 calendar days, closing at the end of day 3; if the store is closed on day 3, it extends to the next open day.
- The refund is store credit for the amount paid, and the item's rewards are reversed.
- For $100+ items, photograph the serial number and condition at sale.
- Guests: all sales final.

**Age-restricted:**
- 18+ items sell only to cards flagged verified 18+.
- Adult items: the manufacturer seal must be intact, or the item is trashed.

**Receipts:**
- **Member:** tag price, member price, rewards earned, amount to cover, month-to-date cover progress, balance.
- **Guest:** over $10 in potential rewards, "No Thrift+ card today. You lost $X" (rewards minus the cover). Under $10, "This trip would have earned $X".
- Signing up before leaving re-rings the sale as a member purchase.

**Scanner app (customer web app):**
- **Surfaces:** Scanner, My list and Home, kept separate.
- **The scan loop:**
  - an always-on camera, reading QR codes only;
  - an item card that slides up;
  - swipe right to add, swipe left to pass, then straight back to the camera.
- **The item card:**
  - a category icon, a short title (28 characters max), and details;
  - the retail struck through, and our price;
  - **"You'd earn +$X"** as the largest element;
  - an opt-in "Price feel off?" with chips. "Too high" offers three "I'd buy it at" choices: 15%, 25% and 35% under.
- **Header:** a pill showing items and rewards, and the cover bar.
- **My list** is an estimate; the register is the source of truth.
- **Ethics:** no casino mechanics and no streaks.

**Signage:**
- Three 13×19 posters: join; guest vs member price; returns.
- No percentages and no schedules on posters.

**Owner decisions, 2026-09-25 (relayed by `thrift_scanner` with the v2.107.0 mock):**
- **Banking at launch, as the member's choice per trip.** The app asks on the first add: "Would you like to bank your rewards?" (yes: bank my rewards; no: instant rebate please).
  - **The register shows the answer as an alert.** Cashiers ask too, but asking to bank at the register is the customer's responsibility.
  - The member can change the choice on the cart receipt. Clearing the cart asks again.
  - Banking still fills the month's cover first; only the rest is banked instead of coming off the price.
- **Sign-in, with no text messages:**
  - email and password (with emailed password recovery);
  - an optional short username;
  - or the Thrift+ card plus the last 4 digits of the member's phone.

  So a person gets `email` and `username` (Phase 4, the portal).
- **Scanner app:**
  - `/scan` (also `www.ecothrift.us/scan`), mobile first;
  - no truncation anywhere: titles are cut at a whole word, and AI short titles are 28 characters max;
  - a near pixel-match to the owner's design.

  The contract (types and functions) is in `frontend/src/api/thriftPlusMock.ts` on `main`; Phase 4 replaces it one-to-one. The server computes cart totals exactly like `computeCartTotals`: cover first, then instant rebate or bank.

**Open (owner):**
- Cover at $10 vs $20 (after the data comes in).
- Banking timing.
- The scanner app's final visual style.
- CPA: the owner's answers (2026-09-30): tax is on what is paid; no liability line (always "no cash value"); the 5% banking extra changes nothing. **Still open:** whether store credit expires (maybe tiered, undecided) and whether the CPA agrees with the tax rule.
- Attorney: ID scanning without storage. The owner's view: for 18+ items they see the ID as usual (look only, nothing scanned or saved). **Still open for the attorney:** whether keeping the name, phone, customer photo and a verified-18+ flag is fine, retention limits, rules for age-restricted items, and any posted notice or consent for the photo.

---

## Phases (each ships dark behind the Thrift+ switch; full pre-ship run, POS included)

### Phase 1 — Members and cards · **ship Mon 09-28 (v2.106.0)**
Members exist, staff can manage them, and card backs print from the print server.
**Gated by:** none.

Acceptance:
- [x] Models for accounts, people (photo, verified_18, role) and cards (a random code with a check digit, never the account id; unissued/active/dead), with a `thrift_plus_enabled` switch that is off. Built as `apps/thriftplus`: Account, Person, Card, CardBatch and Event; `services/members.py` holds the rules and `services/cards.py` the 12-digit Luhn codes (QR `TP` + code). Migrations `thriftplus.0001` and `0002` (the switch, off).
- [x] Import a batch of blank cards (codes generated and stored `unissued`), and a **card-back PDF**: a numbered QR plus the code, front/back pages, printed through the print server. Built as `CardBatch` (up to 500 cards) and `services/card_pdf.py` (CR80, one card per page). The print server's existing `/print/pdf-copies` takes jobs of 10, so the print server needs no change. The layout is a draft for the owner to redesign.
- [x] Staff member screens in Dash: find by card, phone or name; create; verify 18+; add or remove the second adult (with the rules above); revoke. Every change is logged. Built as the `/thrift-plus` page (Members and Card batches tabs), superuser-only in the nav until launch, over the `/api/thriftplus/` staff API; revoking and batches need Manager or Admin.
- [x] The full pre-ship run is GREEN, with 0 NEW failures in POS (R-072, 2026-09-25). Nothing is visible to customers.

### Phase 2 — The reward engine · **ship Thu 10-01 (v2.107.0)** · built early (09-25), tests R-074
Every floor item carries a reward state that recomputes nightly by the rules above, logged. A dry-run report shows what members would pay tomorrow.
**Gated by:** Phase 1.

Built as:
- **Models:** `ItemReward` (one per floor item), `RewardEvent` (changes of status or reason), `RewardRun` (each night), `RewardFamily` and `FamilyLink`; migration `thriftplus.0003`.
- **Settings** (`thriftplus.0004`): `thrift_plus_floor_share` 0.50, `thrift_plus_rewards_start` blank, and the AI action `THRIFTPLUS_FAMILY`.
- **Code:** `services/rewards.py`, the math. It is pure `step()` over plain values, with no model and no LLM, and holds `plan()` (the dry run), `recompute()` (the nightly write) and `member_price()` (what the register will read).
- **Families:** `services/families.py` finds vector neighbours on the floor (similarity ≥ 0.85, up to 8), then asks one "same family?" tool call per product. It is asked once, and the answer is stored.
- **Commands:** `recompute_rewards` and `assign_reward_families`.
- **Request kind:** `thriftplus.reset_rewards`.
- **Dash:** Thrift+ → Rewards tab.

Decisions:
- **The floor (owner, 2026-09-25):** a member never pays less than **10% of the tag** (`thrift_plus_floor_share` 0.10). Cost plays no part: the allocated cost is too rough, and prices may go near 0. Later the setting may go to 0, which allows the whole tag.
  - **Hard rule:** a reward is never more than the tag, so banked value can never exceed what was spent. The trip math clips each line too.
  - When the banking extra (+10%) arrives, the cap must become tag ÷ 1.1.
- **Stock already on the floor at launch (owner, 2026-09-25):** the owner decides in October, probably by hand. It's one time, so it can take a while to get right.
  - The engine counts from each item's own floor date until then.
  - The tools: the `thrift_plus_rewards_start` setting, and the reset request (it only runs while the switch is off). A manual tool can be added in Phase 5 if he wants one.
  - **The calculator (built 2026-09-30):** Dash → Thrift+ → Floor stock. A what-if over the real on-shelf items using the engine's own rules. The choice that matters is how old old stock counts on launch day (a cap of N days = `thrift_plus_rewards_start` of launch − (N − 1) days). On the 09-30 local copy, with each item's real age, 12,479 of 31,701 items (39%) are over 90 days and would sit at the floor on launch day: $322,095 of tags would be $78,903 to a member (75.5% off). Starting everyone fresh gives 0% off on launch day; a 30-day cap gives 25.4%. In the scanner worktree family of branches: `floor-plan`, uncommitted; ships with the next release.
- **Pacing:**
  - the pace window is the last 14 days of the family's sales;
  - days left are counted from the family's oldest unit;
  - on first sight, an item gets its missed growth days (only tonight can hold);
  - a family is paced only with 2+ units on the floor.
- **Retag:** the reward keeps its amount, clipped to the new cap; this is logged, and it is the one way a reward can go down. The register honours a retag at once, never below the new floor.
- **Consignment is excluded** (the consignor's price).
- **Families run nightly, not at processing.** This keeps processing untouched. Only products with a vector are checked.

Acceptance:
- [x] Day-8 start, growth of the tag ÷ 90 a day, a floor at 10% of the tag (never past the tag), never decreases, overnight only (a re-run changes nothing), and day-90 exit list.
- [x] Bulk (one product) and families (vector plus one model call) pace by sell-through. The last unit, and a unit whose scans-to-adds lags, climb alone.
- [x] Every change of status or reason is logged with the pace numbers. The nightly run is recorded.
- [x] Dry-run report: Thrift+ → Rewards (tomorrow's totals, bands, the biggest rewards, the exit list, one item's log).
- [ ] The full pre-ship run is GREEN (R-074).
- [ ] After the ship, the owner adds the Scheduler jobs `assign_reward_families --limit 200` (05:30 UTC) and `recompute_rewards` (06:00 UTC), and reviews the dry run on 10-01.

### Phase 3 — The register · **ship Mon 10-05 (v2.109.0 or later)** · built early (09-25), tests R-076
The POS handles members:
- card scan and attach, the photo, member and guest price, and the 18+ block;
- the cover ledger, banked rewards and the store-credit ledger;
- member and guest receipts, and re-ring as a member;
- member returns.

**Gated by:** Phase 2.

**Design** (from the POS map of 2026-09-25):
- **Dark means untouched.** Every Thrift+ step in the POS runs only when Thrift+ is *live* for that register. Live means the switch is on, or the register's code is in `thrift_plus_test_registers` (for the owner's test register on 10-05 and the staff dry run on 10-12). Otherwise the POS behaves exactly as today.
- **The member on a sale:** `thriftplus.CartMember`, one per POS cart, holding the account, the person who showed the card, the card, and the trip's choice (bank or instant). It is attached by scanning the card in the terminal's scan box (`TP` + 12 digits), through a dedicated endpoint, never the generic cart PATCH.
- **Member price:**
  - **The split:** the reward per line comes from `rewards.member_price()`. `services/trip.py` splits it: the cover first, then an instant rebate or the bank.
  - **Where the rebate lives:** the instant part is stored on the line as `CartLine.thrift_savings`. `CartLine.save()` takes it off `line_total`, so `sold_for` is the price the member really paid.
  - **When it syncs:** `Cart.recalculate()` re-syncs on every change while live.
  - **Consignment** gets no reward.
- **Store sales don't stack:** on a Labor Day or Summer line, the member gets the better of the sale and the reward, never both. So the 10% floor holds.
- **18+:**
  - Products are marked in `thriftplus.RestrictedProduct` (staff mark them in Dash).
  - While live, adding a marked item needs a member whose card holder is verified 18+. Guests can't buy them.
  - Completing the sale re-checks this.
- **Ledgers** are `thriftplus.LedgerEntry` rows, never edited: the cover (per month), the bank and store credit.
  - **When they are written:** completing a sale writes the cover and bank entries per line (so a return reverses exactly that line), and records `reward_at_close` on the item's reward. Voiding a sale reverses them.
  - **Spending:** store credit and banked rewards are spent at the register as a Thrift+ amount on the cart (`Cart.thrift_credit`) that the tender covers; the drawer's cash math leaves it out.
- **Receipts:**
  - The member receipt shows the tag price, member price, rewards, the part toward the cover, month-to-date cover progress, banked and credit balances.
  - The guest receipt shows the "You lost $X" or "would have earned $X" line.
  - This needs `posReceipt.ts` **and** a print-server update, which the owner redeploys to the registers.
- **Re-ring:** attach a card to a sale completed in the last 30 minutes on the same drawer. The member split is applied, and the instant savings are paid as store credit, so no cash leaves the drawer.
- **Returns (members only):**
  - the item was bought as a member;
  - within 3 days;
  - not excluded (as-is, parts, untested, clothing and soft goods, 18+, crossbows);
  - a primary-function failure;
  - refunded as store credit for what was paid;
  - the item's cover and bank entries are reversed;
  - a serial and condition photo is kept for $100+.

**Built as:**
- **Thrift+ side:**
  - models `CartMember`, `LedgerEntry` (with `reverses`), `RestrictedProduct`, `SalePhoto` and `ReturnRecord`, in migrations `thriftplus.0005` to `0007`;
  - `0006` seeds the cover ($10), the test registers (none) and the final-sale categories and words;
  - services `trip.py` (the split, mirroring the scanner mock), `ledger.py`, `register.py` (live gate, sync, attach, 18+, complete and void hooks, credit, re-ring) and `returns.py`.
- **API** under `/api/thriftplus/`:
  - `register/`: `status`, `attach`, `detach`, `choice`, `balance`, `rering`;
  - `returns/`: `lookup`, create, `photo`, list, `done`;
  - `restricted/`.
- **POS:**
  - `CartLine.thrift_savings` and `Cart.thrift_credit` (`pos.0033`);
  - `Cart.recalculate` calls `sync_if_live`;
  - `add-item` and `add-resale-copy` check 18+;
  - `complete` is one transaction, charges the amount due, and writes the ledger;
  - `void` reverses it;
  - the savings summary has a "Thrift+ rewards" bucket;
  - `CartSerializer.thrift_plus` (left out of list pages).
- **Terminal:**
  - a card scan attaches the member;
  - `ThriftPlusPanel` shows the photo, 18+, the cover, bank or rebate, credit, and the $100+ photo prompts;
  - the totals show Thrift+ rewards, credit and amount due;
  - payment charges the amount due;
  - re-ring after a live sale, and the member return dialog.
- **Dash:** the Thrift+ page gets a Register tab, with 18+ products and returned items.
- **Receipts:** `posReceipt.ts` sends `thrift_plus`, and the print server prints it. The print server is unreleased 1.9.0 and needs a rebuild and redeploy before launch.

**Decisions (owner, 2026-09-25, unless marked open):**
- **Discounts use the true price** (tag − reward). A percent sale scales the tag and the reward alike. Banking is 1.05×. BOGO ranks by true price.
  - Full rules and the arbitrage checks: [`extended/discount-logic.md`](../extended/discount-logic.md).
  - BOGO (confirmed): the free item is the one with the smaller true price. Unbanked pays the true price; banked pays the tag and banks 1.05×.
- **Return credit** is 95% of the pre-tax price paid (`thrift_plus_return_credit_share`), as store credit. The 5% is the cost of not testing in the store. The returns poster must say so.
- **The return window:** day 3 counts from the sale date, so a Monday sale can come back through Thursday.
- **The $100+ photo** is a prompt, not a block ("for now").
- **Open:** re-ring pays the member rebate as store credit rather than cash back. The owner asked what this means; it is explained, and his answer is pending.
- **Decided (owner, 2026-09-30):** sales tax is on the amount paid. Spending store credit or banked rewards lowers the taxable amount ($100 item, $50 of rewards used: tax on $50; banking instead and paying $100: tax on $100). **Not built:** today the register taxes the full subtotal when credit is spent as a tender. Also decided: the 5% banking extra changes nothing about tax, and all copy says rewards and credit have **no cash value**, everywhere.
- The returned item keeps its inventory status; staff decide in the Register tab.
- A return takes back the whole line.

### Phase 4 — Signup, scanner, portal, Dash · **ship Thu 10-08 (v2.109.0 or later)** · built early (09-25), tests R-078
- Signup at the register.
- Staff service.
- The real scanner app, built from the `thrift_scanner` thread's mock and matching its types.
- The customer portal: self-service for people, card and cover.
- Thrift+ in Dash: rewards and cover, scans-to-adds, and member stats.

**Gated by:** Phase 3.

**Built as:**
- **Signup at the register:** `ThriftPlusSignupDialog` in the terminal ("Thrift+ sign up"), with the ID check, photo and a blank card. The card goes on the open sale, or re-rings the last one. The fields are shared with Dash (`components/thriftplus/PersonFields.tsx`).
- **Staff service:**
  - member money in Dash (`MemberMoney`): the cover, banked, credit, every ledger row, and a manager adjustment with a reason (`accounts/{id}/money/`, `adjust/`);
  - the Register tab (18+ products, returned items);
  - the Overview tab (`rewards/overview/`).
- **Customer sign-in** (`services/member_auth.py`), following the auth map (2026-09-25):
  - members are not Django users;
  - a hashed session token in an httpOnly cookie on `/api/thriftplus/public/`, never the staff JWT;
  - every request re-checks the session, person and account (revoking cuts access at once);
  - email or username with a password; the card plus the phone's last 4 (5 tries per card, then a 15-minute lock);
  - a card session can set up a login only if none exists;
  - reset by a one-use emailed link (1 hour, the same answer either way, signs out every phone);
  - throttles `thriftplus_login`, `thriftplus_reset` and `thriftplus_scan`.
- **The scanner API** (`public_views.py`, `services/scanner.py`):
  - the item card (short title cut at a word, category key, member reward scaled by a store sale, 18+, returnable, available);
  - the member cart (`AppCart`) with the register's math;
  - signals (`ScanSignal`, counted on `ItemReward`) and history.
  - Guests stay on the phone.
  - **The register alert:** scanning the card picks up the app's bank-or-instant answer, and the panel shows it. A completed sale clears those items from the phone cart.
- **The portal API:** `me/`, `me/card-lost/` and `me/remove-person/`. Changes need a password session.
- **The client:** `frontend/src/api/thriftPlusScanner.api.ts` has the same functions and types as `thriftPlusMock.ts`, plus `confirmPasswordReset`, `setUpLogin`, `getMe`, `reportCardLost` and `removePerson`.
  - **The swap** (the scanner's imports, and dropping `thriftPlusMockControls`) is the `thrift_scanner` thread's, and so are the portal screens. I have told them.
- **Migrations:** `thriftplus.0008` (MemberLogin, MemberSession, MemberResetToken, AppCart, AppCartLine, ScanSignal).

**Open:**
- ~~The phone screens for the reset link (`/scan?reset=`), login setup and the portal.~~ **Built 2026-09-30** (the main session took over the retired `thrift_scanner` thread): the scanner now runs on the real API, `AccountScreens.tsx` has the new-password page, My account and the sign-in setup. Found and fixed a server bug on the way (`me/card-lost/` and `me/remove-person/` answered 405 after acting). In the scanner worktree, uncommitted; ships with the next release.
- AI short titles: the card uses `ProductProfile.short_name`, else the title, cut at a word.

### Phase 5 — Launch readiness · drafts started (09-25): [`thrift_plus_launch_kit.md`](./thrift_plus_launch_kit.md) · **ship Mon 10-12 (v2.110.0), fixes through Wed 10-14; launch Tue 10-20**
- Signage, receipt copy, the staff training guide and marketing copy (Claude drafts, the owner approves).
- An in-store dry run with the switch on for staff.
- The launch checklist.
- The switch goes on 10-20.

**Gated by:** Phase 4. Detail when Phase 4 is built.

---

## Acceptance

- [ ] Phase 1 — Members and cards
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-25 — Opened.** The owner's design is complete. Launch is Tue 10-20 and the last project day is Thu 10-15. A parallel thread (`thrift_scanner`) builds the scanner mock today; see [`.ai/context.md` § Two coders](../context.md#two-coders).

---

## See also

- [`data_platform`](./data_platform.md) · [`.ai/calendar.md`](../calendar.md) · [`.ai/context.md` § Two coders](../context.md#two-coders)
- Index: [`_index.md`](./_index.md)
