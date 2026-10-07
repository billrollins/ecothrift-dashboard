<!-- Last updated: 2026-10-07 (hiring Phase 5, Applicants timeline, read-before-send shipped) -->
# ecothrift-dashboard — AI Context

## Project summary

Full-stack business management for Eco-Thrift, a thrift store in Omaha, NE. It covers:
- HR: time clock, kiosk, sick leave
- inventory: vendors, POs, item processing, product intelligence
- POS: registers, drawers, carts, receipts
- Thrift+ member rewards, consignment, and buying (B-Stock)
- the public storefront and Online Sales
- restoration (TARS), routines and Retail QA
- the data platform (Requests center, AI brief, local warehouse)

Stack: Django 5.2 + DRF, React 18.3 + TypeScript + MUI 7, PostgreSQL (schema `ecothrift` on the shared add-on). Runs on Heroku app `ecothrift-dashboard` (`dash.ecothrift.us`, public site `ecothrift.us`). Tier: core (house standards: `C:\Coding\.ai\standards\projects.md`).

## Release and version

- Current version: [`.version`](../.version). Never restate the semver here.
- What shipped and what's pending: [`CHANGELOG.md`](../CHANGELOG.md) (`[Unreleased]` + dated sections). Prod shows `.version` at `GET /api/core/system/version/` and in the sidebar footer.
- **Ship** (GitHub): [`protocols/ship.md`](protocols/ship.md). **Deploy** (Heroku): [`protocols/deploy.md`](protocols/deploy.md). The coder runs every command; the owner only gives the word. Print server exe: [`protocols/ship-print-server.md`](protocols/ship-print-server.md) (its own `VERSION` in `printserver/config.py`).
- Release timing: each phase ships on its own, when the owner orders it (dates in [`calendar.md`](calendar.md)). Between ships every change goes under `[Unreleased]` and nobody bumps `.version`.

## Active work

- **Calendar:** [`calendar.md`](calendar.md). Read it every session. Thrift+ launches Tue 2026-10-20, and every project piece is done by Thu 10-15.
- **Compass — Thrift+ Rewards:** [`thrift_plus_rewards`](initiatives/thrift_plus_rewards.md). Ships dark behind a switch until launch. Launch kit: [`thrift_plus_launch_kit`](initiatives/thrift_plus_launch_kit.md).
- **Data platform and the AI supervisor:** [`data_platform`](initiatives/data_platform.md). This is the owner's priority besides Thrift+.
- **Product intelligence:** [`product_intelligence`](initiatives/product_intelligence.md). Standardize and dedupe rules: [`extended/product-standard.md`](extended/product-standard.md).
- **Data quality and rails:** [`data_quality_rails`](initiatives/data_quality_rails.md).
- **Waiting:** [`buying_intelligence_v2`](initiatives/buying_intelligence_v2.md) resumes after launch. Earlier buying work is in [`bstock_daily_buying`](initiatives/bstock_daily_buying.md).
- **Inventory effort:** [`inventory_effort`](initiatives/inventory_effort.md). After the first full count: one inventory across days, PR Fix-it one-scan fixes, shrink worklist, inventory report, "If it all sells" orders view, data quality. The owner's operations priority.
- **Hiring and onboarding:** [`hiring_onboarding`](initiatives/hiring_onboarding.md). Jobs on ecothrift.us, applications, interviews, offers, onboarding and 30/60/90 check-ins, all run from Dash. Shipped: Phase 1 (careers page, apply, People → Applicants; live since 10-06), Phase 2 (interviews), Phase 3 (offers signed with a finger) and practice runs. Phase 4 (onboarding: checklist, I-9, handbook) and staff purchases (payroll deduction, staff Thrift+; off at first) shipped in v2.146.0. Phase 5 (check-ins), the Applicants timeline (phone-first) and read-before-send for hiring emails are shipped. Next: Phase 6 texts, when its gates clear. Built in its own worktree beside the inventory work (its Concurrent plan).
- **Intake updates:** [`intake_updates`](initiatives/intake_updates.md). The owner's intake list: Orders numbers, order modal, one Target vendor, AI formulas on upload, vendor metrics.
- **Inventory count:** [`inventory_count`](initiatives/inventory_count.md). Shipped 2026-10-01; first real count Mon 10-05.
- **Standing:** [`standards`](initiatives/standards.md), what this repo still owes the house standards, and when.
- Full list with phases: [`initiatives/_index.md`](initiatives/_index.md).

### Two coders

Two coders can share this repo. Each one has one peer inbox, `comm/inbox-<slug>.md`. The rules for it are in [`protocols/check_comm.md`](protocols/check_comm.md). **The post office is always the main checkout's `C:\Coding\ecothrift-dashboard\.ai\comm\`**, whatever tree you work in.

| Slug | Owns | Workspace | Runner IDs |
|------|------|-----------|------------|
| `data_platform` | Thrift+ core (members, cards, reward engine, POS, returns, signup), the Requests center, the data platform and AI brief, buying | main checkout | R-071 to R-099 |
| `thrift_scanner` | **Retired 2026-09-30** (the owner turned that coder off). Its lane, the Thrift+ customer scanner (`/scan`), is now worked from the main session | worktree `C:\Coding\_worktrees\ecothrift-dashboard--thrift-scanner` (branch `thrift-scanner-mock`) | R-100 and up |
| `hiring` | **Opened 2026-10-06.** [`hiring_onboarding`](initiatives/hiring_onboarding.md): `apps/hiring`, `/careers`, the People workspace. Runs beside the inventory session (main checkout). Dev ports 8010 / 5185 / 5184 (5183 is another project's), test DB `DATABASE_NAME=hiring_gate` | worktree `C:\Coding\_worktrees\ecothrift-dashboard--hiring` (branch `hiring`) | - |
| `standards` (was `tech_target`) | **Closed 2026-10-02** (the owner ended the Helper session). Everything it owned is the main coder's now: the count app, PR Fix-it, AI cleanup job, public legal pages, the scanner lane, `standards.md` and master's mail. Handoff: [`reference/reports/2026-10-02-helper-handoff.md`](reference/reports/2026-10-02-helper-handoff.md) | - | - |

- **Never share a working tree.** `scripts/deploy/ship.bat` stages everything (`git add -A`), so it would commit the other coder's half-done work.
- **Before every push:** `git fetch origin`, merge `origin/main`, and bump past the newest version on `main`. Never force-push. Ship a tested snapshot from a worktree when the main tree holds later phases ([`ship.md`](protocols/ship.md) Project steps).
- **Stay in your lane.** Touch another coder's files only through a message in its inbox. In [`calendar.md`](calendar.md), update only the Status cell of your own items.

## Guardrails

- Do not commit, push, or deploy unless the user explicitly orders it.
- If [`comm/RUNNING-NOW.md`](comm/RUNNING-NOW.md) exists, obey it. A long job on the local DB is running.
- **Production data:** routine data operations in prod go through `stage_request`, and the owner approves them in Dash → Requests. Never pull production into local, or run prod one-offs, without the user's order.
- **Data:** read the Eras and Standing decisions in [`extended/data-quality.md`](extended/data-quality.md) before building on data. Every build names the register IDs it touches and the fill-ins it uses. Work with imperfect data (flag it) rather than drop it. `$0` often means unknown.
- **Discounts:** read [`extended/discount-logic.md`](extended/discount-logic.md) before adding or changing any price change at the register. Key rules:
  - Thrift+ true price = tag − reward.
  - Percents scale both.
  - No stacking.
  - Bank 1.05×.
- **Legal guide for Thrift+ and what we sell:** [`extended/thrift-plus-legal-memo.md`](extended/thrift-plus-legal-memo.md), accepted by the owner's CPA and attorney (2026-10-01). Follow it by default. What the store sells:
  - Graphic 18+ adult items (resembling genitalia) are kept separate and out of view.
  - 18+ as a store rule is fine for non-nicotine vapes, knives and crossbows.
  - Never sell graphic sex or porn media, tobacco or nicotine products, or actual guns.
  - Never add an ID scanner that stores data.
- **Categories:** [`extended/product-taxonomy.md`](extended/product-taxonomy.md) is the one answer key. A questioned placement is settled with a TAX-NN ruling there.
- **Runner:** tests, recon and small chores can go to a runner agent via [`protocols/runner.md`](protocols/runner.md) and [`comm/runner/`](comm/runner/) (`queue.md`, live `tasks/` and `results/`, `baseline.md` = known failures; kept results go to `reference/reports/`). Targeted tests: `python scripts/dev/lean_test.py <area>`.
- Substantial work maps to a named initiative. If that's unclear, ask. Never archive an initiative without the user's approval.
- Don't create documentation files unless asked. The exceptions are this compass, initiatives and `extended/` files the work changes.
- When a domain changes, update its `extended/` file. When you add an env key, add it to `.env` / `.envprod` and to the table in [`extended/development.md`](extended/development.md). Stamp edited docs `<!-- Last updated: YYYY-MM-DD -->` (America/Chicago).
- Never put secrets or `.env` values in `.ai/`, comm files, commits or chat. Never invent credentials.

## Environment

- Windows + PowerShell (`;` not `&&`).
- Python: `venv\` at the repo root (3.12, `.python-version`; this PC also has 3.14 as `py`). Node: `engines` 22.x (this PC runs 24.19 since 2026-09-30).
- Dev ports: Django `8000`, staff Vite `5173`, public Vite `5174` (registered in `C:\Coding\.ai\standards\projects.md`). `scripts\dev\start.bat` / `kill.bat`.
- Database: local `local_shared`, schema `ecothrift` (`search_path` set in settings). V1/V2 archives: [`extended/databases.md`](extended/databases.md).
- Env files (house D8): `.env` (local values) and `.envprod` (mirror of Heroku Config Vars), both at the repo root and gitignored. No other env files. Production keys never go into `.env`. Sync with the house env-sync tool in `scripts\env\` via [`protocols/env-sync.md`](protocols/env-sync.md). Names are listed in [`extended/development.md`](extended/development.md), never values.
- Dev and prod (house D10): local uses the same keys as production but writes only `dashboard-basic/ecothrift/dev/` (`ENVIRONMENT=dev`, `AWS_LOCATION=ecothrift/dev`). Production images copied into the local DB don't load locally (they sit at the bucket root). Local mail is off (`MS_GRAPH_ENABLED=False`).
- Scratch, logs, test output, DB dumps: `workspace/` (gitignored). Nothing outside the repo.

## Deviations from house standard

The approved list is in [`initiatives/standards.md`](initiatives/standards.md) § Deviations. It is kept only there.

## Extended docs

Load on demand. Do not read them all at session start. When you add, rename or remove a file in `extended/`, update this table.

| File | Load when |
|------|-----------|
| [`app-map.md`](extended/app-map.md) | Staff nav, workspaces and pages in one map (hand to a UX / nav review) |
| [`auth-and-roles.md`](extended/auth-and-roles.md) | JWT flow, roles, permissions, password flows |
| [`backend.md`](extended/backend.md) | Django apps, models, serializers, API patterns |
| [`backfill-plan.md`](extended/backfill-plan.md) | Cleaning or backfilling a field (rules in `warehouse/sql/`, models in `factory/`) |
| [`brand.md`](extended/brand.md) | Staff colours, same-colour-same-meaning, token files |
| [`bstock.md`](extended/bstock.md) | B-Stock API, scraper, SOCKS5 |
| [`cash-management.md`](extended/cash-management.md) | Drops, pickups, drawer reconciliation, safe |
| [`consignment.md`](extended/consignment.md) | Agreements, items, payouts, portal |
| [`data-quality.md`](extended/data-quality.md) | Any build on historical data: register, eras, fill-ins, rails |
| [`databases.md`](extended/databases.md) | V1/V2/V3, `search_path`, `.env` DB keys, the prod → local pull |
| [`development.md`](extended/development.md) | Setup, starters, env names, logging, Scheduler, Graph mail |
| [`discount-logic.md`](extended/discount-logic.md) | Any register price change: rewards, sales, BOGO, banking, returns |
| [`documents.md`](extended/documents.md) | PDF upload, field placement, signing wizard, flatten |
| [`frontend.md`](extended/frontend.md) | React + MUI, pages, routing, React Query, hidden UI |
| [`heroku-memory.md`](extended/heroku-memory.md) | Heroku memory checks after a deploy that touches pagination, Gunicorn or caching |
| [`hiring.md`](extended/hiring.md) | Careers page, applications, People → Applicants / Jobs / Interviews / Emails, the careers file, hiring mail and rules, read-before-send, offers, practice runs, onboarding, check-ins, test data |
| [`inventory-pipeline.md`](extended/inventory-pipeline.md) | PO processing, M3, preprocessing, Item Processor |
| [`thrift-plus-decisions.md`](extended/thrift-plus-decisions.md) | **Read first for any Thrift+ rule:** the owner's final answers (returns at 90%, Thrift+ Balance replaces banked rewards, tax, wording, signup). Wins over older notes |
| [`thrift-plus-limited-warranty.md`](extended/thrift-plus-limited-warranty.md) | Member returns, Poster C, AS IS signs, receipt warranty lines, the terms (the Limited Warranty text to use) |
| [`thrift-plus-legal-memo.md`](extended/thrift-plus-legal-memo.md) | Thrift+ and IDs, photos, privacy, 18+ items, returns, store credit, sales tax, advertising (AI research for the attorney, with a design-impact digest) |
| [`known-issues.md`](extended/known-issues.md) | Known issues and live gaps (check before a ship) |
| [`pos-system.md`](extended/pos-system.md) | Registers, drawers, carts, terminal, receipts |
| [`print-server.md`](extended/print-server.md) | Local FastAPI: labels, receipts, drawer kick |
| [`inventory-search.md`](extended/inventory-search.md) | Inventory search, the product / check-in / item modals, when to use a modal, page, tabs or drawer |
| [`product-standard.md`](extended/product-standard.md) | What every product must look like; standardize and dedupe |
| [`product-taxonomy.md`](extended/product-taxonomy.md) | Category, subcategory, price-tag short name (TAX rulings) |
| [`restoration.md`](extended/restoration.md) | TARS: RestorationJob, queue, bench, scoreboard |
| [`routines.md`](extended/routines.md) | Periodic / on-demand forms, pooled runs, nag, Retail QA grading |
| [`ux-spec.md`](extended/ux-spec.md) | Colour, typography, spacing, house UI rules |
| [`vpn-socks5.md`](extended/vpn-socks5.md) | PIA SOCKS5 setup and diagnostics |
| [`sql/README.md`](extended/sql/README.md) | `schema.csv`, `cli.md`, and how to run the SQL tools in `scripts/sql/` |

## Quick reference

| Need | Where |
|------|-------|
| Start a session | [`protocols/startup.md`](protocols/startup.md) |
| Messages from master / the other coder | [`protocols/check_comm.md`](protocols/check_comm.md) |
| Standards review | [`protocols/standards-review.md`](protocols/standards-review.md) → [`initiatives/standards.md`](initiatives/standards.md) |
| New / review initiatives | [`protocols/initiative-create.md`](protocols/initiative-create.md), [`protocols/initiative-review.md`](protocols/initiative-review.md) |
| Ship / deploy | [`protocols/ship.md`](protocols/ship.md), [`protocols/deploy.md`](protocols/deploy.md) |
| Ship print server (project-only) | [`protocols/ship-print-server.md`](protocols/ship-print-server.md) |
| Runner: tests, recon, chores (project-only) | [`protocols/runner.md`](protocols/runner.md) |
| Clean-up (project-only) | [`protocols/clean-up.md`](protocols/clean-up.md) |
| Env sync: pull / diff / push env, add a key | [`protocols/env-sync.md`](protocols/env-sync.md) (`scripts\env\`) |
| Dev servers | `scripts\dev\start.bat`, `scripts\dev\kill.bat`; variants `start_dashboard.bat` (staff, plain HTTP), `start_mobile_dashboard.bat` (phone HTTPS), `start_website.bat` (public) |
| DB backup / prod → local pull | `scripts\db\backup_prod.bat`, `scripts\db\pull_prod_to_local.bat` (schema `ecothrift` only) |
| Schema snapshot | [`extended/sql/README.md`](extended/sql/README.md) |
