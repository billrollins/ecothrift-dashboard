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
  │  React 19  ·  TypeScript  ·  MUI v7  ·  Vite  ·  Recharts  │
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
├── apps/                6 Django apps (accounts, core, hr, inventory, pos, consignment)
├── ecothrift/           Django project settings
├── frontend/            React + TypeScript + MUI
├── docs/                Code documentation
├── .ai/                 AI context, versioning, procedures
└── workspace/           Scripts, notebooks, notes (gitignored)
```

---

<p align="center">
  <b>Eco-Thrift Dashboard v1.0.0</b><br/>
  <i>Reduce. Reuse. Run a tight ship.</i>
</p>
