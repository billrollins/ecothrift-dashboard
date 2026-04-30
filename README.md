<!-- Last updated: 2026-04-30T12:00:00-05:00 (B-Stock initiative link → archived) -->
```
                    ╔═══════════════════════════════════════════════════════════╗
                    ║                                                           ║
                    ║     ███████╗ ██████╗ ██████╗ ████████╗██╗  ██╗██████╗     ║
                    ║     ██╔════╝██╔════╝██╔═══██╗╚══██╔══╝██║  ██║██╔══██╗    ║
                    ║     █████╗  ██║     ██║   ██║   ██║   ███████║██████╔╝    ║
                    ║     ██╔══╝  ██║     ██║   ██║   ██║   ██╔══██║██╔══██╗    ║
                    ║     ███████╗╚██████╗╚██████╔╝   ██║   ██║  ██║██║  ██║    ║
                    ║     ╚══════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝    ║
                    ║                                                           ║
                    ║            D  A  S  H  B  O  A  R  D                      ║
                    ║                                                           ║
                    ╚═══════════════════════════════════════════════════════════╝
```

> **One app to run the whole store.**

---

### What is this?

A full-stack business management system for **Eco-Thrift** — the thrift store that
actually has its stuff together. HR, inventory, point-of-sale, consignment, cash
management, and a dashboard that tells you exactly how the day is going.

Built different. Built fast. Built to last.

---

### The Stack

```
  ┌─────────────────────────────────────────────────────────────┐
  │  FRONTEND                                                   │
  │  React 18  ·  TypeScript  ·  MUI v7  ·  Vite  ·  Recharts   │
  │  TanStack Query  ·  React Hook Form  ·  React Router        │
  └──────────────────────────┬──────────────────────────────────┘
                             │  REST API + JWT
  ┌──────────────────────────┴──────────────────────────────────┐
  │  BACKEND                                                    │
  │  Django 5.2  ·  DRF  ·  PostgreSQL  ·  SimpleJWT            │
  │  WhiteNoise  ·  Gunicorn  ·  Heroku                         │
  └─────────────────────────────────────────────────────────────┘
```

---

### What it Does

```
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │    HR    │  │INVENTORY │  │   POS    │  │CONSIGN-  │  │  ADMIN   │
  │          │  │          │  │          │  │  MENT    │  │          │
  │ Clock In │  │ Vendors  │  │ Terminal │  │ Accounts │  │ Users    │
  │ Clock Out│  │ Orders   │  │ Drawers  │  │ Items    │  │ Roles    │
  │ Sick Pay │  │ Items    │  │ Cash Mgmt│  │ Payouts  │  │ Settings │
  │ History  │  │ Products │  │ Receipts │  │ Portal   │  │ Metrics  │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

### The Highlights

```
  ✦  EMAIL-ONLY AUTH         No usernames. Just email + password. Clean.
  ✦  HTTPONLY JWT             Access token in memory. Refresh in a cookie.
                              No localStorage nonsense.
  ✦  ROLE-BASED ACCESS       Admin · Manager · Employee · Consignee
                              Each sees exactly what they need.
  ✦  DENOMINATION TRACKING   Every cash operation counts bills and coins.
                              Down to the penny. Every time.
  ✦  REAL-TIME DASHBOARD     Today's revenue vs goal. Weekly chart.
                              4-week comparison. Who's clocked in.
  ✦  CONSIGNEE PORTAL        Consignees log in and see their own items,
                              payouts, and earnings. Self-service.
  ✦  BARCODE SCANNING        SKU lookup at the terminal. Scan it, sell it.
  ✦  CSV MANIFEST PIPELINE   Upload vendor spreadsheets → auto-parse →
                              create inventory items in bulk.
```

---

### AI steering & initiatives

| Doc | Purpose |
|-----|---------|
| [`.ai/context.md`](.ai/context.md) | Living **current state** (what works, known gaps). |
| [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) | **Active** initiatives table (may be empty; bounded work tracked as one `.md` each when listed). |
| [`.ai/initiatives/_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md) | **Archived** initiatives (completed, backlog, pending, abandoned). Example: [category intelligence](.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md) (Phases 0–7, 2026-04-06). |
| [`.ai/protocols/code.0.Startup.md`](.ai/protocols/code.0.Startup.md) | Session start: load context; **frame** the session (questions); **create session entry** in the initiative file. |
| [`.ai/protocols/session.0.Create.md`](.ai/protocols/session.0.Create.md) | Reserved placeholder (session-only protocol TBD; steps today live in `code.0.Startup.md`). |
| [`.ai/protocols/session.1.Checkpoint.md`](.ai/protocols/session.1.Checkpoint.md) | **During** the session (often ~5×): append session updates, keep **`CHANGELOG` `[Unreleased]`** and light docs in sync. |
| [`.ai/protocols/code.1.Bearing.md`](.ai/protocols/code.1.Bearing.md) | Mid-session when **stuck**: compare progress to the written session goal (compass check). |
| [`.ai/protocols/review.0.Bump.md`](.ai/protocols/review.0.Bump.md) | **Docs audit + semver + `CHANGELOG`** slice (optional **`commit_message.txt`** growth); **local** `git commit` — **no push** unless you ask. |
| [`.ai/protocols/code.9.Push.md`](.ai/protocols/code.9.Push.md) | **`review.0.Bump`** checklist + **full** **`commit_message.txt`** + **`scripts/deploy/2_push_github.bat`** (`git push origin main`). |
| [`.ai/protocols/review.9.Deep.md`](.ai/protocols/review.9.Deep.md) | Full repo/context audit; human-readable reports + `PLAN.md` under `.ai/reference/deep_dive/latest/`. |
| [`.ai/protocols/session.9.Close.md`](.ai/protocols/session.9.Close.md) | **End** of session: **`Result`**, scoped docs, version bump, commit message (includes keeping this README in sync). |

**Notebook research:** [`.ai/extended/development.md`](.ai/extended/development.md) (*Jupyter*); category work under **`workspace/notebooks/category-research/`** (**`category_research.ipynb`**, **`categorize.ipynb`**, **`cr/`**). **B-Stock / buying:** archived initiative [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md); optional **`workspace/notebooks/bstock-scraper/Scraper/`** + **`examples/bstock_quickstart.ipynb`**. **Phases 4.1A–4.1B** (manifest templates, AI template + key mapping, upload progress UI, usage logging) shipped **v2.7.0** — see **`CHANGELOG`** **[2.7.0]**. **Phase 5** (auction valuation engine + category need/want APIs **v2.8.0**; React list/detail/category-need valuation UI **v2.9.0**) — **`CHANGELOG`** **[2.8.0]**, **[2.9.0]**. **Historical sell-through — PO extract** (local CSV under **`workspace/data/`**, **v2.7.1**): **`CHANGELOG`** **[2.7.1]**; archived initiative [`.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md`](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md); single-file handoff [`.ai/consultant_context.md`](.ai/consultant_context.md).

Detailed setup beyond **Quick Start** lives in [`.ai/extended/development.md`](.ai/extended/development.md).

---

### Quick Start

```bash
# Backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py setup_initial_data
python manage.py runserver

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173** and log in.

---

### Project Structure

```
ecothrift-dashboard/
├── apps/                Django apps (accounts, core, hr, inventory, pos, consignment, ai, buying)
├── ecothrift/           Django project package (settings, urls, wsgi)
├── manage.py            Django CLI entry (same tree = “backend” for local dev)
├── frontend/            React + TypeScript + MUI (Vite)
├── printserver/         Local print server source (FastAPI; Windows installer in-repo)
├── scripts/             Dev/deploy helpers (see `.ai/extended/development.md`)
├── .ai/                 AI/session context, protocols, extended domain notes (not runtime)
├── .version             App semver (single line)
├── CHANGELOG.md         Version history
├── package.json         Heroku heroku-postbuild → frontend build only
└── workspace/           Local scratch; **`workspace/data/`** holds only **`.gitkeep`** in git; tracked notebooks are **`.ipynb`**, **`.py`**, configs — see **`.ai/extended/development.md`**
```

**Print server:** Develop in `printserver/`. The Windows installer deploys under `%LOCALAPPDATA%\EcoThrift\PrintServer\` and, on **Install**, removes legacy V2 print-server folders/Startup hooks before laying down the new exe (see `printserver/installer/setup.py`).

---

<p align="center">
  <b>Eco-Thrift Dashboard</b> (see repo root <code>.version</code> for semver)<br/>
  <i>Reduce. Reuse. Run a tight ship.</i>
</p>
