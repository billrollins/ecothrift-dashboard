<!-- Written 2026-10-02 by the Helper session (slug `standards`, earlier `tech_target`). The owner closed that session and handed everything to the main coder (`data_platform`). -->
# Handoff: Helper session → main coder (2026-10-02)

The owner (Bill) ended the Helper session on 2026-10-02 and gave **all** of its work to the main Eco-Thrift coder. From now on there is one coder, working on `main`. This file is everything the Helper knew that is not already in code, `CHANGELOG.md` or git history.

**Short version**

- Everything the Helper built is **shipped and in `origin/main`** except one piece: the Thrift+ scanner on the real API (saved as a patch, see § 3).
- The Helper's worktrees, branches and private test database are **removed**. One worktree is left on purpose: the scanner (§ 3).
- The **main checkout** (`C:\Coding\ecothrift-dashboard`, `main` at `13e10dfe`) is 10 commits behind `origin/main` and holds a large uncommitted pile. Part of that pile is the Helper's `.ai/` and `scripts/` work that is **not in `origin/main` yet** (§ 2). Catching the main checkout up is the first job.
- Production: Heroku `ecothrift-dashboard` is on release **v384 = `aad4a23c` = v2.118.0**. Your v2.119.0 (`94c709ee`) is on GitHub and was not on Heroku when this was written.

---

## 1. What shipped (2026-10-01 and 10-02), all from a ship worktree on `origin/main`

| Version | Commit | Heroku | Backup | What |
|---|---|---|---|---|
| v2.112.0 | `a09cf40e` | v375 | `b010` | Inventory count app (`apps/stocktake`, migration `0001`), Thrift+ floor-stock calculator, `AWS_LOCATION` read from env |
| v2.113.0 | `107bb131` | v376 | `b011` | Count timer, Start over, Earlier runs (all three replaced in v2.114.0) |
| v2.114.0 | `53462bb2` | v377 | `b013` | Count v2: sections, runs, one count a day, one-tap problems, carts, Count sessions, PR Fix-it (`stocktake.0002`) |
| v2.115.0 | `8ff5a021` | v378 | `b014` | Count sessions as cards on a phone, Done / In progress / Not started, last-time counts per section, Super User delete |
| v2.115.1 | `24e14ee1` | v379 | none | **Production fix:** purchase-order stats query (see § 6) |
| v2.115.2 | `e16449ca` | v380 | none | Run AI Cleanup lists every active text model from Settings > AI |
| v2.116.0 | `ae87786c` | v381 | none | AI cleanup as a background job, Effort dropdown, Stop / Resume |
| (config) | | v382 | | Bill pushed `META_API_KEY` to Heroku with `scripts\env\push.bat` |
| v2.117.0 | `3a93c64e` | v383 | none | Cleanup job: Workers 8 / 16 / 32 / 48, no database connection held during a model call, rate-limit backoff |
| v2.118.0 | `aad4a23c` | v384 | none | Public `/privacy` and `/terms` pages on `ecothrift.us` (texting standard D17), expired-token test |

Each release has a full entry in `CHANGELOG.md` and a dated note in `.ai/calendar.md` § Release plan.

---

## 2. The main checkout: what is still only there (not in `origin/main`)

Your commit `94c709ee` carried a snapshot of the main checkout from **before** the Helper's 10-01 work in `.ai/`. These exist only in the working tree of `C:\Coding\ecothrift-dashboard`:

**New files**
- `.ai/initiatives/standards.md` (replaces `tech_target.md`: one list, every row has a Due; 23 open rows, deviations DR1 to DR3, Done rows)
- `.ai/protocols/standards-review.md` (replaces `tech-target-review.md`)
- `.ai/extended/thrift-plus-decisions.md` (the owner's **final** Thrift+ answers; wins over older notes)
- `.ai/extended/thrift-plus-legal-memo.md` (the legal memo, accepted by the owner's CPA and attorney, plus the guiding principles)
- `.ai/extended/thrift-plus-limited-warranty.md` (the Limited Warranty text for posters, receipts and signs)
- `.ai/reference/reports/2026-10-02-helper-handoff.md` (this file)
- `scripts/sql/*.sql` (four runnable SQL tools, moved out of `.ai/extended/sql/` at master's order)

**Deleted on purpose** (they are still in `origin/main`)
- `.ai/initiatives/tech_target.md`, `.ai/protocols/tech-target-review.md`, `.ai/comm/threads.md`
- `.ai/extended/sql/*.sql` and `.ai/extended/sql/daily_migration.csv` (real sales figures; the owner had it removed)
- `.ai/comm/runner/archive/` (158 files; master's rule: `comm/` is live mail only; the owner had the index removed too; git history keeps all of it)
- `.ai/initiatives/_archived/_completed/`, `_pending/`, `_backlog/`, `_abandoned/`: the 59 files now sit **flat** in `_archived/`, and `ARCHIVE.md` has a Disposition column

**Edited**
- Protocols to master's 5S kit: `check_comm.md` v4, `ship-git.md` v2 (lists due standards rows at each ship), `ship-heroku.md` v2 (backup only when the release has migrations or touches data), `initiative-review.md` v2, `startup.md` v1.1, `runner.md` (no archive in `comm/`)
- `AGENTS.md` triggers (`review standards / standardize → standards-review.md`; `ship` notes the due rows)
- `.ai/context.md` (deviations are one line linking to `standards.md`; legal guide in Guardrails; extended TOC), `.ai/initiatives/_index.md`, `.ai/calendar.md` (release records), `.ai/initiatives/inventory_count.md` (v2 design and record), many `extended/*.md` link fixes, `.ai/extended/development.md` (`META_API_KEY`)
- `.gitignore` (ignores only `.ai/reference/from-master/` and `to-master/`, so `reference/reports/` is tracked), `README.md` (link to `standards.md`)
- `.envprod` (not in git): has `META_API_KEY`, matching Heroku

**How to catch the main checkout up.** The clean way is a real merge, because many files changed on both sides:

1. In the main checkout: `git checkout -b main-tree-pile`, `git add -A`, `git commit -m "snapshot of the main checkout, 2026-10-02 (never push)"`. This is a local safety commit, not a release.
2. `git checkout main`, then `git merge --ff-only origin/main`.
3. `git merge main-tree-pile`. Expect conflicts in `CHANGELOG.md` (keep origin's release sections; the pile's `[Unreleased]` notes are yours to re-place), `.ai/calendar.md`, `.ai/context.md`, `.ai/initiatives/_index.md`, and the archive moves (take the flat layout). For `apps/`, `warehouse/`, `factory/` and `scripts/` take `origin/main` unless the pile holds something you have not shipped: your v2.119.0 commit is the newer truth for the pipeline files.
4. Commit and push the `.ai/` and `scripts/sql/` work at Bill's order (docs only; no Heroku change needed).

This is row **T55** in `standards.md`.

---

## 3. The one unshipped piece: the Thrift+ scanner on the real API

- **Where:** worktree `C:\Coding\_worktrees\ecothrift-dashboard--thrift-scanner`, branch `thrift-scanner-mock`, based on `13e10dfe`, **uncommitted**. It has its own real `frontend/node_modules` (not a junction) and a hard link to `.env`.
- **What it is:** the customer scanner (`/scan`) moved off the mock onto the real `thriftPlusScanner.api`; `AccountScreens.tsx` (+ test), "My account" in `CartPage.tsx`, `?reset=` and `?view=account` in `ThriftPlusScannerPage.tsx`; and a server fix in `apps/thriftplus/public_views.py` (`_me_payload` helper, so card-lost and remove-person no longer answer 405) with a test.
- **Saved copy:** `workspace/handoff-2026-10-02/`
  - `thrift-scanner.code-only.patch` applies cleanly on `94c709ee` (`git apply --check` passed).
  - `thrift-scanner-untracked/` holds the two new files (`AccountScreens.tsx`, `AccountScreens.test.tsx`), same paths.
  - `thrift-scanner.changelog-entry.md` is its `CHANGELOG.md` text (the full patch conflicts only there).
- **To finish:** apply the patch on `main`, copy the two files in, run `python scripts/dev/lean_test.py suite thriftplus`, ship on Bill's order. It was planned for Thu 10-08. Then remove the worktree and the branch.
- The owner's direction for the scanner is in memory (`scanner-owner-direction.md`).

`workspace/handoff-2026-10-02/` also holds patches of the two worktrees the Helper removed (`inventory-count`, `floor-plan`). Their work shipped in v2.112.0; the patches are only a safety copy and can be deleted.

---

## 4. What the Helper cleaned up, and what is left for you

**Removed by the Helper (2026-10-02)**
- Worktrees `_worktrees\ecothrift-dashboard--ship-2112`, `--inventory-count`, `--floor-plan` (their `node_modules` junctions were unlinked first; the main checkout's `node_modules` is intact).
- Local branches `count-v2`, `ship-v2.112.0`, `inventory-count`, `floor-plan` (all merged into `origin/main` or empty).
- Local test database `test_ship_gate_2112`.
- Local test users, throwaway orders and count data made for browser checks.

**Left, yours to decide**
- Worktree `_worktrees\ecothrift-dashboard--thrift-scanner` + branch `thrift-scanner-mock` (§ 3).
- Your own worktree `C:\Coding\ecothrift-intake` (branch `intake-standard`). House rule D7: nothing at the `C:\Coding` root; worktrees live in `C:\Coding\_worktrees\`.
- Local branch `kiosk` (`562eecb3`, old handoff branch) and remote branches `origin/hotfix/prod-fix`, `origin/wip/initiatives-2026-07-17`. The Helper never touched them.
- `refs/runner/R-001` … `R-049` (runner test snapshots).
- Local test databases from old runner runs: `test_r038_pytest`, `test_r043_qa`, `test_r044_qa`, `test_r045_qa`, `test_r046_qa`, `test_r047_qa`, `test_r049_py`, `test_r049_qa`. (`test_local_shared` is the normal one; `test_rollins` belongs to another project.)
- `workspace/cleanup_compare/` (model comparison results, § 7) and `workspace/handoff-2026-10-02/`.
- `.ai/comm/inbox-thrift_scanner.md`: that coder was retired on 09-30; the file can go.

---

## 5. Inventory count (`apps/stocktake`): state and what to watch

- Design, decisions and record: `.ai/initiatives/inventory_count.md` (§ Version 2 wins over the older sections).
- **First real count is Mon 2026-10-05.** The owner counts every Monday. He pre-approved shipping count-screen fixes on a weekend (memory: `weekend-count-fixes.md`).
- Pages: `/inventory/count` (phone scan screen), `/inventory/count/days` (sessions, managers), `/inventory/pr-fixit` (staff, Retail Floor menu), `/inventory/count/:id/report` (shrink report).
- Known limits:
  - "Missing" is whole-store: items have no location, so a section's expected number is only its count from the last day it was completed.
  - Each scan batch recomputes the day's summary from all good scans (fine at thousands; watch it near 30,000). The days list loads slowly for the same reason.
  - PR Fix-it prints through the local print server on that computer. In the browser check printing was stubbed; no real tag has been printed from it yet.
  - Editing a title in PR Fix-it gives the item its own product when the product is shared.
- The owner's wish list not built: per-section expected counts from real locations, a "where is it" for missing items, weekly shrink trend.

## 6. The purchase-order query fix (production incident, 10-01)

- Heroku warned that the shared database was out of temporary disk space. Master traced it to `_annotate_purchase_order_stats` in `apps/inventory/views.py`: ten `Count(..., distinct=True)` over three joined child tables (items x manifest rows x batch groups). 150 GB of temp files over 328 calls; the receiving page for order 379 hit H12.
- Fix (v2.115.1): each count is a correlated subquery (`_count_per_purchase_order`). Master confirmed the old statement gained no calls afterwards.
- **Rule:** never count two child relations of one parent with joined `Count(distinct=True)` in one query. `apps/inventory/tests/test_purchase_order_stats_query.py` fails if a child table is joined there.

## 7. AI cleanup (preprocessing step 2): how it works now

- `apps/inventory/services/ai_cleanup_job.py`: the page starts a job and polls `orders/<id>/ai-cleanup-job/`. The job is a **thread inside the web process**; its state is one `AppSetting` row per order (`ai_cleanup_job:<order id>`; these rows accumulate, one per order, and are harmless).
- Gunicorn recycles workers (`--max-requests 500`) and deploys restart them, which kills the thread. Progress is the data (`ai_reasoning` set = cleaned), and a poll that finds a stale heartbeat restarts the job. If the page is closed when that happens, the job waits until the order is opened again.
- Model list = active text models in Settings > AI. Effort dropdown, default from the Inventory cleanup action. Workers 8 / 16 / 32 / 48. 150 s per model call. A batch gives its database connection back during the model call. "Too many requests" waits 8, 20, 45 s and retries.
- The old browser-pool endpoint `ai-cleanup-batch` still exists and is no longer used by the page; `frontend/src/utils/aiCleanupPool.ts` now only supplies constants.
- **Model comparison on 50 rows of order 382** (`workspace/cleanup_compare/`, per 1,000 rows): Sonnet 5.5 about $2.40; Gemini 3.5 Flash $2.09 (20 s a batch); Gemini 3.5 Flash-Lite $0.54; Gemini 3.1 Flash-Lite $0.33; Spark Contributor $0.11 at default effort, **$0.07 at low effort** (37 s a batch at 10 rows). The owner chose Spark Contributor at low effort. Spark at 48 workers has not been measured; your pipeline shares the same key and rate limit.
- `apps/inventory/tests/test_ai_cleanup_batch.py`: its helper passed two fields that no longer exist, so 19 tests had failed on `main`; fixed in v2.116.0. **Prune those 19 from `.ai/comm/runner/baseline.md`.**

## 8. Thrift+ (launch Tue 2026-10-20; all work done by Thu 10-15)

- **Read first:** `.ai/extended/thrift-plus-decisions.md`, then the legal memo and the Limited Warranty file. They are only in the main checkout (§ 2).
- Not started, targeted 10-12 / 10-13: tax by type, **Thrift+ Balance** (replaces banked rewards), Limited Warranty (credit 90% + tax, `no_warranty` item flag, untested items covered), receipt lines (LW / NO WARRANTY), "member discount" wording, slogan, publish schedule, photo optional with consent, 18+ photo-match step, text opt-in, terms and privacy draft for membership, AS IS signs. Print server 1.9.0 for the receipts.
- Shipped by the Helper: the floor-stock calculator (`apps/thriftplus/services/floor_plan.py`, Thrift+ page tab, superuser only) and two receipt fixtures in `printserver/fixtures/`.
- Launch Kit page (the owner did not love it; still the task list): https://claude.ai/artifact/WzPhon6EJvA2S7XLk8M3oZ
- The owner's open decisions (numbers from the decisions file): 2 (3 vs 7 wait days), 6 (items under $5), 9 (address / phone), 15 (monthly $10), 21, 22, 26 (under 18), 31 (floor stock), 33, 34.
- New initiative idea the owner loves, not started: `.ai/initiatives/sell_time_model.md` (chance an item sells each day, from price and context).

## 9. Texting (house standard D17) and the public pages

- Live: `https://ecothrift.us/privacy` and `/terms` (`frontend-public/src/pages/PrivacyPage.tsx`, `TermsPage.tsx`, constants in `src/data/legal.ts`). The owner read and approved the wording. Two sentences are carrier-required and guarded by `apps/core/tests/test_public_legal_pages.py`. Change `LEGAL_LAST_UPDATED` when the wording changes.
- The Terms page has no general terms of use (the site never had any) and says "rewards and credit balance" (master's phrase; the owner's term is Thrift+ Balance). Both were flagged to the owner; he shipped as is.
- Not built: consent tick where a phone number is collected (T59; belongs at Thrift+ signup), sending through master's `notify` package (T60). No Twilio key anywhere yet.
- Master's kit folder `.ai/reference/from-master/2026-10-01-texting/` stays until T59 is done.

## 10. Master and the standards list

- You now own `comm/inbox.md` and `comm/outbox.md`. Master's nudges say "check messages"; only the inbox is an instruction.
- `standards.md` is the memory of what this repo owes the house standards. Production order from master: nothing on production before 10-20; week of 10-26: T23, T31, T43; from 11-01: platform rows; storage switch (T52 to T54) on its own day with Bill.
- New rows from 10-01: T58 done, T59, T60 (texting); T61 (users review after 10-20), T62 (retire `CustomerProfile`, M); T63 done.
- **Outbox:** when this was written the outbox said "1 message" and was not the Helper's text. The Helper's last note to master (the pages are live, T58 and T63 done, master can register the sender) may have been overwritten. Tell master in your next outbox.
- Master said outbox Status is only `empty` or `pending`.

## 11. How the Helper shipped, and test notes

- From a worktree on `origin/main`, never the main checkout: bump `.version`, root `package.json`, `CHANGELOG.md`, write `scripts/deploy/commit_message.txt`, `git add -A`, `git commit --file=...`, `git push origin <branch>:main`, then `git push heroku <branch>:main` once `HEAD == origin/main`. Smoke by status code (the version endpoint needs a login).
- Gate: `python scripts/dev/lean_test.py suite ship` (`apps/stocktake` is in the suite). The Helper ran it on a private database with `DATABASE_NAME=ship_gate_2112` because both sessions shared `test_local_shared`.
- **A reused test database can lose its seeded rows** (AI models, AI actions, bucket templates), which shows up as false "NEW" failures in `apps/core/tests/test_ai_settings.py` and `test_preprocessing_redesign…test_seed_basic_bucket_templates_exist`. Rerun with `pytest --create-db` before believing them.
- Git Bash quirks on this PC: an argument like `origin/main:path/file` gets mangled (use `git ls-tree`), heredocs collapse `\\`, and a worktree's `node_modules` junction must be unlinked with `cmd /c rmdir` before `git worktree remove`.
- Browser checks used a throwaway local superuser and stubbed printing; nothing of that remains.

## 12. Memory

The auto-memory folder `C:\Users\bill_\.claude\projects\C--Coding-ecothrift-dashboard\memory\` is shared by every session on this repo. The Helper wrote or updated: `weekend-count-fixes.md`, `thrift-plus-legal-memo.md`, `ship-tested-snapshot.md`, and `helper-handoff.md` (points here).
