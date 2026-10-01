<!-- Last updated: 2026-09-30 (S rows done; D8 env-sync adopted; result sent to master) -->
# Initiative: tech_target

**Status:** standing (never archived)
**Owner:** project coder (slug `tech_target`) · **Target:** `C:\Coding\.ai\standards\` · **Protocol:** [`tech-target-review.md`](../protocols/tech-target-review.md)
**Last review:** 2026-09-30 (standards draft v0 dated 2026-09-30, D1–D8; kits `2026-09-30-standardization` v2 and `2026-09-30-env-sync` v1.0.0)

## Summary

| Area | Gaps | S | M | X | Done |
|------|------|---|---|---|------|
| `.ai` layout (ai-folder.md) | 8 | 8 | 0 | 0 | 7 (T7 approved as DR2) |
| Protocols (protocols.md) | 7 | 7 | 0 | 0 | 7 |
| Scripts + env (scripts-and-env.md, D8) | 12 | 9 | 3 | 0 | 8 |
| Platform + versions (tech-target.md) | 9 | 0 | 9 | 0 | 0 |
| Storage (storage.md) | 2 | 0 | 2 | 0 | 0 |
| AI router (ai-router.md) | 2 | 1 | 1 | 0 | 0 |
| Ports + naming (projects.md) | 1 | 1 | 0 | 0 | 1 (master) |
| Repo root (projects.md § Nothing loose, D7) | 5 | 4 | 1 | 0 | 4 |

Ports (8000 / 5173 / 5174), naming (`ecothrift-dashboard` everywhere, schema `ecothrift`), `python-decouple`, Vite `envDir` = repo root, the env-name table in `extended/development.md`, and the own-schema prod → local pull already met the standard. This repo is the **reference** for the prod → local DB pull (`scripts/db/`).

## Gaps

| # | Area | Standard says | This repo had | Change | Bucket | Order | Status | Needs Bill |
|---|------|---------------|---------------|--------|--------|-------|--------|------------|
| T1 | `.ai` | `AGENTS.md` names the protocols | Master's bootstrap named protocols that didn't exist yet | Canonical + project-only protocols listed; RUNNING-NOW peek | S | 1 | done 2026-09-30 | n |
| T2 | `.ai` | No `.ai/README.md` | `.ai/README.md` repeated the compass | Deleted | S | 2 | done 2026-09-30 | n |
| T3 | `.ai` | `comm/` = inbox, outbox, `inbox-<slug>`, `runner/` | `comm/threads.md` (threads board, rules, ship log) | Threads + rules → `context.md` § Two coders; ship log = `CHANGELOG.md`; deleted; `data_platform` told | S | 3 | done 2026-09-30 | n |
| T4 | `.ai` | Filing rules live in `initiative-review.md` | `extended/initiatives.md` | Retired; `_index.md`, `ARCHIVE.md`, `context.md`, root `README.md` relinked | S | 4 | done 2026-09-30 | n |
| T5 | `.ai` | `context.md` in the 8-section template shape | Own shape with history, Hidden UI, File map, Known issues | Reshaped (131 lines). Hidden UI → `extended/frontend.md`; Known issues + live gaps → `extended/known-issues.md`; File map dropped (root `README.md` has the tree) | S | 5 | done 2026-09-30 | n |
| T6 | `.ai` | `_index.md`: Standing `tech_target` + Active; buckets in `ARCHIVE.md` | Pending / Backlog / Completed / Lifecycle tables repeated | Template shape; every archived row checked present in `ARCHIVE.md` | S | 6 | done 2026-09-30 | n |
| T7 | `.ai` | Nothing else in `comm/` | `comm/RUNNING-NOW.md` | Approved as DR2; deleted when the catalog run ends | S | — | approved (DR2) | n |
| T8 | `.ai` | Delete `from-master/` kits once adopted | Two kits | Both deleted after adoption | S | last | done 2026-09-30 | n |
| T9 | Protocols | `startup.md` | `context-load.md` | Canonical; Project steps: `RUNNING-NOW.md`, two-coder slugs | S | 7 | done 2026-09-30 | n |
| T10 | Protocols | `check_comm.md` v2 | Pre-v2 + master patch | Canonical v2 (`ecothrift-dashboard`); Project steps: slugs, worktree comm path | S | 8 | done 2026-09-30 | n |
| T11 | Protocols | `initiative-create.md` / `initiative-review.md` canonical | Same text, old filing link | Canonical copies | S | 9 | done 2026-09-30 | n |
| T12 | Protocols | `ship-git.md` | `ship-push-git.md` | Canonical + Project steps (fetch/merge/bump, ship-from-worktree, `lean_test.py tsc` + compile, docs audit, root `package.json` = `.version`, `ship_git.bat`) | S | 10 | done 2026-09-30 | n |
| T13 | Protocols | `ship-heroku.md` | `ship-push-heroku.md` | Canonical (`APP` = `ecothrift-dashboard`); Project steps: backup on `ecothrift-database`, smoke URL, `stage_request` after release | S | 11 | done 2026-09-30 | n |
| T14 | Protocols | Project-only protocols listed | `runner.md`, `comm/runner/shift.md` pointed at `context-load.md` | Relinked to `startup.md`; `clean-up`, `runner`, `ship-print-server` listed in `context.md` + `AGENTS.md` | S | 12 | done 2026-09-30 | n |
| T15 | Protocols | Commit line 1 `vX.Y.Z — summary` | `feat: vX.Y.Z …` | Canonical from the next ship (in `ship-git.md`) | S | 13 | done 2026-09-30 | n |
| T16 | Scripts | D8: house env-sync in `scripts/env/` (`pull`, `diff`, `push`) + `env-sync.md` | `scripts/deploy/env/` (`pull_from_heroku.bat --into-local` merged **prod keys into `.env`**, `sync_to_heroku.bat` set every key) | Replaced with env-sync v1.0.0 (unchanged) + `env_sync.json`; protocol installed; docs relinked | S | 14 | done 2026-09-30 | n |
| T17 | Scripts | Push: names-only diff, changed keys only | (see T16) | Superseded by env-sync | S | — | done (T16) | n |
| T18 | Scripts | `scripts/db/backup_prod.bat` = Heroku capture; `pull_prod_to_local.bat` | `deploy/1_backup_prod.bat` = local `pg_dump` of **all schemas** (incl. `darkhorse`); `deploy/0_pull_prod_to_local.bat` + `helpers/` | `scripts/db/` (capture on `ecothrift-database`; pull + `_helpers/` + smoke check, SMOKE_OK); `nightly.ps1` relinked. Nothing run against prod | S | 15 | done 2026-09-30 | n |
| T19 | Scripts | Dumps are scratch → `workspace/` | ~730 MB in `scripts/deploy/backups/` | Moved to `workspace/db/backups/`; the pull writes there | S | 16 | done 2026-09-30 | n |
| T20 | Scripts | `deploy/ship_git.bat`, `ship_heroku.bat` (refuses unless `HEAD == origin/main`) | `2_push_github.bat` … `5_deploy_yolo.bat` | `ship_git.bat` (`git add -A`), new `ship_heroku.bat`; 3, 4, 5 deleted | S | 17 | done 2026-09-30 | n |
| T21 | Scripts | `dev/start.bat`, `dev/kill.bat`, `dev/_helpers/` | `start_all.bat`, `dev.ps1 -Stop`, helpers loose | `start.bat`, `kill.bat`; `dev.ps1` + `phone-qr.mjs` → `_helpers/` (parse-checked); other starters kept (DR1) | S | 18 | done 2026-09-30 | n |
| T22 | Env | Local never writes production storage | Local `USE_S3=True` at the bucket root | Interim `USE_S3=False` (09-30), then D10: `USE_S3=True` + `AWS_LOCATION=ecothrift/dev` (T49) | S | 19 | done 2026-09-30 | n |
| T23 | Env | No `AI_MODEL_<PURPOSE>` keys | 12 `AI_MODEL_<PURPOSE>` keys in `.env`, `.envprod`, Heroku | Removed from `.env` (lines kept in `workspace/tech_target/`). `.envprod` + `push.bat --unset` = M | M | 20 | S part done; M open | y |
| T24 | Env | `ENTITY` key | Not set | Add with the storage move (T34) | M | — | open | y |
| T44 | Env (D8) | Only `.env` + `.envprod`, both gitignored | Only those two exist; `.gitignore` covers both | — | S | — | met | n |
| T45 | Env (D8) | D10: dev may share prod keys; dev and prod never share an S3 folder | 13 credential names in `.env` hold the **same value as prod**: `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_MAPS_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET_NAME`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_TENANT_ID`, `MS_GRAPH_MAILBOX`, `BUYING_SOCKS5_PROXY_USER` / `_PASSWORD` | Allowed by D10 (Bill 2026-09-30); the storage split is T49, the mail guard T50 | S | 21 | met (D10) | n |
| T46 | Env (D8) | `.envprod` = exact mirror of Heroku | Last written by the old pull; `META_API_KEY` is in `.env` but not `.envprod` | Pulled 2026-09-30 on Bill's ask: `.envprod` in sync with Heroku (62 vars). Diff: `META_API_KEY`, `STAFF_DASHBOARD_HOST` only in `.env` | S | 22 | done 2026-09-30 | n |
| T25 | Platform | Python 3.14 via `.python-version` | 3.12 | After the PC install; local test, then ship | M | 23 | open | y |
| T26 | Platform | `psycopg[binary]` 3.3.x | `psycopg2-binary==2.9.10` | Swap; test locally | M | 24 | open | y |
| T27 | Platform | Exact `==` pins | 9 loose (`pymupdf`, `anthropic`, `openai`, `bleach`, `requests`, `msal`, `PySocks`, `pytest`, `pytest-django`) | Pin to installed versions | M | 25 | open | y |
| T28 | Platform | Django 5.2.x latest, DRF 3.18, simplejwt 5.5, cors 4.9, filter 26, dj-database-url 3, gunicorn / whitenoise latest | 5.2 bare, 3.16.0, 5.4.0, 4.6.0, 24.3, 2.3.0, 23.0.0, 6.8.2 | One tested release with T26 | M | 26 | open | y |
| T29 | Platform | heroku-26 | heroku-24 | With T25 | M | 27 | open | y |
| T30 | Platform | Node 24 LTS | `engines` 22.x; this PC Node 20.20 (EOL) | PC first, then `engines` 24.x | M | 28 | open | y |
| T31 | Platform | Shared Postgres **attached** | **Copied `DATABASE_URL`** | `heroku addons:attach` from `ecothrift-database`, drop the copied var | M | 29 | open | y |
| T32 | Platform | Postgres 18 | Shared add-on on 15 (ends 2027-02-28) | Master-coordinated window | M | — | waiting on master | y |
| T33 | Platform | Latest tooling minors | MUI / Vite / Vitest on 7.3 / 7.3 / 4.1 carets; React 18.3 | Refresh with T28. React 19 = X5, not here | M | 30 | open | y |
| T34 | Storage | `ecothrift/<env>/<area>/…` via `AWS_LOCATION` | Bucket root | Superseded by D12 (own bucket, `prod/` + `dev/`): see T51–T53 | M | 31 | superseded by D12 | y |
| T35 | Storage | One IAM user per app + env | One key pair, local = prod | Master + Bill (AWS console); unblocks T45 | M | — | waiting on master | y |
| T36 | AI router | Vendored `llm_router.py` from master | Eco's router is the seed | Adopt the v1 hand-down | S | — | waiting on master | n |
| T37 | AI router | Every call → `AIUsage` table | File log `workspace/logs/ai_usage.jsonl` | With the router package | M | — | waiting on master | y |
| T38 | Naming | Worktrees in `_worktrees\ecothrift-dashboard--<slug>` | Four at `C:\Coding\` | Master removed the three test worktrees and moved the scanner | S | — | done 2026-09-30 (master) | n |
| T39 | Root | Nothing loose | `.tmp-dept-shots/`, `.tmp-step3/` (empty) | Deleted | S | 32 | done 2026-09-30 | n |
| T40 | Root | Nothing loose | `_backfill_manifest_denorm.py` (deprecated stub) | Deleted | S | 33 | done 2026-09-30 | n |
| T41 | Root | Nothing loose | `location_label.png` | → `.ai/reference/create_location_label/` (gitignored shelf) | S | 34 | done 2026-09-30 | n |
| T42 | Root | Nothing loose | `docs/` (2 files) | → `.ai/extended/app-map.md`, `.ai/extended/heroku-memory.md` (in the TOC) | S | 35 | done 2026-09-30 | n |
| T43 | Root | Logs in `workspace/` | `logs/bstock_api.log` from `settings.py` (prod too) | Handler → `workspace/logs/`: touches the Heroku boot path | M | 36 | open | y |
| T49 | Storage (D10) | `AWS_LOCATION` from env; dev writes `<entity>/dev/` | No prefix; local `USE_S3=False` | `settings.py`: `AWS_LOCATION = config('AWS_LOCATION', default='')` (prod unchanged). Local `.env`: `ENVIRONMENT=dev`, `USE_S3=True`, `AWS_LOCATION=ecothrift/dev` (storage location checked; no S3 call made) | S | — | done 2026-09-30 | n |
| T50 | Mail (D10) | Dev never emails customers | `.env` had `MS_GRAPH_ENABLED=true` with prod Graph keys | `MS_GRAPH_ENABLED=False` locally (mail off; no `MAIL_DEV_REDIRECT` needed) | S | — | done 2026-09-30 | n |
| T51 | Storage (D12) | One bucket per company (`ecothrift-dashboard-files`), `dev/` + `prod/` | Shared `dashboard-basic` at the bucket root | Copy step: `scripts/s3/copy_to_own_bucket.py` (dry run by default, server-side, never writes to the source). Inventory + dry run done (master settled ownership: `documents/` is Dark Horse's, `manifests/2025/` is ours, `docs/` `library/acks/` `downloads/` unclaimed). Keep AWS user `ecothrift-dashboard-s3` (has the own-bucket policy). Optional later: prune old print-server installers (1.09 GB) to what Settings links to. **Real copy blocked by the permission gate in this session; waiting for Bill's OK here** | M | — | copy done 2026-09-30 (2,713 objects, 1.64 GB, 0 failed, verified); switch is T52 | y |
| T52 | Storage (D12) | Switch: `AWS_STORAGE_BUCKET_NAME=ecothrift-dashboard-files`, `AWS_LOCATION=prod`, own AWS user | Live app on `dashboard-basic` root | Switch day per the production order (after Thrift+ 10-20), Bill present; plan in the outbox | M | — | open | y |
| T53 | Storage (D12) | Old objects removed after a verification period | — | Cleanup after the switch, master + Bill | M | — | open | y |
| T54 | Storage (D12 switch rules, from master 09-30 after Dark Horse's rollback) | New buckets need the regional endpoint for about 24 h | Every S3 client uses the global name | Before the switch: django-storages, the media proxies, print-server publish and any presign use `https://s3.us-east-2.amazonaws.com`, virtual-hosted, sigv4, `region_name=us-east-2` (`printserver/distribute.py` builds its own boto3 client too). Right after the env push and before anyone clicks: an automated check that fetches every stored file through production's own code; any failure means roll back. Part of T52 | M | — | open (with T52) | y |
| T47 | Naming (D7) | Nothing at the `C:\Coding` root | Runner test shells `ecothrift-test-r038`, `-r049` (only a `node_modules` junction each) | Remove the junctions with non-recursive `rmdir`, then the empty folders; `git worktree prune`. The permission gate blocked it this session, so Bill runs it | S | — | done 2026-09-30 (Bill ran it; node_modules intact) | n |
| T48 | Worktrees (D7, D8) | Worktrees in `_worktrees`, no env copies, removed after use | `runner.md` used a fixed `C:\Coding\ecothrift-test` with a copied `.env` and no teardown | Per-run `_worktrees\ecothrift-dashboard--r<NNN>`, `.env` hard link, teardown step 6 (junction `rmdir`, worktree remove, prune), SHA in the result. Redundant `archive/runner-*` branches deleted (same commits as `refs/runner/R-038`, `R-049`, `R-080`) | S | — | done 2026-09-30 | n |

Status: `open` · `doing` · `done YYYY-MM-DD` · `blocked (why)` · `waiting on master`

## Deviation requests

| # | Standard | What this repo does instead | Why it is truly different | Master decision |
|---|----------|-----------------------------|---------------------------|-----------------|
| DR1 | scripts-and-env.md `scripts/dev/` | Extra starters: `start_dashboard.bat`, `start_mobile_dashboard.bat`, `start_website.bat`, `lean_test.py` | Two front ends plus the phone scanner need different stacks | approved 2026-09-30 |
| DR2 | ai-folder.md `comm/` | `comm/RUNNING-NOW.md` while a long job runs | A multi-day local job needs a "don't touch" note every session sees | approved 2026-09-30 |
| DR4 | D8: production keys never in `.env` | Local `.env` uses the shared production keys | Bill: one set of keys | superseded by D10 (2026-09-30) |
| DR3 | protocols.md ship | Root `package.json` `version` mirrors `.version` | Heroku builds from the root `package.json` | approved 2026-09-30 |

## Log

- 2026-09-30 — first review; plan sent to master. Bill's go-ahead for S rows came in the 2026-09-30 inbox.
- 2026-09-30 — D12 copy run on Bill's OK: 2,713 objects / 1,638.6 MB into `ecothrift-dashboard-files/prod/`, 0 failed; a re-run skips all 2,713. Nothing in `dashboard-basic` changed.
- 2026-09-30 — D10 adopted (T49, T50): local writes only `ecothrift/dev/`, local mail off. Prod prefix move (T34) and a per-app AWS user (T35) stay M in the production order.
- 2026-09-30 — check_comm v3 (master nudges) adopted; runner worktree fix (T48); T47 waiting on Bill.
- 2026-09-30 — master: M order approved (nothing on prod before 10-20; week of 10-26 T23 + T31 + T43; November T25–T30 + T33 after Dark Horse's pilot; early December Postgres 18 (needs T31); then T34). Every M item waits for Bill's confirmation in master's chat. `MS_GRAPH_ENABLED=False` set locally. Bucket CORS is master's (house policy adds Eco origins).
- 2026-09-30 — Bill: `.envprod` pulled; no dev keys (DR4); M rows delegated to coder + master — proposed schedule in the outbox (all after launch).
- 2026-09-30 — master answered (Q1, Q2 accepted; DR1–DR3 approved; worktrees handled) and handed down D8 env-sync. All S rows done except T46 (needs Bill's ask). Result sent.
