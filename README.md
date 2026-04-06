<!-- Last updated: 2026-04-06T20:30:00-05:00 -->
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
| [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) | **Active** initiatives (bounded work tracked as one `.md` each). |
| [`.ai/initiatives/_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md) | **Archived** initiatives (completed, backlog, pending, abandoned). |
| [`.ai/protocols/review_bump.md`](.ai/protocols/review_bump.md) | Doc audit, version bump, pre-commit, handoff (includes keeping this README in sync). |

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
├── apps/                Django apps (accounts, core, hr, inventory, pos, consignment, ai)
├── ecothrift/           Django project package (settings, urls, wsgi)
├── manage.py            Django CLI entry (same tree = “backend” for local dev)
├── frontend/            React + TypeScript + MUI (Vite)
├── printserver/         Local print server source (FastAPI; Windows installer in-repo)
├── scripts/             Dev/deploy helpers (see `.ai/extended/development.md`)
├── .ai/                 AI/session context, protocols, extended domain notes (not runtime)
├── .version             App semver (single line)
├── CHANGELOG.md         Version history
├── package.json         Heroku heroku-postbuild → frontend build only
└── workspace/           Local scratch; only select files under workspace/notebooks/ (e.g. _shared/, db-explorer/, historical-data/, bstock-scraper/) may be tracked
```

**Print server:** Develop in `printserver/`. The Windows installer deploys under `%LOCALAPPDATA%\EcoThrift\PrintServer\` and, on **Install**, removes legacy V2 print-server folders/Startup hooks before laying down the new exe (see `printserver/installer/setup.py`).

---

<p align="center">
  <b>Eco-Thrift Dashboard</b> (see repo root <code>.version</code> for semver)<br/>
  <i>Reduce. Reuse. Run a tight ship.</i>
</p>
