<!-- Last updated: 2026-10-21 (Bill and the Mainline, point by point) -->
# Critic review digest (2026-10-21)

The critic review (https://claude.ai/artifact/858S622P3hJDR3vMFs82qw, 279 findings) is taken point by point with Bill's real-life context. Each point: does it stand, shift, or drop, and the true next step.

## 1. Buying faster than selling: shifts
Intended while shelves fill ("building" inventory). Equilibrium once full: buying ≈ 40-50% of processing, processing ≈ 120% of sales; the gap is Thrift+ cash back and shrink.
**Next step:** track those two ratios (owner report). No buying brake.

## 2. Books don't match shelves: shifts
The count (20,000 on shelves) took Bill and his wife 15 hours; not repeatable often. The gap is unscanned back stock plus unrealized shrink, rooted in weak processing and restoration data and no real truck finalization.
**Next step: a truck's life tracked end to end, ~99% accurate, so full counts are rare:**
- B-Stock manifest → fulfilled / unfulfilled (adjustments before or after arrival) → delivered / broken / missing / processed / added.
- **Pallet numbers** tracked through processing, so the missing % shows during the truck, not at the end.
- **Truck finalize + dispute in Dash**, fully documented, the way B-Stock wants it (Bill will show how). B-Stock realities: a wrong-priced line (e.g. $100 vs $1) can only be disputed as "not received"; mislabels vs extras are hard to pair across thousands of items; sellers refund only 95% of the sale price (no fees, no shipping, first 5% of missing not refunded).
- **Restoration** tracks each item from processing → tested / assembled / repaired / salvaged → back to processing, floor, back stock, or salvage.
- **Online sales** tracked better.
- **Floor → sold, or estimated shrink by age:** an item unseen on shelf past ~180 days counts as lost; 90-180 days carries a likelihood-lost %. Estimates unseen stock without a full count; operationally valid.

## 3. Register money controls: stands, and the register's cash flow is redesigned (best option, no regard for today's build)
Security was lax by design (Carrie, Bill, David); new cashiers are coming. Bill's wants:
1. Cashiers sign out / hand off; no unowned drawer.
2. Someone covering a register is logged (to narrow missing money to a person and transactions).
3. Cash is entered as the money received, by denomination (touch: "2 × $10, 3 × quarters"); Dash knows the drawer's contents and says what change to give.
4. Coins are counted at end of day.
5. Opening and closing shifts report what's in the drawer; money added or removed during the day is logged easily.
6. Reconciliation does the heavy lifting: "you took X cash, paid out Y; following my change instructions you should have this many of each denomination."
Counts happen in the secondary office (locked supplemental drawer, coin counter).
Plus the review's security fixes: managers only for sale/drawer edits, server-side change, PIN + reason for price edits, discounts, voids.
- **Decided 10-21:** handoff counts bills only. **Cover** (not a PIN per sale): the person stepping in taps Cover + their PIN once; a banner says "Covered by …" and sales log to them; it ends with Back (the owner's PIN) or 10 idle minutes.
- **Me page (new, every staff login):** Dash has none today (only Today, My onboarding, My check-ins). One page: my details and emergency contact, change password, set my register PIN, my hours and pay, schedule, onboarding and check-ins, my drawers and covers, sign out everywhere.

## 4. No one-page profit view: stands, as an Owner home
Pages keep their places and job-based permissions (moving them is messy). A new **Owner** page pulls it together: (1) Scorecard: Net item sales, buying % of processing (40-50%), processing % of sales (120%), labor %, shrink, Thrift+ owed; (2) Needs you: Requests, time-change requests, late returns, offers, alerts; (3) links to every owner-only page. Staff Dashboard: today's and past weeks' sales plus one focus number per department.

## 5. Pay basics: shifts
- **No sick leave** (too few employees); take it out of Dash and the handbook.
- **Overtime at 1.5×** in the pay numbers. Payroll stays in QuickBooks Online: Dash gives the numbers to enter (per person: regular hours, overtime hours, rate), correct.
- **Pay period closed** lock: yes.
- **Time edits recorded:** yes. **Employees can't change their own time records** behind the screens.
- **Handbook** matches what Dash does.
- **A true schedule with flexible hours:** most roles flex (leave early on slow days, come in or stay late on busy ones); Retail keeps fixed shifts. **Call-ins are recorded** (who, when, which shift) so a pattern is visible and documented.

## 6. Thrift+ guardrails: stands
1. Owed to members on the Owner page Scorecard.
2. QR spends at once; a name or phone search needs a logged "member is here" tap.
3. Return count on the member card, warning at an owner-set number; no hard block.
4. Alerts (Owner page + brief) when the nightly ThriftBucks run or a sale's ledger write fails.
5. **Delete account stays for the owner** (he deletes test accounts to retest with the same email); everyone else gets Deactivate, which keeps sales and removes personal details.
- **Later, cameras:** Bill is wiring store cameras into his LAN camera server (gigabit, remote access). Then a sale gets a "register camera at time of sale" link, for checking a suspect sale (e.g. staff using a member's ThriftBucks).

## 7. Too much, too fast: the pace point drops
Bill: with AI coding the store must ship a lot to grow the team and sales (Thrift+, project management, operations, HR). Pace stays at about 5-10 releases a day until it's right; about 20 releases expected to cover this review in the next 2 days.
- **Parked areas stay** (Documents, deliveries, model factory, Online Sales, Consignment): needed later, parked while other work comes first. Keep them on a **backlog**; clean up what's truly dead along the way.

## 8. Small screen and safety problems: stands, fix all
Errors that stay on screen; a crash/deploy screen with Reload; error alerts to Bill; a database backup before **the first deploy of the day** (later deploys that day skip it; the pace is fast); cashiers land on the Register, not Buying; the 7 PM local-date bug; tax refunded on Thrift+ returns on the sales tax screen.

## 9. Morning brief and AI costs: the brief drops
Bill: the brief is unused and not useful when he looks. **Remove it** for now; the Owner page replaces it, and an AI research/briefing section can be added there later if the page falls short. AI spend still gets recorded in a table (standards T37), and the **Owner page shows AI spend**: one total plus a breakdown by where (feature/page) and who (user or job), with a Today / This week / This month toggle.

## Release list (from this digest, in order)
1. Lock the till: managers only for sale/drawer edits, server-side change, double-tap guard, recount fix.
2. Manager PIN + reason: price edits, discounts over a cap, voids (per-manager PINs).
3. Print failure loud + Open drawer button (logged); reprint marked COPY.
4. Safety: errors stay on screen, crash/deploy Reload screen, error alerts, 7 PM date fix, cashiers land on Register.
5. Backup before the first deploy of the day; tax refunded on returns on the tax screen; retire Summer 50%.
6. Register cash by denomination: tap money received, change instructions, running drawer contents.
7. Drawer life: open/close/handoff blind counts (handoff bills only), Cover + PIN, paid in/out and drops, office close with coin counter.
8. Me page.
9. Owner page: Scorecard, Needs you, owner links, AI spend (table + toggle); remove the morning brief.
10. Staff Dashboard: sales plus one focus number per department.
11. Thrift+ guardrails: owed on Owner page, "member is here" tap, return counts, ledger/nightly alerts, Deactivate (owner keeps Delete).
12. Pay: overtime 1.5x, QuickBooks numbers, period lock, time-edit trail, staff can't edit own time; remove sick leave.
13. Schedule: flexible hours (Retail fixed), call-ins recorded; handbook matches.
14. Pallet numbers through processing; missing % per truck as it's processed.
15. Truck finalize: manifest vs received, unfulfilled, added, missing.
16. B-Stock disputes in Dash (after Bill shows the B-Stock way).
17. Restoration tracking: tested / assembled / repaired / salvaged, and where it goes next.
18. Shrink by age: 90-180 days likelihood %, lost past 180; estimated inventory on the Owner page.
19. Online sales tracking.
20. Backlog page for parked areas; remove truly dead pages.
