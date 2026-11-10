<!-- Last updated: 2026-11-10 -->
# Everything started and not finished, 2026-11-10

One list of all open work, from every plan, list and branch. Nothing here is changed or deleted yet. Step 2 (the plan) and step 3 (the clean-up) come after Bill reads this.

**Size:** S = under a day, M = a few days, L = a week or more.
**State:** *Started* (part built) · *Dark* (built, switched off) · *You* (waits on Bill) · *Outside* (waits on someone else) · *Never started* · *Unclear* (the plan and the record disagree).

## The short version

1. **Dash Updates is not where the unfinished work is.** It has 80 rows: 74 done, 6 open. The open work sits in **12 other places** (below).
2. **About 80 open items** once the stale ones are removed, plus the 15 ideas from today's audit. Roughly 25 wait on you, 3 wait on someone outside, 8 are started and not finished, 3 are built and switched off, 9 are unclear, and about 30 were planned and never started.
3. **Most plan files are out of date.** Of the 16 plan files, at least 11 still list work that shipped weeks ago. Each open item was checked against the changelog and the live database; about 35 that are done were dropped.
4. **"Done" is not "Finished."** 74 updates shipped, but no page in Retail or Buying is signed Finished by you. Both end goals are still drafts.
5. **About 40 decisions were guessed for you overnight** and never confirmed. Work is built on them.
6. **The leftovers are large:** 151 branches, 25 work folders (5 with uncommitted code), 62 archived plan files, and the main folder on this PC is nine releases behind live with its own uncommitted changes.

## Where plans live today (the 12 places)

| # | Place | What is in it |
|---|---|---|
| 1 | Dash Updates (in Dash) | 80 rows, 6 open |
| 2 | `.ai/initiatives/` | 14 active plan files and the index |
| 3 | `.ai/initiatives/backlog.md` | 5 parked areas |
| 4 | `.ai/initiatives/standards.md` | 16 house-standards rows |
| 5 | `.ai/initiatives/_archived/` | 62 old plans, about 12 with work left |
| 6 | `.ai/reference/end-goals/` | Retail and Buying end goals (drafts; only on this PC, never shipped) |
| 7 | `.ai/calendar.md` | Thrift+ launch calendar; still lists ships for 11-12 and 11-26 |
| 8 | `.ai/context.md` Active work | Still names Thrift+ as the compass |
| 9 | `.ai/reference/owner-qa-log.md` | Questions and answers, about 40 guessed (only on this PC) |
| 10 | `.ai/extended/*-decisions.md`, `known-issues.md` | Mobile app, Cash Drops, Thrift+ rulebook, known issues |
| 11 | `.ai/reference/reports/` | 10-21 critic digest (20-step release list), today's audit (15 ideas) |
| 12 | Branches, work folders, chat sessions, my memory notes | Parked code and parked promises |

---

## A. Retail (your focus)

| Item | State | Size | Written in |
|---|---|---|---|
| Lock the Retail end goal (draft v1) | You | S | end-goals/retail.md |
| Test-drive and sign Finished: Register, Transactions, Cash Drops part 1 | You | S | end goal, order 1 |
| Cash Drops part 2: the ledger rework (office swaps with the safe, drop box, close exchange). Dash Update #70, "almost", waits on your review | Started | M | Dash #70, cash-drops-decisions.md |
| Customers page (takes in Thrift+ Staff and the members list) | Never started | M | end goal, order 3 |
| Command Center rebuild | Never started | M | end goal, order 4 |
| Retail setup (folds Practice, Printables, POS setup) | Never started | M | end goal, order 4 |
| Fold the legacy pages (Drawers, Inventories and others) | Never started | M | end goal, Legacy tier |
| Change the section check people. Dash #34, on hold for a "Retail Routines" project that has no plan | You | S | Dash #34 |
| Thrift+ Perks wording and 3-step sign-up. Dash #10, on hold; 77 changed files sit uncommitted in a work folder since 10-28, now far behind live | Started | L | Dash #10, workspace/perks_rebrand_plan.md |
| New price tag in Dash (`printing.price_tag_in_dash` is off) | Dark | S | live setting |
| Failed request #57: put Ester Moses on sale R-20261030-063 | Unclear | S | live Requests |
| The "Transactions lines" change shipped with no changelog entry; the entry is still owed | Started | S | my notes |

## B. Buying (your focus)

| Item | State | Size | Written in |
|---|---|---|---|
| Lock the Buying end goal (draft) | You | S | end-goals/buying.md |
| Sign off Orders, Vendors, Preprocessing; sign off the Auctions list after 2 weeks of use | You | S | end goal, steps 7-8 |
| Dash #81 (new, yours 11-09): better numbers at the top, Total Truck Cost, Target Price | Never started | S | Dash #81 |
| Auction detail: "how sure" per lot, your 20% / 23% max | Never started | M | end goal, step 1 |
| Manifests on watched lots and the top 20; Target estimate miss from 7.3 to 4 points | Never started | M | end goal, step 2 |
| Live watch, Buy Now alerts, fetch a brand-new lot. Needs your pick of alert channel and an always-on checker | You | L | end goal, step 3 |
| Watching on Auctions with an alert log | Never started | M | end goal, step 4 |
| Fold Report cards into "How good is it?"; retire the Legacy buying pages | Never started | S | end goal, steps 5-6 |
| Truck close-out and disputes: dispute refunds come off the order cost (no refund field today) | Never started | M | intake_updates Phase 4, digest #15-16 |
| Next intake screen (Receiving or Processing): you name it | You | L | intake_updates Phase 7 |
| Small buying fits: read units and retail from listing text, shrink by condition from results, revenue check after 5 judged trucks | Never started | S each | bstock_daily_buying |
| Nightly jobs never confirmed on Heroku Scheduler: manifest pull, vendor metrics | Unclear | S | bstock_daily_buying, intake_updates |
| Parked for the next version: filter by need, AI second opinion, vendor track record, freight hazard, labor in truck value | Never started | M | end goal, buying_intelligence_v2 |
| 50-line side-by-side, Spark vs Sonnet, for preprocessing (offered 11-09, no answer) | You | S | this chat |
| Dash #4: check the product standard on the first new order (on hold) | Started | S | Dash #4 |

## C. Processing, inventory and restoration

| Item | State | Size | Written in |
|---|---|---|---|
| Shrink numbers: by order, vendor, category, age, with a trend | Never started | M | inventory_effort, data_platform, digest #18 |
| Two data fixes planned and never staged: "keep found sold", "back on shelf" | Unclear | S | inventory_effort |
| 5 items priced above retail and 1 at $0 to fix by hand; order TGT127616 to "delivered" | You | S | inventory_effort |
| Count by section with expected counts (needs item locations) | Never started | L | inventory_count |
| Count one aisle, "where is it" for missing items, weekly shrink trend | Never started | M | inventory_count |
| Back-stock counts (floor counts include back stock today) | Never started | M | known-issues, thrift_plus_families |
| Short product name on the tag, the register and processing screens | Unclear | S | product_intelligence |
| `category_from_profile` is off in production | Dark | S | live setting |
| End-of-truck and weekly data reviews | Never started | M | product_intelligence |
| Pallet numbers through processing; missing % per truck | Unclear | M | digest #14 |
| Restoration tracking: tested / assembled / repaired / salvaged, and where next | Unclear | M | digest #17 |
| Drop the unused family tables and the empty `assign_reward_families` command | Never started | S | thrift_plus_families |
| Purchase-order rails: status stamps, required category, scrap reasons; close stale orders | Unclear | M | data_quality_rails |

## D. Thrift+

| Item | State | Size | Written in |
|---|---|---|---|
| Sign-in texts from our own number (`thrift_plus.own_number_codes` is off). Waits on the toll-free review; a session checks every morning | Outside | S | live setting, daily task |
| Decide $10 or $20 cover once there are 60 days of data (about mid-December) | You | S | thrift_plus_rewards |
| Floor share setting: may drop to 0 | You | S | thrift_plus_rewards |
| Banking extras, members-only sales, early access, consignment invites | Never started | M | thrift_plus_rewards, out of scope |
| Work the Overstock list each week | You | S | thrift_plus_families |
| Request #48 "One customer account" was rejected 10-16; the old CustomerProfile table is still there (T62) | Started | S | standards T62 |

## E. People and HR

| Item | State | Size | Written in |
|---|---|---|---|
| Wi-Fi time clock pilot (Dash #63, on hold): one week in shadow on your phone; the 7-day report is due about 11-11 | Started | M | Dash #63, standards T82 |
| After the pilot: the "are you on store Wi-Fi?" nudge at clock-in; phone alerts | Never started | S-M | Dash #63, mobile-app-decisions |
| Hiring texts (interview reminders): built, held until the 10DLC approval and the house notify package | Dark | M | hiring_onboarding Phase 6 |
| Republish the handbook (sick leave, schedule, overtime, no badge) | You | S | hiring_onboarding |
| Where a new hire sees the handbook (menu link): asked 11-09, no answer | You | S | this chat |
| Warn before re-sending first-day emails | Never started | S | this chat |
| jobs@ mailbox; a real team photo for the careers page | You | S | hiring_onboarding |
| Contractor invoice template in Dash: yes or no | You | S | contractor_agreements |
| Move offer letters onto the new e-sign | Never started | M | contractor_agreements |
| Termination, write-ups, reviews | Never started | L | hiring_onboarding, out of scope |
| Pay: overtime 1.5x, QuickBooks numbers, period lock, time-edit trail | Unclear | M | digest #12 |
| Staff mobile app: the shell, then each workspace app. Parked 11-06. Its scope rests on about 8 guessed answers | Never started | L | mobile-app-decisions.md |
| Messages rework | Never started | M | mobile-app-decisions.md |

## F. Data and models (called "the owner's priority" in September)

| Item | State | Size | Written in |
|---|---|---|---|
| Analytical layer (local warehouse): built 09-28 on this PC only, never shipped. The calendar says ship 11-12 | Started | M | data_platform Phase 4, calendar |
| Model factory: first version built 09-28 on this PC only. Left: 7 more targets, more model types, the research director. The calendar says ship 11-26 | Started | L | data_platform Phase 5, backlog |
| Push model scores back to production | Never started | M | data_platform |
| Sell-time model and pricing simulator | Never started | L | sell_time_model |
| Decide the handling of every data-quality register issue; fill-in rules catalog | Never started | M | data_quality_rails Phase 1 |
| AI briefing section on the Owner page (the daily brief was removed 10-21) | Never started | S | data_platform |
| Taxonomy questions Q1-Q6; brand junk-rule keep list | Unclear | S | product_intelligence |

## G. Platform and house standards

| Item | State | Size | Written in |
|---|---|---|---|
| Storage move: regional endpoint, switch bucket, delete old objects, ENTITY key (T54, T52, T53, T24) | Never started | M | standards.md |
| Owner role and access by area enforced on the server, with a route test (T68) | Never started | M | standards.md |
| Postgres 18 in early December (T32); one IAM user per app (T35); house AI router (T36, T37) | Outside (master) | M | standards.md |
| Partner API tokens (T67); env-sync 1.1.1 (T80) | You / Never started | S-M | standards.md |
| Small known issues: pywin32 missing, restoration note lock, slow tests, thin test coverage | Never started | S | known-issues.md |
| Social: Meta app for direct posting; open Instagram, Google, Nextdoor, TikTok accounts. Parked 10-26 | You | M | retail_tags_and_social |

## H. Parked areas: each needs a keep-or-remove call

| Area | What is there | Call needed |
|---|---|---|
| Online Sales | Built, about 33,000 lines, 3 listings in 30 days | Live or parked |
| Deliveries | About 7,000 lines of scaffolding, 4 jobs ever | Remove or keep |
| Consignment | Hidden from the menu | Take it again or remove |
| Documents (old) | Partly built; the new e-sign may replace it | Replace or finish |
| Floorplan rebuild | Old plan, waits on you | Do or drop |
| Blog, Label Studio | No use since summer | Legacy or remove |
| Old archived plans with work left | Schema move, vendor avatars, location label, receipt format, data export phase 2, object surfaces, sales-history categories | Drop unless you name one |

## I. Ideas from today's audit (none started)

The 15 recommendations in [2026-11-10-dash-audit.md](2026-11-10-dash-audit.md): 5 quick wins (start in your own workspace, Legacy everywhere, reset Dashboard goals, profit line, truck close-out), 5 structural (one inbox, one People home, Command Center for Processing and Restoration, background worker, finish before starting), 5 for profit. Truck close-out and the Command Center overlap rows in A, B and C above.

---

## Decisions waiting on you, in one place

1. Lock the Retail end goal; lock the Buying end goal.
2. Review Cash Drops (#70) so part 2 can be built or dropped.
3. Perks (#10): finish, restart from live, or drop.
4. Section check people (#34): give the rule, or drop it.
5. Keep or remove: Online Sales, Deliveries, Consignment, old Documents, Floorplan rebuild.
6. Data and models: keep building, park with a date, or drop the calendar's 11-12 and 11-26 ships.
7. Mobile app: stays parked, or drop the plan.
8. About 40 guessed answers in the question log (menus, HR tabs, contractor screens, phone bars, Buying estimate rules). Confirm in bulk, or mark the ones to change.
9. Small ones: $10 or $20 cover (mid-December), floor share, handbook republish, handbook menu link, jobs@ mailbox, contractor invoices, alert channel for Buying, Spark vs Sonnet test.

## The clean-up pile: done 2026-11-10 (Bill: "be heavy handed")

Everything removed that was not plainly regenerable is off site at `{coding root}/!archive/ecothrift-dashboard/2026-11-10-cleanup/` (its README says how to get anything back).

| What | Before | Now | Note |
|---|---|---|---|
| Branches on this PC | 151, plus 40 runner refs | 7 | All saved in one git bundle first. Kept: main and the 6 that belong to open sessions |
| Work folders | 25, plus 11 empty leftovers | 5 | Kept: main, the running Wi-Fi clock helper, 3 open sessions. Uncommitted code (Perks and others) saved as patches |
| Main folder on this PC | Nine releases behind, stuck on a stale lock from 11-05 | On live (v2.269.2) | Its local plan edits carried over |
| Stash | 1 | 0 | Saved as a patch |
| Archived plan files | 62 | 0 | Off site. The deletion is uncommitted: it leaves GitHub with the next ship |
| Scratch folder `workspace/` | 61 folders, 443 loose files, 24.3 GB | 22 folders, 17 loose files, 22.2 GB | 36 folders and 425 files moved off site; an old Python copy and 4 old database dumps deleted. 19 GB is `posters2`, kept because the poster pipeline points at it |

**Still to do**
- Two old branches on GitHub (July hotfix, July plans): the delete was blocked by a safety check; needs Bill's word.
- One spent scheduled task (switched off): its delete was blocked too.
- About 50 archived chat sessions: the app asks Bill to confirm each delete.
- The 16 active plan files, the calendar and old reports: these go when their open items are rows in Dash Updates (step 2 and 3).
- `workspace/posters2` (19 GB) moved off site on Bill's word the same day; `workspace/` is now 3 GB. `social` (1.7 GB) stays unless Bill says so.

## What I checked, and what I did not

- Checked: every Dash Update (live), all 16 plan files and the archive list against the changelog, live approval requests (27: 24 applied, 2 rejected, 1 failed, 0 waiting), live switches, every branch and work folder, chat sessions, scheduled tasks, the question log, my memory notes.
- Not checked: the Heroku Scheduler job list (several rows are "Unclear" for that reason), what the three open chat sessions hold unsaved, the Master folder's own lists for this project, and paper or WhatsApp lists.
- "Unclear" rows need one look each before they go in the final plan.

---

## Draft plan v2 (step 2; settled against the question log; not final until Bill says so)

Dash Updates becomes the only list. Each line below becomes one row; every other plan file is then removed. "Log row" = the line in `owner-qa-log.md` that already answers it.

**1. Now, in this order (Retail and Buying only; log rows 117-119)**

| # | Row | Size | Still needs from Bill |
|---|---|---|---|
| 1 | Retail: test-drive Register, Transactions, Cash Drops part 1; sign Finished or give notes | S | The test-drive |
| 2 | Retail: Cash Drops part 2. The rules are his already (rows 74-76: every hand accepts its count, count at handoff, the supplemental drawer only swaps with the safe and keeps its total). It changes how money is booked, so he reviews before it goes live (row 106) | M | A look before it ships |
| 3 | Buying: Auction detail page (spec saved; his 20% / 23% landed max is the headline, row 121) | M | Yes to the spec |
| 4 | Buying: better numbers at the top (#81) | S | Nothing |
| 5 | Buying: truck close-out (missing, broken, claim, money back off the order cost; disputed items count toward the claim, row 20) | M | Nothing |
| 5b | Buying: recovery the owner's way (11-10, replaces the guessed 90-day rule): a truck Finalized 90+ days ago counts sold + 50% of the current price of what is left; other trucks are not scored. Outlier trucks flagged, not fixed. Depends on row 5 making "Finalized" real (0 trucks are Finalized today). Stand-in he approved 11-10: an order marked "complete" whose last item was checked in 90+ days ago | S | Nothing |
| 6 | Retail: Customers page (his Retail menu, row 73: Register, Transactions, Customers; managers: Command Center, Cash Drops) | M | Nothing |
| 7 | Retail: Command Center rebuild, then Retail setup, then fold the Legacy pages | M each | Lock the Retail end goal |
| 8 | Buying: live watch and alerts. Settled: alerts are phone push with the estimate in them (row 92: A, B, C yes); the checker is the coder's call and about $7 a month is fine (row 91) | L | Nothing |
| 9 | Buying: filter by true need, more estimators, optional AI second look (rows 86, 93) | M | Lock the Buying end goal |

**2a. Waiting on Bill's word (master, 11-10):** push two shared AI keys to Heroku (T87); partner links between the three dashboards, ping only (T88).

**2. Waiting, nothing to build:** toll-free approval (then own-number texts and hiring texts), Wi-Fi clock pilot report (#63), $10 or $20 cover in mid-December, Postgres 18 and the house keys (master), PCI: guest Wi-Fi for the two card terminals and the segmentation test at the store (rows 83-84).

**3. Parked, one row each (row 38: anything that cannot move until something outside happens is parked, not dropped)**
- Perks (#10): until his meeting with Carrie and Jess (row 30). Patch in the archive.
- Product standard check on the first new order (#4): until a new order arrives (row 38).
- Section check people (#34): belongs to his "Retail Routines Evolution Project" (rows 14, 32), which has no plan yet.
- Staff mobile app (row 117). Its design answers are his (rows 51-60).
- Data and models, social, shrink numbers, count by section, storage move and access control, HR extras.

**4. Dropped unless Bill names one:** the old archived plans' leftovers, Thrift+ extras (banking, members-only sales), small buying fits, the 10-21 digest's unbuilt steps, backfills of the past where the forward fix covers it (row 35).

**5. Settled by the log, no question needed**
- Online Sales, Deliveries and Studios stay as workspaces (row 62, 11-04: "keep for now"; row 60: keep the workspaces we have).
- One inbox: already his rule (row 64: every request kind in one Requests). It becomes a row under HR/Home when focus returns there.
- One People home: already his rule (row 62: HR replaces People; row 63: My HR and HR Admin are two surfaces, not one filtered page).
- Start in your own department: fits row 56 (department first, nothing hidden).
- The 42 guessed answers stand under his 11-04 rule (top of the log: "assume the rows are right"), except the ones he overturns in his spot check.

**6. Where the 11-10 audit disagrees with his answers (told to him 11-10, as the log's rule requires)**
- Audit: "bid from your own recovery; 20% overpays for weak sellers." His rows 120-121: bid on the 20-23% landed line; matched recovery is a floor (Wayfair is undercounted); our 90-day rates are not a reason to cut a bid. **His answer wins; the audit line is withdrawn** unless he changes it.
- Audit: "buy to a weeks-of-supply target; stock is not the limit." His rows 85 and 93: weeks of stock is right only if well estimated, and today it is not; the real problem is traffic or pricing. Agrees on traffic and pricing; **the weeks-of-supply target waits until he trusts the number.**

**7. Still Bill's calls:** lock the two end goals; keep or remove Consignment, old Documents and the Floorplan rebuild; the profit line; the Spark vs Sonnet side-by-side (row 123).
