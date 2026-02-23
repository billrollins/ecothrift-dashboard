<!-- Last updated: 2026-02-21T18:00:00-06:00 -->
# Eco-Thrift Dashboard — AI Context

## Project Summary

Eco-Thrift Dashboard is a full-stack business management application for a thrift store in Omaha, NE. It covers HR (time clock, sick leave), inventory (vendors, purchase orders, item processing), point-of-sale (registers, drawers, carts, receipts), consignment (agreements, payouts), and an admin dashboard. Built with Django 5.2 + DRF on the backend and React 18.3 + TypeScript + MUI v7 on the frontend. PostgreSQL database. Deployed to Heroku.

**Current version:** 1.7.0 (see `.ai/version.json`)

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
│   ├── pages/              Route-level page components
│   ├── services/           Local print server client
│   ├── theme/              MUI theme config
│   ├── types/              TypeScript interfaces (one per backend app)
│   ├── App.tsx             Router + route guards
│   └── main.tsx            Entry point + providers
├── docs/                   Code documentation (architecture, models, API, routes, dev guide)
├── .ai/                    AI context, versioning, procedures (this folder)
│   └── prototype/          Design prototypes and archived explorations
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
- Inventory processing direction finalized: **M3 (Universal Items + Smart Batch)** — all units are Items, batches accelerate processing
- M3 workflow implementation shipped: `process-manifest` (full CSV parsing), `manifest-rows`, `match-products`, `create-items`, `mark-complete`
- Standard Manifest preprocessing UI shipped: standard-column mapping, function chains, preview, and **Standardize Manifest** primary action
- Pre-arrival pricing shipped on manifest rows (`proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`) with bulk save endpoint
- Arrival check-in workflow shipped: bulk order check-in, single item check-in, batch check-in, and label printing integration in the Processing workspace
- Processing page now centers on finalize fields -> check in -> print tags, with batch detach as a secondary exception action
- Order reset tooling shipped: order detail now includes **Delete Order** modal with reverse-sequence artifact preview + guarded purge action (`confirm_order_number`)
- Standard Manifest UX now includes 3-step accordion flow (Upload -> Raw Sample -> Standardize) with multi-open sections
- Raw and standardized preview search shipped: searches full manifest/normalized set server-side and returns top 100 rows for preview
- Sidebar navigation updated so Inventory and POS behave as grouped/collapsible sections (same pattern as HR)
- **AI Integration**: `apps/ai/` Django app proxies Anthropic Claude API (`claude-sonnet-4-6`, `claude-haiku-4-5`). Frontend `ModelSelector` component, `useAI` hooks, `ai.api.ts` service layer.
- **Expression-Based Formula Engine**: `apps/inventory/formula_engine.py` parses `[COLUMN]` refs, functions (UPPER, LOWER, TITLE, TRIM, REPLACE, CONCAT, LEFT, RIGHT), string concatenation, and literals. Backward compatible with legacy source+transforms mappings.
- **AI Row Cleanup Pipeline**: `ai-cleanup-rows` endpoint processes manifest rows through Claude for title/brand/model/specs suggestions. Frontend-driven concurrent batch processing with configurable batch size (5/10/25/50) and thread count (1/4/8/16). Pause/resume/cancel with localStorage persistence.
- **Expandable Row Detail Panels**: Cleanup table rows expand to show side-by-side "Original Manifest Data" vs "AI Suggestions" with change highlighting, specs key-value grid, and AI reasoning block.
- **Standalone Preprocessing Page** at `/inventory/preprocessing/:id` with own sidebar nav entry, 4-step chip stepper (Standardize Manifest → AI Cleanup → Product Matching → Pricing). Legacy route `/inventory/orders/:id/preprocess` redirects. FinalizePanel paginated (50 rows/page) to avoid main-thread freeze with large manifests.
- **Product Matching Engine**: Fuzzy scoring (UPC, VendorRef, text similarity) + AI batch decisions. `ManifestRow` extended with `match_candidates`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_title/brand/model`, `search_tags`, `specifications`, `condition`, `batch_flag`.
- **Preprocessing Undo System**: Every step has a working undo with cascade. `deriveCompletedStep()` is the single source of truth. Undo Step 1 deletes rows (blocked if Items exist); Undo Step 2 clears AI fields + cascades to clear matching; Undo Step 3 clears matching; Undo Step 4 resets pricing.
- **6-State Step 1 Button Logic**: Standardize step tracks formula state (clear/partial/ready/done/edited/edited_partial) with two separate button rows — primary actions (Standardize/Re-standardize/Undo) and formula-level actions (Clear/Cancel/Use AI).
- **Breadcrumb-Driven Navigation**: All "Next Step" / "Continue" / "Confirm" buttons removed from preprocessing steps. Navigation is via breadcrumb chips with 4 visual states (selected/done/ready/notReady). "Complete Preprocessing" button is inline in breadcrumb row.
- **Shared Formatting Utilities**: `formatCurrencyWhole`, `formatCurrency`, `formatNumber` in `frontend/src/utils/format.ts` for consistent dollar/count display.
- **Auto-Build Check-In Queue**: `deliver` endpoint automatically creates Items + BatchGroups when manifest rows exist, eliminating the manual "Build Check-In Queue" step.
- `OrderDetailPage` simplified: all nav buttons merged into PageHeader (Back/Preprocessing/Processing/Delete), Go To card removed
- `OrderListPage` enhanced: Actions column first with header, row-level Preprocessing/Processing icon buttons
- Pre-arrival pricing redesigned: no mode toggle, always-editable table, auto-save on Apply All / Clear All / field blur, `retail_value` mapping enforced as required at standardization
- Alternative inventory prototypes archived under `.ai/prototype/archive/`
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
- **Concurrent AI cleanup needs testing/hardening**: The concurrent batch processing (16 threads x 5 rows) was just implemented. The user reported "there's a lot wrong" but did not specify what. The next session should test the concurrent cleanup flow end-to-end and fix any issues. Possible problems: race conditions in offset assignment, duplicate row processing, error handling when multiple workers fail, progress counter accuracy.
- **`anthropic` package must be installed in venv**: `pip install anthropic` in the venv. The import is lazy (won't crash server if missing) but AI features won't work without it.
- Recharts ResponsiveContainer may log a width/height warning on initial render (cosmetic, does not affect functionality)
- Large JS bundle (~1.7MB) — could benefit from code splitting via lazy routes
- POS cash completion path should be hardened for malformed numeric payloads (e.g., `change_given` string coercion edge cases)

### Not Yet Implemented
- Print server communication (service exists, no print server deployed)
- Email notifications (forgot-password tokens are returned in response, not emailed)
- Test suite (no unit or integration tests yet)
- Heroku deployment (config exists, not yet deployed)

### Pending (Next Coder Focus)
- **Processing page UX rework.** Now that preprocessing is stable with full undo support, the Processing page (check-in workflow) needs its own UX pass.
- **End-to-end testing.** Full pipeline: Order page (upload manifest) → Preprocessing page (standardize → AI cleanup → product matching → pricing → complete) → Processing page (check-in items). Exercise all undo paths.
- **Print server integration testing.** Label printing during check-in needs a deployed print server.
- Phases 6-9 of the original AI rework plan (in `workspace/notes/prompt creator.md`) still have unfinished work: App Separation cleanup.

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
