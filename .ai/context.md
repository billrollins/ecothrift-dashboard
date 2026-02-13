<!-- Last updated: 2026-02-13T21:00:00-06:00 -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Eco-Thrift Dashboard is a full-stack business management application for a thrift store in Omaha, NE. It covers HR (time clock, sick leave), inventory (vendors, purchase orders, item processing), point-of-sale (registers, drawers, carts, receipts), consignment (agreements, payouts), and an admin dashboard. Built with Django 5.2 + DRF on the backend and React 19 + TypeScript + MUI v7 on the frontend. PostgreSQL database. Deployed to Heroku.

**Current version:** 1.2.0 (see `.ai/version.json`)

---

## File Map

```
ecothrift-dashboard/
├── ecothrift/              Django project settings and root URLs
├── apps/
│   ├── accounts/           Users, profiles, auth, permissions
│   ├── core/               Locations, app settings, S3 files, print server
│   ├── hr/                 Time clock, departments, sick leave
│   ├── inventory/          Vendors, POs, products, items, processing
│   ├── pos/                Registers, drawers, carts, receipts, cash mgmt
│   └── consignment/        Agreements, consignment items, payouts
├── frontend/src/
│   ├── api/                Axios service functions (one per backend app)
│   ├── components/         Layout, common, feedback, forms
│   ├── contexts/           AuthContext (JWT in-memory)
│   ├── hooks/              React Query hooks (one per domain)
│   ├── pages/              Route-level page components (24 total)
│   ├── services/           Local print server client
│   ├── theme/              MUI theme config
│   ├── types/              TypeScript interfaces (one per backend app)
│   ├── App.tsx             Router + route guards
│   └── main.tsx            Entry point + providers
├── docs/                   Code documentation (architecture, models, API, routes, dev guide)
├── .ai/                    AI context, versioning, procedures (this folder)
├── workspace/              Personal scripts, notebooks, notes (gitignored)
├── project design/         Original build specification (historical reference)
├── requirements.txt        Python dependencies
├── .env                    Local environment variables (gitignored)
└── .gitignore
```

---

## Current State

### Working
- All 6 backend apps with models, serializers, views, URLs, admin
- 28+ frontend pages rendering and connected to API
- JWT auth with httpOnly cookie refresh + in-memory access token
- Database migrations and seed data command
- TypeScript compiles with zero errors
- Vite production build succeeds
- Full CRUD across Users, Employees, Consignees, Customers, Vendors, Orders, Items, Products
- Purchase Order management: 6-step status workflow (ordered→paid→shipped→delivered→processing→complete) with action buttons and undo
- PO cost breakdown (purchase_cost + shipping_cost + fees = total_cost), retail value, condition, description
- CSV manifest upload to S3 with persisted preview and download link
- Editable order number (auto-generated PO-XXXXX or user-provided)
- Multi-role user model (User can be Employee + Consignee + Customer simultaneously)
- Employee termination workflow with termination type, date, and notes
- Consignee account management (create from existing or new user, profile editing)
- Consignment agreements per drop-off with default commission/terms
- Customer management with POS customer association via scan
- Admin password reset (generates temporary password)
- Forgot password flow (stubbed token — no email delivery yet)
- Phone number formatting across UI
- Time entry modification requests (employee submit, manager approve/deny)
- DataGrid action columns vertically centered across all pages

### Known Issues
- Recharts ResponsiveContainer may log a width/height warning on initial render (cosmetic, does not affect functionality)
- Large JS bundle (~1.7MB) — could benefit from code splitting via lazy routes

### Not Yet Implemented
- Processing workflow (what happens after manifest upload — item creation UX, batch processing)
- Print server communication (service exists, no print server deployed)
- Email notifications (forgot-password tokens are returned in response, not emailed)
- Test suite (no unit or integration tests yet)
- Heroku deployment (config exists, not yet deployed)

---

## AI Guidelines

1. **Do NOT commit or deploy** unless explicitly told to do so.
2. **Do NOT push to remote** unless explicitly told to do so.
3. **Do NOT create documentation files** unless asked.
4. **Do NOT amend commits** unless the conditions in the system prompt are met.
5. **Use timestamps** (ISO 8601, America/Chicago timezone) on all documentation updates.
6. **Read `extended/TOC.md`** for deeper context, but only load specific files as needed — do not read all extended files at once.
7. **Follow procedures** in `.ai/procedures/` for specific workflows (startup, review, handoff, commit, deploy).
8. **Verify before changing** — read files before editing, check lints after editing.
9. **Use the workspace/** folder for any scratch files, test scripts, or notebooks.

---

## How to Maintain Project Docs

### Documentation lives in two places:

1. **`docs/`** — Code documentation. Architecture, data models, API reference, frontend routes, development guide. These describe *what the code does*.
2. **`.ai/`** — AI context. Project state, versioning, procedures. These describe *how to work on the code*.

### Maintenance rules:

- When you change backend models, update `docs/data-models.md` and `.ai/extended/backend.md`.
- When you add/change API endpoints, update `docs/api-reference.md`.
- When you add/change routes or pages, update `docs/frontend-routes.md`.
- When you change auth or permissions, update `.ai/extended/auth-and-roles.md`.
- When releasing a new version, bump `.ai/version.json`, add entry to `.ai/changelog.md`.
- Always update the `<!-- Last updated: ... -->` timestamp at the top of any file you modify.
- Update `.ai/extended/TOC.md` last-updated column when you edit any extended file.
- Review docs freshness periodically using `.ai/procedures/review.md`.

---

## Quick Reference

| Need | Where |
|------|-------|
| Tech stack and architecture | `docs/architecture.md` |
| Database schema | `docs/data-models.md` |
| API endpoints | `docs/api-reference.md` |
| Frontend routes and pages | `docs/frontend-routes.md` |
| Setup and dev guide | `docs/development.md` |
| Current version | `.ai/version.json` |
| Version history | `.ai/changelog.md` |
| Deep-dive context | `.ai/extended/TOC.md` → individual files |
| Procedures | `.ai/procedures/startup.md`, `review.md`, etc. |
| Scripts and notebooks | `workspace/scripts/`, `workspace/notebooks/` |
