# Standards — ecothrift-dashboard

**Standing initiative** — never archived. What this repo still owes the house standards (`C:\Coding\.ai\standards\`), and when each item is due.
**Last review:** 2026-09-30 against standards README dated 2026-09-30 (reshaped 2026-10-01 by the 5S kit, D15) · Protocol: [`standards-review.md`](../protocols/standards-review.md)

Already met: ports (8000 / 5173 / 5174), naming (`ecothrift-dashboard` everywhere, schema `ecothrift`), `python-decouple`, Vite `envDir` = repo root, the env-name table in `extended/development.md`, only `.env` + `.envprod`, D10 (dev shares prod keys; dev writes only its own S3 folder; local mail off). This repo is the **reference** for the prod → local DB pull (`scripts/db/`).

**Production order (master, 2026-09-30):** nothing on production before the Thrift+ launch (Tue 2026-10-20). Week of 10-26: T23, T31, T43. November: the platform rows (T25–T30, T33), after Dark Horse's pilot; read `C:\Coding\.ai\standards\tech-target.md` § Upgrade notes first. Early December: Postgres 18 (T32, needs T31). Storage switch (T52–T54) on its own day with Bill present. Every M row waits for Bill.

## Open

| # | Area | Change | Bucket | Due | Status | Source |
|---|------|--------|--------|-----|--------|--------|
| T24 | storage | Add the `ENTITY` key, with the storage switch | M | after:T52 | open | review 2026-09-30 |
| T25 | tech-target | Python 3.14 via `.python-version` (repo is on 3.12; this PC has 3.14.7 as `py` since 09-30). Local test, then ship | M | after:2026-10-26 | open | review 2026-09-30 |
| T26 | tech-target | `psycopg[binary]` 3.3.x in place of `psycopg2-binary==2.9.10`. One tested release with T28 | M | after:2026-10-26 | open | review 2026-09-30 |
| T27 | tech-target | Exact `==` pins: 9 are loose (`pymupdf`, `anthropic`, `openai`, `bleach`, `requests`, `msal`, `PySocks`, `pytest`, `pytest-django`) | M | after:2026-10-26 | open | review 2026-09-30 |
| T28 | tech-target | Django 5.2.x latest, DRF 3.18, simplejwt 5.5, cors 4.9, filter 26, dj-database-url 3, gunicorn / whitenoise latest | M | after:2026-10-26 | open | review 2026-09-30 |
| T29 | tech-target | heroku-26 stack (on heroku-24). Its own release, after the Python move (Dark Horse's lesson) | M | after:T25 | open | review 2026-09-30 |
| T30 | tech-target | Node 24 LTS: `engines` 24.x (now 22.x). This PC runs 24.19 since 09-30, so the PC no longer blocks it; tell master if a dev server or build misbehaves under 24 | M | after:2026-10-26 | open | review 2026-09-30 |
| T32 | tech-target | Postgres 18 (shared add-on is on 15, which ends 2027-02-28). Master-coordinated window, early December | M | after:T31 | waiting on master | review 2026-09-30 |
| T33 | tech-target | Latest tooling minors (MUI / Vite / Vitest carets; React stays 18.3, React 19 is X5 and not here). With T28 | M | after:T28 | open | review 2026-09-30 |
| T35 | storage | One IAM user per app + environment (today one key pair, local = prod). Master + Bill in the AWS console | M | bill | waiting on master | review 2026-09-30 |
| T36 | ai-router | Adopt master's vendored `llm_router.py` v1 (Eco's router is the seed) | S | after:master ai-router v1 | waiting on master | review 2026-09-30 |
| T37 | ai-router | Every AI call writes the `AIUsage` table (today a file log, `workspace/logs/ai_usage.jsonl`). With the router package | M | after:T36 | waiting on master | review 2026-09-30 |
| T52 | storage | D12 switch: `AWS_STORAGE_BUCKET_NAME=ecothrift-dashboard-files`, `AWS_LOCATION=prod`, own AWS user. The copy is done (2,713 objects, verified 09-30). Switch day after the launch and after T54, Bill present | M | bill | open | master 2026-09-30 |
| T53 | storage | Remove the old objects in `dashboard-basic` after a verification period. Master + Bill | M | after:T52 | open | master 2026-09-30 |
| T54 | storage | Before the switch: every S3 client uses the regional endpoint (`https://s3.us-east-2.amazonaws.com`, virtual-hosted, sigv4, `region_name=us-east-2`): django-storages, the media proxies, print-server publish (`printserver/distribute.py`), any presign. Right after the env push: an automated check that fetches every stored file through production's own code; any failure means roll back | M | after:2026-10-12 | open | master 2026-09-30 |
| T61 | users | Run `standards-review` against `C:\Coding\.ai\standards\users.md` (D16: sign in with username or email, `owner` role, access by area enforced on the server with a route-coverage test, 8+ character passwords, lockout, one-time set-password links, accounts switched off not deleted, account changes logged, 4 hours idle sign-out) and add the staff-login gaps as rows. **Bill, 2026-10-06:** build it right after `inventory_effort`. Usernames = first name lower-case (`bill`, `carrie`; last initial on a clash), sign in with username or email. Passwords: option A, a **Set password** button shows a one-time link + QR on screen (no email); the person picks their own. Plus My account → Change password, 8+ characters, lockout, switch off not delete | S | after:inventory_effort | shipped v2.144.0 (2026-10-06); gaps in T68, T69 | master 2026-10-01 · Bill 2026-10-06 |
| T68 | users | Gaps left after T61 (standards-review against `users.md`, 2026-10-06): an **`owner`** role (today: Django superuser + Admin group), and **access by area enforced on the server**, with a route-coverage test that fails when a route has no area decision (today: role classes `IsAdmin` / `IsManagerOrAdmin` per view). Its own phase, with Bill | M | after:2026-10-20 | open | review 2026-10-06 |
| T69 | users | **4 hours idle sign-out** (D16). Today: 30-minute access tokens, 7-day refresh cookie with rotation, so an idle register stays signed in for up to 7 days. Needs a named longer setting for registers and the kiosk before it changes; plus the expired-token test D16 asks for | S | after:2026-10-20 | open | review 2026-10-06 |
| T62 | users | One customer system: retire `CustomerProfile` (customers as staff-table users) in favour of Thrift+ `Account` / `Person` / `MemberLogin` | M | after:2026-10-20 · bill | open | master 2026-10-01 |
| T67 | app-api | Partner API (D19): take partner-api 1.0.0 from `.ai/reference/from-master/2026-10-06-partner-api-1.0.0/` as its `MANIFEST.md` says, and build the feeds agreed through master (list: `C:\Coding\.ai\standards\app-api.md` § Feeds). The finance app's side is live (Rollins v0.16.0, contract in its `.ai/extended/partner-api.md`). **F2** (we call it): scopes `transactions:read`, `categories:read`, entity `ecothrift`; on Bill's order: env pull, `manage.py partner_api new-token FINANCE`, add `FINANCE_API_BASE=https://dash.rollins-family.com`, env push, send the SHA-256 in the outbox. **F3** (we serve daily sales): on Bill's order register its token in production with `manage.py partner_api add rollins-dashboard --sha256 494575508c4090f8718964b8c151ca1b86c6817c54ffb1f30a58d3cc4b10833a --entity ecothrift --scopes sales:read`; it pulls `sales/daily?month=` nightly at 10:00 UTC | M | bill | open | master 2026-10-06, 2026-10-08 |

Status: `open` · `doing` · `blocked (why)` · `waiting on master`

## Deviations (approved)

| # | Standard | What this repo does instead | Why | Decision |
|---|----------|-----------------------------|-----|----------|
| DR1 | scripts-and-env | Extra `scripts/dev` starters (staff-only, phone HTTPS, public site, `lean_test.py`) | Two front ends + the phone scanner need different stacks | approved, master 2026-09-30 |
| DR2 | ai-folder | `comm/RUNNING-NOW.md` while a long job runs | A multi-day job needs a note every session sees | approved, master 2026-09-30 |
| DR3 | protocols | Root `package.json` `version` mirrors `.version` | Heroku builds from the root `package.json` | approved, master 2026-09-30 |

## Done

`local` = `.ai/`, scripts or docs work in the main checkout that has not been committed yet (see T55).

| # | Change | Done | Release |
|---|--------|------|---------|
| T1 | `AGENTS.md` names the protocols that exist; RUNNING-NOW peek | 2026-09-30 | local |
| T2 | `.ai/README.md` deleted (it repeated the compass) | 2026-09-30 | local |
| T3 | `comm/threads.md` retired; coder table in `context.md` § Two coders | 2026-09-30 | local |
| T4 | `extended/initiatives.md` retired; filing rules live in `initiative-review.md` | 2026-09-30 | local |
| T5 | `context.md` in the 8-section shape; Hidden UI → `extended/frontend.md`, issues → `extended/known-issues.md` | 2026-09-30 | local |
| T6 | `_index.md` in the template shape | 2026-09-30 | local |
| T7 | `comm/RUNNING-NOW.md` approved as DR2 | 2026-09-30 | local |
| T8 | Adopted `from-master/` kits deleted | 2026-09-30 | local |
| T9–T15 | Canonical protocols: `startup`, `check_comm`, `initiative-create` / `-review`, `ship-git`, `ship-heroku`; project-only protocols listed; commit line shape | 2026-09-30 | local |
| T16–T17 | House env-sync in `scripts/env/` + `env-sync.md` (replaced `scripts/deploy/env/`) | 2026-09-30 | local |
| T18–T21 | `scripts/db/` (Heroku capture, prod → local pull), dumps in `workspace/db/backups/`, `deploy/ship_git.bat` + `ship_heroku.bat`, `dev/start.bat` + `kill.bat` + `_helpers/` | 2026-09-30 | local |
| T22, T49, T50 | D10: local writes only `ecothrift/dev/` (`AWS_LOCATION` read from env), local mail off | 2026-09-30 | v2.112.0 (`settings.py`); rest local |
| T34 | Prefix move superseded by D12 (own bucket): see T52–T54 | 2026-09-30 | local |
| T38, T47, T48 | Worktrees under `_worktrees\ecothrift-dashboard--<slug>`; runner test shells removed; runner uses a per-run worktree with teardown | 2026-09-30 | local |
| T39–T42 | Repo root cleared: temp folders, a dead stub, `location_label.png`, `docs/` → `.ai/extended/` | 2026-09-30 | local |
| T44–T46 | Only `.env` + `.envprod`; shared keys allowed by D10; `.envprod` pulled and in sync with Heroku | 2026-09-30 | local |
| T51 | D12 copy: 2,713 objects (1.64 GB) into `ecothrift-dashboard-files/prod/`, 0 failed, verified; nothing in `dashboard-basic` changed | 2026-09-30 | local (`scripts/s3/copy_to_own_bucket.py`) |
| T56 | 5S kit (D15): protocols `check_comm` v4, `ship-git` v2, `ship-heroku` v2, `initiative-review` v2, `startup` v1.1, new `standards-review`; `tech_target.md` → this file; one deviations list; flat `_archived/` with a disposition column; `comm/runner/archive/` removed (git history keeps it); unused `reference/` shelves (floorplan copies, the location-label image) removed at the owner's order; `.gitignore` ignores only the two delivery shelves; `AGENTS.md` triggers | 2026-10-01 | local |
| T57 | The four runnable SQL files moved from `.ai/extended/sql/` to `scripts/sql/` (master: tools live in `scripts/`); `schema.csv` stays beside its doc; dead `reference/tars/design.md` link removed from `extended/restoration.md` | 2026-10-01 | local |
| T58 | Public `/privacy` and `/terms` pages on `ecothrift.us` (footer links, sitemap, required wording kept by `apps/core/tests/test_public_legal_pages.py`); Bill read and approved the wording | 2026-10-02 | v2.118.0 |
| T63 | Expired or invalid staff token answers 401 with `WWW-Authenticate: Bearer` (it already did); test `apps/accounts/tests/test_expired_token.py` | 2026-10-02 | v2.118.0 |
| T64 | One coder: hand-off read (`reference/reports/2026-10-02-helper-handoff.md`), peer inbox `comm/inbox-data_platform.md` removed; `RUNNING-NOW.md` kept because it is still true (local holds the unloaded backfill) | 2026-10-02 | local |
| T65 | Production rows re-dated (Bill, 2026-10-02: everything goes to production as soon as it is done and tested, not held for the launch): T23 and T43 the week of 10-05; T31 and T54 from 10-12 (after the shared database plan change on Sun 10-11); T52 stays Bill's day; the platform release T25 to T28 and T30 from 10-26. Order sent to master | 2026-10-02 | v2.120.0 |
| T66 | Ship / deploy rules (D18), Bill's yes in chat 2026-10-02: `ship.md` + `deploy.md` v3 (project steps carried over, no backup step), `env-sync.md` v1.1, env-sync 1.1.0, the `AGENTS.md` lines, `scripts/deploy/ship.bat` + `deploy.bat` (no prompts; the old two removed), prompts removed from `scripts/db/backup_prod.bat`, `printserver/distribute.bat` and the dev starter, docs swept | 2026-10-02 | local (goes out with the main checkout's next ship, T55) |
| T31 | Shared Postgres **attached** to `ecothrift-dashboard` as `DATABASE` (`postgresql-animated-38252`); the copied `DATABASE_URL` config var is gone, so the address follows the add-on. Done in maintenance mode, 13 seconds, at Bill's order; a temporary attachment proved the attach first and was removed. `.envprod` refreshed | 2026-10-02 | Heroku v389 to v392 (config only) |
| T23 | The 12 `AI_MODEL_<PURPOSE>` keys removed from Heroku (`push.bat --unset`, Bill's order 2026-10-07) and from `.envprod` (pulled after); `AI_MODEL` stays as the emergency fallback. Code read them only in migration `core/0006`, which ran long ago. App checked after the restart | 2026-10-07 | Heroku v420 (config only) |
| T43 | The B-Stock log (`buying.scraper`) moved to `workspace/logs/bstock_api.log` on a PC; on Heroku console only (no file, no folder made at boot). Checked both ways (`DYNO` set and not); buying and core tests pass. Bill's order 2026-10-07 | 2026-10-07 | v2.148.1 |
| T55 | Main checkout caught up with `origin/main` (15 commits behind): the pile was snapshotted on the local branch `main-tree-pile`, `main` fast-forwarded, the pile merged back. App code is identical to `origin/main`; the merge carries the `.ai/` standards work, the D18 protocols and scripts, and `scripts/sql/`. Retired files removed: `ship-git.md`, `ship-heroku.md`, `tech-target-review.md`, `tech_target.md` | 2026-10-02 | local merge commit; goes out with the next ship |
| T71 | Applicant text tick v2 (`hiring-sms-2026-10-07`, master's words) on the application form; a v1 tick gets interview texts only (the first-day text is recorded as not covered); a new hire on v1 is offered the v2 tick (optional, unticked) on the **offer page** when signing, since they first sign in to Dash on day one, after the day-before reminder. Recorded the same way ("Offer page") Replaced 2026-10-08 by T73 (email-first, D20): texting parked. | 2026-10-07 | v2.149.0 |
| T60 | Replaced: Eco owns the sender. No house `notify` package; `apps/texting` (the hiring coder's) is the one consent store, message log and `send()`, and `_deliver()` is written against Twilio's messaging service once the gates clear. Master lifts it into a package only if another app ever texts | 2026-10-07 | none (decision) |
| T70 | Every public or default email address is `retail@ecothrift.us` (Bill via master 2026-10-07): the public site's contact email (footer, `/terms`, `/privacy`) switched from `sales.ecothrift@outlook.com`; legal pages dated October 7, 2026. Senders and reply-tos in Dash, online sales and hiring already used `retail@` (or `bill_rollins@` for hiring replies). Checked live: the site bundle has `retail@` and no `outlook.com` | 2026-10-07 | v2.148.2 (Heroku v422) |
| T73 | Email-first (D20, Bill 2026-10-08): no texts. Hiring's part and the shared `apps/texting` `EmailConsent` in v2.154.0 (no email box on the application; `PARKED = True`); the Thrift+ sign-up email boxes, Dash and My account choices, and `/terms` `/privacy` with no text program (dated October 8, 2026) in v2.155.0. Checked live | 2026-10-08 | v2.155.0 (Heroku v430) |
| T75 | Eco-Thrift's own icon set (Bill via master 2026-10-08), by master's method: Opus wrote the recipe and the 84-row list in `frontend/src/icons/ecoIcons.tsx`, ten Haiku helpers drew in parallel, Opus reviewed the sheet at 20 and 40 px, light and dark and on a phone (19 sent back, 3 fixed by hand). Sidebar pages, workspaces, page headers and common buttons use it; names typed from the set; recipe test; Admin > Icons | 2026-10-08 | v2.157.0 |
| T74 | No email boxes at Thrift+ sign-up (Bill: no box where none is needed): the optional email and one line; account email needs no consent; store news goes to members with an email and is turned off in Dash, My account or by the unsubscribe link; only opt-outs are recorded in `EmailConsent`. Terms and Privacy match. Checked live | 2026-10-08 | v2.155.1 (Heroku v431) |
| T59 | Thrift+ sign-up text consent: two separate, unticked boxes (account texts, store news) at the register and Dash sign-up, words word for word from `texting.md` § Campaign (versions `thriftplus-sms-2026-10-07`, `news-sms-2026-10-07`); each choice recorded in `apps/texting` (kind, in or out, how, staff, wording, version); staff change in Dash, members in My account (start needs the password sign-in); STOP ends both. Screenshot for the reviewer: `workspace/2026-10-08-t59-register-signup-text-boxes.png` (harness `workspace/t59shot/`) Superseded 2026-10-08 by T73 (email-first, D20): the text boxes become email boxes; the recorded text consents stay, unused. | 2026-10-08 | v2.150.0 (Heroku v425) |
| T72 | T59 brought forward and live with T70 before the Twilio profile approval; master told (outbox 2026-10-08) Superseded by T73: no Twilio registration for now. | 2026-10-08 | v2.150.0 |
