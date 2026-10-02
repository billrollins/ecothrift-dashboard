<!-- Last updated: 2026-09-30 (release plan added; the old 09-28 procedure removed) -->
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
| 09-25 | Fri | Clean slate pushed (docs). Other thread: the Thrift+ **scanner mock** (owner's goal: done today). This thread: write the Thrift+ and Data platform initiatives, with ship milestones | docs v2.105.1 (pushed, Heroku v364) | clean slate done; initiatives written (thrift_plus_rewards, data_platform); scanner mock shipped v2.106.0-v2.108.0 (Heroku v365-v367, thrift_scanner) |
| 09-26 | Sat | Build: Superuser **Requests** center (stage in production, approve, apply, undo). Stage the backfill, brand aliases and merges as requests | | built early (09-25); tests R-071 |
| 09-27 | Sun | Build: Thrift+ members (accounts, people, cards with check-digit codes), staff member screens, **card-back PDF** (numbered QR plus code) on the print server | | built early (09-25); tests R-072 |
| 09-28 | Mon | Pre-ship run → **ship v2.108.0** (Requests center, members, card backs, reward engine, morning brief, `/scan` passthrough, a security fix; dark). Owner approves the first requests in production | v2.109.0 | **shipped** (Heroku v369, `caf60e76`); Requests #1 to #4 staged for the owner |
| 09-29 | Tue | AI supervisor v1: a daily Context snapshot (sales, hours, QA, buying, inventory flow) and the AI brief page in Dash | | built early (09-25); R-073 RED (1 test count, 1 dash), fixed; re-run in R-074 |
| 09-30 | Wed | Reward engine: day-8 start, growth of price ÷ 90 per day, a floor at 10% of the tag, never decreases, nightly recompute, logged, day-90 exit list; families and bulk pacing | | built early (09-25); tests R-074 |
| 10-01 | Thu | Pre-ship run → **ship v2.107.0** (AI brief v1 and the reward engine running dark). Owner reviews the first brief and the dry-run rewards | v2.107.0 | |
| 10-02 | Fri | Build POS: card scan to attach a card to an account, photo on screen, member price = tag − reward, guest price, 18+ block | | built early (09-25); tests R-076 |
| 10-03 | Sat | Build POS: the cover ledger (monthly deductible), the store-credit ledger, member and guest receipts, re-ring as member | | built early (09-25); tests R-076; the print server needs a rebuild and redeploy for the receipt lines |
| 10-04 | Sun | Build: returns (members only, primary-function failures, 3-day window, exclusions, serial photo for $100+, reward reversal, store credit) | | built early (09-25); tests R-076 |
| 10-05 | Mon | Full POS gate → **ship v2.108.0** (POS and returns, dark). Owner tries it on a test register | v2.108.0 || shipped early in v2.110.0 (09-28, owner packed it together) |
| 10-06 | Tue | Signup at the register (ID check sets 18+, photo, scan a blank card, apply to the sale, unverified cards). Staff service in Dash | | built early (09-25); tests R-078 |
| 10-07 | Wed | Scanner app for real (from the mock) and the customer portal (self-service: people, card, cover progress). Thrift+ Dash (rewards and cover dashboard, scans-to-adds) | | backend, client and Dash built early (09-25); tests R-078. Phone screens: `thrift_scanner` | **09-30: scanner on the real API; reset, sign-in setup and My account built and checked in the browser (uncommitted).**
| 10-08 | Thu | Pre-ship run → **ship v2.109.0** (signup, scanner, portal, Dash; dark). Owner reviews the signage, training and marketing drafts | v2.109.0 || shipped early in v2.110.0 (09-28, owner packed it together) |
| 10-09 | Fri | Fixes. Final signage (3 posters, 13×19), receipt text, staff training guide, marketing copy | | |
| 10-10 | Sat | (Owner: physical, e.g. printing) | | |
| 10-11 | Sun | Buffer | | |
| 10-12 | Mon | In-store dry run with the switch on for staff and test cards. **Ship v2.110.0** with the fixes | v2.110.0 | |
| 10-13 | Tue | Fixes. Staff training (owner). **Owner: set rewards for stock already on the floor** (a one-time, mostly manual call; tools: the start setting, the reset request, a manual tool if wanted) | | |
| 10-14 | Wed | Fixes. Final full pre-ship run. Launch checklist | v2.110.x | |
| 10-15 | Thu | **Last project day.** Everything done; the switch is ready | | |
| 10-16 → 10-19 | | Room for issues. Print cards and posters | | |
| 10-20 | Tue | **LAUNCH: the Thrift+ switch goes on** | | |
| 10-21 → 10-28 | | Launch fixes. data_platform Phase 3: QA framework (data quality first) | | built early (09-25); GREEN (R-079 + R-080) |
| 10-29 | Thu | **Ship** data_platform Phase 3 (QA framework and inbox) | || shipped early in v2.110.0 (09-28, owner packed it together) |
| 11-02 → 11-11 | | data_platform Phase 4: the Analytical layer (local warehouse, point-in-time tables, misfits, inventory reconstruction) | | built early (09-28), local only; `lean_test.py warehouse` GREEN. Left: shrink (needs floor counts), score push-back (with Phase 5) |
| 11-12 | Thu | **Ship** data_platform Phase 4 | | |
| 11-16 → 11-25 | | data_platform Phase 5: the model factory (the owner's method, the LLM research director) | | first version built early (09-28), local: the method, time folds, final holdout, `sold_30` (baseline wins, AUC 0.70) |
| 11-26 | Thu | **Ship** data_platform Phase 5. Then buying_intelligence_v2 resumes | | |

## Release plan (written 2026-09-30)

**Where things stand.** Production (Heroku) runs exactly `origin/main`, v2.111.0. Four pieces of work exist, each in its own copy of the code, none committed or shipped:

| Piece | Where | What it changes in production | Risk |
|---|---|---|---|
| **Inventory count** (needed Mon 10-05) | worktree `inventory-count` | New app `stocktake`: 2 new tables (migration `stocktake/0001`), a page at `/inventory/count`, a nav entry. Touches no existing table. | Low. Additive. |
| **Floor stock planner** (needed by 10-13) | worktree `floor-plan` | Two read-only endpoints and a Dash tab (superuser). No migration, writes nothing. | Low. |
| **Standards cleanup** | main tree (mixed with the data pipeline) | `.ai/` docs, `scripts/` layout, a one-line optional setting `AWS_LOCATION` (unset = today's behaviour). Heroku does not use `scripts/`. | Very low. |
| **Scanner on the real API + account screens** | worktree `thrift-scanner` | `/scan` stops showing sample data and shows real prices; the public scanner API is **not** behind the launch switch, so real scans start being logged. Plus a server fix. | Medium. Customer-facing before launch. |
| Data pipeline (standardize, dedupe, warehouse, `inventory/0101` and `0102`) | main tree, uncommitted | Its own release, when the owner says. Never from the main tree. | Separate. |

**The releases.** One release per row; each needs the owner's "ship" in chat, a backup first, and a full green gate on the exact tree.

| # | When | Version | Contents | Why then |
|---|---|---|---|---|
| 1 | **Thu 10-01** (owner present) | v2.112.0 | Inventory count + Floor stock planner + standards cleanup | The owner counts Mon 10-05. Thu is his last working day before it, which leaves the weekend to fix what his trial finds. |
| 2 | **Thu 10-08** | v2.113.0 | Scanner on the real API, new-password page, My account, sign-in setup, the portal server fix | Owner reviews signage that day and can try the scanner on his phone at once; 12 days before launch to fix. |
| 3 | **Fri 10-09 build, Mon 10-12 install** | print server 1.9.0 | Thrift+ receipt block on every register | `ship-print-server.md`; installed before the 10-12 dry run. |
| 4 | **Mon 10-12** | v2.113.x | Fixes from the in-store dry run, nothing else | Calendar's 10-12 ship. |
| 5 | **Wed 10-14** | v2.113.x if needed | Final fixes; full pre-ship run; launch checklist | Last project day is Thu 10-15. |
| - | 10-16 to 10-19 | none | Freeze. Only a fix for something broken. | Room for issues. |
| - | **Tue 10-20** | none (a setting) | Switch Thrift+ on | Not a deploy. |
| - | Data pipeline | its own release | Only when the owner says, and not before launch unless he asks. | Keeps launch week clean. |
| - | Production platform work (AI keys, S3 switch, upgrades) | dated in `standards.md` | Order and due dates in `initiatives/standards.md`. The database attach (T31) was done 2026-10-02. | Owner, 2026-10-02: everything goes to production as soon as it is done and tested; nothing is held for the launch. |

**Release 1 in steps (Thu 10-01).** Built from `_worktrees\ecothrift-dashboard--ship-2112` (branch `ship-v2.112.0`, from `origin/main`). The main tree is never pushed from.
1. Morning: the full gate on that tree is green (result below). Fix anything new.
2. Owner says "ship" in chat.
3. `git fetch origin`. If `origin/main` moved (another coder pushed), merge it and bump past it.
4. Bump: `.version` `v2.112.0`, root `package.json` `2.112.0`, CHANGELOG `[Unreleased]` becomes `[2.112.0] - 2026-10-01`, `scripts/deploy/commit_message.txt`.
5. `python scripts/dev/lean_test.py tsc` on the final tree, plus the compile check.
6. Commit; `git push origin ship-v2.112.0:main`.
7. `scripts\db\backup_prod.bat` (Heroku backup). No new env keys to set. `scripts\deploy\ship_heroku.bat` (refuses unless `HEAD == origin/main`). Watch `heroku releases`: the release phase creates the 2 `stocktake` tables.
8. Smoke on production: the footer shows v2.112.0; Retail floor → Inventory count opens; Thrift+ → Floor stock shows numbers.
9. Owner's trial (below).
10. Catch the main tree up: `git stash`, `git merge --ff-only origin/main`, `git stash pop`. The standards files come back identical; only `CHANGELOG.md` will need a hand merge. Then remove the worktrees `inventory-count`, `floor-plan`, `ship-2112`.

**Owner's trial, Thursday afternoon (before Monday).** On the phone with the real scanner, about 15 minutes:
- Pair the scanner in keyboard mode. Open Inventory count. Start a count named "Trial".
- Scan 10 to 20 real items, one twice (expect two beeps), one fake code (expect the buzz and "back up").
- Turn on airplane mode for a few scans, turn it off, and confirm they catch up.
- Finish, then open the report and check it looks right.
- Tell Claude what felt slow or wrong. Fixes are built Fri to Sun.
- **Decision needed:** may a fix ship on Saturday or Sunday without waiting for Monday? (A fix would only touch the count screen.) Otherwise nothing ships Monday before the count.

**Rollback.** Heroku rollback to the previous release. The new tables stay and are unused, which is harmless. Code goes back to v2.111.0.

**Risks to watch.**
- The scanner must read the QR tags. The POS already scans them, so it should; confirm in the trial. It must also send Enter after the code.
- A count keeps a list of about 31,700 item ids when it starts, and the report loads about that many rows. Fine now; watch the first real count's timing.
- Two coders pushing: the ship protocol fetches and merges `origin/main` first.
- `CHANGELOG.md` is edited by every branch; merge it by hand at each release.
- The scanner's `/scan` page changes what customers see (release 2). If the owner wants it earlier or later, it moves independently of everything else.

**Shipped 2026-10-02 10:57: v2.118.0** (commit `aad4a23c`, Heroku release v384, no migration, no backup): public `/privacy` and `/terms` pages on `ecothrift.us` (house texting standard D17, `standards.md` T58), footer links, sitemap; the owner read and approved the wording. Also the expired-token test (T63). Checked live in a browser: both pages show, dated October 2, 2026. Checks: core + accounts suites on a rebuilt test database (157 passed), public-site and staff `tsc`, migrations. The scanner-on-real-API release becomes v2.119.0.

**Shipped 2026-10-01 17:48: v2.117.0** (commit `3a93c64e`, Heroku release v383; v382 was the owner's `META_API_KEY` push). AI cleanup job: Workers 8 / 16 / 32 / 48, a batch releases its database connection during the model call, a rate-limited batch waits and retries. No migration, no backup. Checks: 39 cleanup tests, `tsc`, migrations, compile, a real local run at the 48-worker limit. The scanner-on-real-API release becomes v2.118.0.

**Shipped 2026-10-01 17:31: v2.116.0** (commit `ae87786c`, Heroku release v381, no migration, no backup): Run AI Cleanup is a background job on the server (`services/ai_cleanup_job.py`, `orders/<id>/ai-cleanup-job/`) with an Effort dropdown, Stop / Resume and self-healing after a process recycle, so slow models (Spark Contributor at low effort) work. Checks: 37 cleanup tests, inventory suite (only the known seed-template failure outside the list), all front-end tests, `tsc`, migrations, plus a real local run on Spark. `META_API_KEY` was missing on Heroku: added to `.envprod` and documented; the owner runs `scripts\env\push.bat` to put it live. The scanner-on-real-API release becomes v2.117.0.

**Shipped 2026-10-01 16:28: v2.115.2** (commit `e16449ca`, Heroku release v380, no migration, no backup at the owner's order): Run AI Cleanup's Model list is every active text model in Settings > AI (it was two hardcoded models). Checks: the four model-list tests and compile only; the other 19 failures in `test_ai_cleanup_batch.py` exist on `main` without this change (its staging-row helper passes `description` to `ManifestRow`).

**Shipped 2026-10-01 16:11: v2.115.1** (commit `24e14ee1`, Heroku release v379, no migration, no backup taken: the 14:00 backup `b014` stands and the database was under load). Fix for the Heroku temp-disk alert on the shared database: the purchase-order stats query no longer joins items, manifest rows and batch groups (each count is its own subquery; 27 ms on a 14,986-item order locally). Found by master; test `test_purchase_order_stats_query.py`.

**Shipped 2026-10-01: v2.115.0** (commit `8ff5a021`, Heroku release v378, backup `b014`): Count sessions as cards on a phone, Done / In progress / Not started counters, each section's count from last time, Super User delete of a session or a day. No migration. Gate: stocktake tests (23), all front-end tests (the 9 known failures only), `tsc`, migrations check, compile; the full server gate was not re-run. The scanner-on-real-API release becomes v2.116.0.

**Shipped 2026-10-01 13:32: v2.114.0** (commit `53462bb2`, Heroku release v377, backup `b013`; branch `count-v2` in the `--ship-2112` worktree). Gate GREEN on the private test database (0 new failures). Smoke: login, `/inventory/count`, `/inventory/pr-fixit` 200; the new APIs answer 401 without a login. Contents: inventory count v2 (sections, runs, one count a day, one-tap problems, carts, undo, type-to-search), Count sessions, PR Fix-it. Migration `stocktake.0002` (new tables; two columns on scans; closes v1 counts). Details: `initiatives/inventory_count.md` § Version 2. The scanner-on-real-API release becomes v2.115.0.

**Shipped 2026-10-01 10:10: v2.113.0** (commit `107bb131`, backup `b011`): the inventory count's timer, Start over and Earlier runs, at the owner's request from the floor. No migration. Gate: stocktake tests, all front-end tests (the 9 known failures only), `tsc`, migrations check and compile; the full server gate was not re-run (only `apps/stocktake` and the count page changed since the green gate on v2.112.0). The scanner-on-real-API release becomes v2.114.0.

**Shipped 2026-10-01 09:41: v2.112.0** (commit `a09cf40e`, Heroku release v375, backup `b010`). The release phase applied `stocktake.0001`. Smoke: login page 200, `/inventory/count` 200, the new APIs answer 401 without a login (they exist). The final gate was GREEN on a private test database (`DATABASE_NAME=ship_gate_2112`); a run on the shared test database failed 21 tests while the pipeline session was using it. Still to do: the owner's scanner trial; catch the main tree up; remove the worktrees.

**Owner's decisions (2026-09-30):** Thursday 10-01 is approved for release 1 (the scanner waits for 10-08). A weekend fix to the inventory count screen may ship on Saturday or Sunday without waiting for Monday; nothing else ships then, and nothing ships Monday before the count.

**Gate on the v2.112.0 candidate (2026-09-30): GREEN, no new failures.** Server suites: 1,563 passed, the failures all match the known list (`baseline.md`). Front end: 1,260 tests passed; 9 known failures. `tsc`: 0 errors. Migrations: clean. The new `apps/stocktake` app was not in the gate's list; it is now (`scripts/dev/lean_test.py`, in the candidate), and its 7 tests plus the floor-planner's 10 pass on the candidate tree. Re-run the gate on the final tree Thursday after the version bump.

## Owner items with lead time

- **Card back design:** the QR plus the printed number (Claude drafts the PDF on 09-27; the owner approves it on 09-28).
- **Hardware:** a photo camera at the registers.
- **10DLC SMS registration** for "text JOIN" takes weeks. Optional at launch.
- **Advisers:** CPA (sales tax on rewards and credit, expiring store credit) and attorney (ID scanning without storage).
