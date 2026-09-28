<!-- Last updated: 2026-09-25 -->
# Calendar

Claude's clock. **Every session:** compare today's date with this table, say plainly whether we are on track or behind, and update the Status column. Dates are America/Chicago.

- **Thrift+ launch:** **Tue 2026-10-20**. **Last project day: Thu 2026-10-15.** Every goal is set to finish by then; 10-16 to 10-19 is room for issues.
- **Owner's days:** Mon–Thu. Saturday is his at-home physical projects, and Sunday is off. Ships and anything that needs him (approvals, reviews, dry runs, training) go on Mon–Thu. Claude builds on any day.
- **Thrift+ ships go out dark:** behind a Thrift+ switch that stays off until launch, each one passing the full pre-ship run (POS included). POS must never break.
- **Parallel threads:** ad hoc projects (such as the scanner mock) run in other Claude sessions and push to production themselves. This thread fetches and merges `origin/main` before every push.
- **Priority besides Thrift+:** the data platform, and the AI supervisor's daily brief for the owner in Dash.

## Day by day

| Date | Day | Goal | Ships | Status |
|---|---|---|---|---|
| 09-25 | Fri | Clean slate pushed (docs). Other thread: the Thrift+ **scanner mock** (owner's goal: done today). This thread: write the Thrift+ and Data platform initiatives, with ship milestones | docs v2.105.1 (pushed, Heroku v364) | clean slate done; initiatives written (thrift_plus_rewards, data_platform); scanner mock shipped v2.106.0 + v2.107.0 (Heroku v365/v366, thrift_scanner) |
| 09-26 | Sat | Build: Superuser **Requests** center (stage in production, approve, apply, undo). Stage the backfill, brand aliases and merges as requests | | built early (09-25); tests R-071 |
| 09-27 | Sun | Build: Thrift+ members (accounts, people, cards with check-digit codes), staff member screens, **card-back PDF** (numbered QR plus code) on the print server | | built early (09-25); tests R-072 |
| 09-28 | Mon | Pre-ship run → **ship v2.106.0** (Requests center, members, card backs; dark). Owner approves the first requests in production | v2.106.0 | |
| 09-29 | Tue | AI supervisor v1: a daily Context snapshot (sales, hours, QA, buying, inventory flow) and the AI brief page in Dash | | built early (09-25); R-073 RED (1 test count, 1 dash), fixed; re-run in R-074 |
| 09-30 | Wed | Reward engine: day-8 start, growth of price ÷ 90 per day, a floor at 10% of the tag, never decreases, nightly recompute, logged, day-90 exit list; families and bulk pacing | | built early (09-25); tests R-074 |
| 10-01 | Thu | Pre-ship run → **ship v2.107.0** (AI brief v1 and the reward engine running dark). Owner reviews the first brief and the dry-run rewards | v2.107.0 | |
| 10-02 | Fri | Build POS: card scan to attach a card to an account, photo on screen, member price = tag − reward, guest price, 18+ block | | |
| 10-03 | Sat | Build POS: the cover ledger (monthly deductible), the store-credit ledger, member and guest receipts, re-ring as member | | |
| 10-04 | Sun | Build: returns (members only, primary-function failures, 3-day window, exclusions, serial photo for $100+, reward reversal, store credit) | | |
| 10-05 | Mon | Full POS gate → **ship v2.108.0** (POS and returns, dark). Owner tries it on a test register | v2.108.0 | |
| 10-06 | Tue | Signup at the register (ID check sets 18+, photo, scan a blank card, apply to the sale, unverified cards). Staff service in Dash | | |
| 10-07 | Wed | Scanner app for real (from the mock) and the customer portal (self-service: people, card, cover progress). Thrift+ Dash (rewards and cover dashboard, scans-to-adds) | | |
| 10-08 | Thu | Pre-ship run → **ship v2.109.0** (signup, scanner, portal, Dash; dark). Owner reviews the signage, training and marketing drafts | v2.109.0 | |
| 10-09 | Fri | Fixes. Final signage (3 posters, 13×19), receipt text, staff training guide, marketing copy | | |
| 10-10 | Sat | (Owner: physical, e.g. printing) | | |
| 10-11 | Sun | Buffer | | |
| 10-12 | Mon | In-store dry run with the switch on for staff and test cards. **Ship v2.110.0** with the fixes | v2.110.0 | |
| 10-13 | Tue | Fixes. Staff training (owner). **Owner: set rewards for stock already on the floor** (a one-time, mostly manual call; tools: the start setting, the reset request, a manual tool if wanted) | | |
| 10-14 | Wed | Fixes. Final full pre-ship run. Launch checklist | v2.110.x | |
| 10-15 | Thu | **Last project day.** Everything done; the switch is ready | | |
| 10-16 → 10-19 | | Room for issues. Print cards and posters | | |
| 10-20 | Tue | **LAUNCH: the Thrift+ switch goes on** | | |
| 10-21 → 10-28 | | Launch fixes. data_platform Phase 3: QA framework (data quality first) | | |
| 10-29 | Thu | **Ship** data_platform Phase 3 (QA framework and inbox) | | |
| 11-02 → 11-11 | | data_platform Phase 4: the Analytical layer (local warehouse, point-in-time tables, misfits, inventory reconstruction) | | |
| 11-12 | Thu | **Ship** data_platform Phase 4 | | |
| 11-16 → 11-25 | | data_platform Phase 5: the model factory (the owner's method, the LLM research director) | | |
| 11-26 | Thu | **Ship** data_platform Phase 5. Then buying_intelligence_v2 resumes | | |

## Owner items with lead time

- **Card back design:** the QR plus the printed number (Claude drafts the PDF on 09-27; the owner approves it on 09-28).
- **Hardware:** a photo camera at the registers.
- **10DLC SMS registration** for "text JOIN" takes weeks. Optional at launch.
- **Advisers:** CPA (sales tax on rewards and credit, expiring store credit) and attorney (ID scanning without storage).
