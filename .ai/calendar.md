<!-- Last updated: 2026-09-28 -->
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
| 10-07 | Wed | Scanner app for real (from the mock) and the customer portal (self-service: people, card, cover progress). Thrift+ Dash (rewards and cover dashboard, scans-to-adds) | | backend, client and Dash built early (09-25); tests R-078. Phone screens: `thrift_scanner` |
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

## Ship procedure: Mon 09-28 (v2.108.0)

The main working tree also holds Thrift+ Phases 3 and 4 and data QA, which ship later. **Don't run the push script from the main tree:** it does `git add .` and would ship everything. Ship the tested tree `refs/runner/R-077` (base `fd7eb327`) instead:

1. `git fetch origin`. If `origin/main` is no longer `fd7eb327`, the scanner thread pushed again: note its version and bump past it.
2. `git worktree add ../ecothrift-ship-208 -b ship-v2.108.0 origin/main`
3. `git diff fd7eb327 refs/runner/R-077 | git -C ../ecothrift-ship-208 apply --3way --index`. It must be clean; if `origin/main` moved and it conflicts, re-run the ship gate.
4. In the ship worktree:
   - `.version` → `v2.108.0` and root `package.json` → `2.108.0`;
   - `CHANGELOG.md`: `[Unreleased]` → `[2.108.0] - 2026-09-28`, and the two header comments;
   - `.ai/comm/threads.md`: the ship log row;
   - `scripts/deploy/commit_message.txt`.
5. Commit in the ship worktree (`git add -A`, `git commit -F scripts/deploy/commit_message.txt`), then:
   - `git push origin ship-v2.108.0:main`
   - `git push heroku ship-v2.108.0:main` (the release phase migrates).
6. **Back in the main tree:**
   - `git reset --soft <ship commit>`: HEAD moves, and the working tree keeps Phases 3 and 4 and QA as changes.
   - Then bring the main tree's `.version`, `package.json` and CHANGELOG level with the ship, with a new `[Unreleased]` on top.
   - `git worktree remove ../ecothrift-ship-208` and `../ecothrift-ship`.
7. **Production:**
   - `heroku run --no-tty -a ecothrift-dashboard -- python manage.py stage_request ...` for the backfills, brand aliases and merges; the owner approves in Dash → Requests.
   - The owner adds the Scheduler jobs: `build_daily_brief`, `recompute_rewards`, `assign_reward_families`.

## Owner items with lead time

- **Card back design:** the QR plus the printed number (Claude drafts the PDF on 09-27; the owner approves it on 09-28).
- **Hardware:** a photo camera at the registers.
- **10DLC SMS registration** for "text JOIN" takes weeks. Optional at launch.
- **Advisers:** CPA (sales tax on rewards and credit, expiring store credit) and attorney (ID scanning without storage).
