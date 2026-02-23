<!-- Last updated: 2026-02-21T18:00:00-06:00 -->
# Changelog

All notable changes to this project are documented here at the **version level**.
Commit-level detail belongs in commit messages, not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.7.0] — 2026-02-21

### Added
- **Preprocessing Undo System**: Every preprocessing step has a working undo with cascade confirmation. `deriveCompletedStep()` is the single source of truth for step completion state. Backend endpoints: `undo-product-matching` (Step 3), `clear-pricing` (Step 4). `cancel-ai-cleanup` updated to cascade and also clear Step 3 matching fields.
- **6-State Step 1 Button Logic**: Standardize step derives state (clear/partial/ready/done/edited/edited_partial) from formula state and standardization status. Two separate button rows: primary actions (Standardize/Re-standardize/Undo) and formula-level actions (Clear Formulas/Cancel Edits/Use AI). Tracks formulas at standardization time via ref for edit detection.
- **Complete Preprocessing in Breadcrumbs**: "Complete Preprocessing" button rendered inline at end of breadcrumb chip row (visible when Step 4 active, all rows priced, not yet finalized).
- **Shared Formatting Utilities**: `formatCurrencyWhole` (commas, no decimals), `formatCurrency` (commas, 2 decimals), `formatNumber` (locale-formatted counts) in `frontend/src/utils/format.ts`. Applied across OrderListPage, OrderDetailPage, FinalizePanel.
- **Auto-Build Check-In Queue on Deliver**: `deliver` endpoint automatically creates Items + BatchGroups when manifest rows exist and no items exist. Eliminates manual "Build Check-In Queue" step for the standard flow. `create-items` endpoint preserved for edge cases (manifest processed after delivery).
- **Section Dividers**: `<Divider>` components between major sections in all 4 preprocessing step panels for visual clarity.

### Changed
- **Breadcrumb Navigation**: Removed all "Continue to..." / "Next Step" / "Confirm Products" navigation buttons from Steps 1-3. Navigation is exclusively via breadcrumb chips with 4 visual states (selected/done/ready/notReady with pulse animation). Accept All in Step 3 now also confirms/submits decisions.
- **OrderDetailPage**: All 4 action buttons (Back/Preprocessing/Processing/Delete) merged into PageHeader row. Separate "Go To" card removed.
- **OrderListPage**: Actions column moved to first position with 'Actions' header.
- **Step 2 Buttons**: Renamed (Run Cleanup, Pause Cleanup, Restart Cleanup, Cancel Cleanup, Clear Cleanup). Removed Re-run when done — only Clear shown.
- **Step 3 Accept All**: Only visible when undecided matched rows exist; shows count.
- **Step 4 renamed**: "Review & Finalize" → "Pricing" throughout.
- **Preview Empty State**: Changed from "Click Preview Standardization" to "Preview will appear when formulas are applied."
- **ConfigurablePageSizePagination**: Custom DRF pagination class allows client to specify `page_size`.

### Fixed
- Processing page "No rows" issue: broadened `queueNotBuilt` logic to always render queue sections when an order is selected.
- `deliver` endpoint now auto-creates items from manifest rows, preventing "Build Check-In Queue" friction.

---

## [1.6.0] — 2026-02-18

### Added
- **AI Integration Foundation** (`apps/ai/`): New Django app with `ChatProxyView` (POST `/api/ai/chat/`) and `ModelListView` (GET `/api/ai/models/`) proxying Anthropic Claude API. Models: `claude-sonnet-4-6`, `claude-haiku-4-5`.
- **Expression-Based Formula Engine** (`apps/inventory/formula_engine.py`): Full expression parser supporting `[COLUMN]` refs, functions (`UPPER`, `LOWER`, `TITLE`, `TRIM`, `REPLACE`, `CONCAT`, `LEFT`, `RIGHT`), `+` concatenation, and quoted string literals. Used by `normalize_row()` alongside legacy source+transforms path.
- **AI-Assisted Row Cleanup**: `POST /api/inventory/orders/:id/ai-cleanup-rows/` sends manifest rows to Claude in batches for title/brand/model/specs cleanup. Supports `batch_size` and `offset` for frontend-driven batch processing.
- **AI Cleanup Status & Cancel**: `GET ai-cleanup-status/` returns progress counts; `POST cancel-ai-cleanup/` clears all AI-generated fields.
- **Concurrent Batch Processing**: Frontend worker pool pattern — configurable batch size (5/10/25/50 rows) and concurrency (1/4/8/16 threads). Up to 16 simultaneous API requests for faster processing.
- **Expandable Row Detail Panels**: Cleanup table rows are expandable with chevron toggle. Expanded view shows side-by-side "Original Manifest Data" vs "AI Suggestions" cards with change highlighting, specifications key-value grid, and AI reasoning quote block. Multiple rows expandable simultaneously.
- **Standalone Preprocessing Page**: Moved from `/inventory/orders/:id/preprocess` to `/inventory/preprocessing/:id` with its own sidebar navigation entry. localStorage persistence of last preprocessed order ID. Legacy route redirects for backward compatibility.
- **Product Matching Engine**: Fuzzy scoring (UPC exact, VendorRef exact, text similarity) + AI batch decisions. New fields on `ManifestRow`: `match_candidates`, `ai_match_decision`, `ai_reasoning`, `ai_suggested_title/brand/model`. Endpoints: `match-products`, `review-matches`, `match-results`.
- **ManifestRow Extended Fields**: `title`, `condition`, `batch_flag`, `search_tags`, `specifications` (JSONField), plus all AI suggestion and match fields. Two new migrations applied.
- Frontend API layer: `ai.api.ts`, `useAI.ts` hooks, `ModelSelector` component, cleanup/status/cancel API functions and React Query hooks.
- `StandardManifestBuilder` reworked for expression text input with syntax highlighting and autocomplete.
- `RowProcessingPanel` with flat form layout: AI cleanup controls, rows table, product matching section, review decisions section.
- `FinalizePanel` with merged pricing controls.

### Changed
- Preprocessing stepper: 4 steps (Standardize Manifest → AI Cleanup → Product Matching → Review & Finalize)
- Manifest upload removed from preprocessing page (stays on Order page)
- `useStandardManifest` hook reworked to use `formulas: Record<string, string>` instead of rules-based state
- `MANIFEST_TARGET_FIELDS` and `MANIFEST_STANDARD_COLUMNS` updated with new fields
- Default batch size changed to 5 rows; default concurrency set to 16 threads

### Fixed
- Infinite re-render loop in `PreprocessingPage.tsx`: `useEffect` dependency on full `order` object replaced with scalar values (`orderVendorCode`, `orderPreviewTemplateName`); `rawManifestParams` useMemo dependency changed from object ref to boolean; `matchSummary` prop memoized with `useMemo`
- Step 4 (Review & Finalize) freeze: template name and step-derived effects guarded to prevent update-depth loop; FinalizePanel table paginated (50 rows/page) to avoid rendering 400+ rows and blocking main thread
- `anthropic` library lazy-imported in `apps/ai/views.py` to prevent `ModuleNotFoundError` at Django startup
- Outdated Claude model IDs replaced: `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6`, `claude-haiku-3-5-20241022` → `claude-haiku-4-5`
- `cancel_ai_cleanup` corrected from `specifications=dict` to `specifications={}`

---

## [1.5.0] — 2026-02-17

### Added
- `PreprocessingPage` at `/inventory/orders/:id/preprocess`: dedicated 3-step stepper wizard (Upload Manifest → Standardize Manifest → Set Prices) extracted from `OrderDetailPage`
- Route added in `App.tsx` for the new preprocessing page
- "Clear All" button in the pricing step to wipe all proposed prices and auto-save
- Warning `Alert` on Step 3 when any manifest rows are missing `retail_value`
- Auto-save on every pricing action (Apply to All, Clear All, individual field blur) with inline saving indicator

### Changed
- `OrderDetailPage` simplified: full preprocessing accordion block removed (~260 lines), replaced with a single "Open Preprocessing" CTA card
- Step 3 pricing UI redesigned: removed mode toggle, all price inputs always editable, no explicit Save Prices button
- `retail_value` mapping is now enforced as required at standardization — `handleStandardizeManifest` blocks with a warning snackbar if unmapped

### Fixed
- Infinite render loop in `PreprocessingPage`: `manualPrices` `useEffect` now uses stable `rowsKey` dependency (row IDs joined as string) instead of `manifestRows ?? []` which created a new array reference every render

---

## [Unreleased]

### Added
- Purchase order reset safety workflow:
  - `GET /api/inventory/orders/:id/delete-preview/`
  - `POST /api/inventory/orders/:id/purge-delete/` (requires order-number confirmation)
- Server-side search support for preprocessing previews:
  - raw manifest endpoint search over full uploaded manifest with top-100 preview window
  - standardized preview search over full normalized output with top-100 preview window

### Changed
- Order preprocessing UI now uses a multi-open 3-step accordion flow (upload -> raw sample -> standardize)
- Raw sample and standardized preview table viewport defaults updated for operator readability:
  - raw: about 10 visible rows before scroll
  - standardized: about 20 visible rows before scroll
- Sidebar grouping consistency improved by making Inventory and POS collapsible sections like HR

---

## [1.4.0] - 2026-02-16

### Added
- New Standard Manifest preprocessing contract with `preview-standardize` and `process-manifest` support for function chains per standard column
- Pre-arrival manifest pricing support on `ManifestRow` (`proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`)
- New pricing endpoint `POST /api/inventory/orders/:id/update-manifest-pricing/` for bulk manifest-row pricing updates
- New check-in endpoints:
  - `POST /api/inventory/orders/:id/check-in-items/` (bulk order check-in)
  - `POST /api/inventory/items/:id/check-in/` (single-item check-in)
  - `POST /api/inventory/batch-groups/:id/check-in/` (batch check-in)
- New check-in tracking fields on items: `checked_in_at`, `checked_in_by`
- New reusable frontend Standard Manifest modules:
  - `useStandardManifest` hook
  - `StandardManifestBuilder` component
  - `StandardManifestPreview` component

### Changed
- Replaced old order preprocessing UI with a cleaner Standard Manifest workflow and primary action **Standardize Manifest**
- Replaced prior processing page with a unified processing workspace centered on:
  - set fields,
  - check in,
  - print tags
- `create-items` now acts as a check-in queue builder and enforces post-delivery creation

### Fixed
- Removed old row-expression preprocessing/filtering flow that caused clunky UX and replaced it with explicit standard-column mapping
- Reduced processing-step/button sprawl by consolidating actions into a single arrival workflow

---

## [1.3.0] - 2026-02-16

### Added
- M3 inventory processing implementation finalized: all units are created as `Item` rows with optional `BatchGroup` acceleration for high-quantity rows
- Full manifest preprocessing flow on order detail page: raw row selection, row-expression selection (`1-50,75`), source-to-target column mapping, and per-field transforms
- Transform support in manifest normalization: `trim`, `title_case`, `upper`, `lower`, `remove_special_chars`, and `replace`
- Header-signature-based template workflow: load prior formulas by manifest header signature and save updated mappings for future uploads
- New inventory endpoint `GET /api/inventory/orders/:id/manifest-rows/` for full CSV row retrieval during preprocessing
- New M3 inventory APIs and UI integrations for product matching, batch group processing, item detachment, item history, and category CRUD

### Changed
- `process-manifest` now parses the full uploaded manifest file (not only preview rows) when explicit `rows` payload is not provided
- Processing page redesigned around M3 queues: Batch Queue + Individual Queue + Detached/Exception items
- Order detail manifest workflow now aligns to M3 sequence: preprocess -> process rows -> match products -> create items+batches -> mark complete
- Inventory and project documentation updated to make M3 the authoritative processing model

### Fixed
- Corrected manifest processing bug where only 20 preview rows were normalized instead of the full uploaded file

---

## [1.2.0] - 2026-02-13

### Added
- Purchase Order 6-step status workflow: ordered → paid → shipped → delivered → processing → complete
- Status action buttons: Mark Paid, Mark Shipped, Mark Delivered with dedicated UX modals
- Status undo buttons: Undo Paid, Undo Shipped, Undo Delivered to revert status changes
- "Shipped" modal with dual modes (Mark Shipped / Edit Shipped) including date pickers for shipped_date and expected_delivery
- Cost breakdown: purchase_cost + shipping_cost + fees = total_cost (auto-computed in model save)
- New PO fields: paid_date, shipped_date, retail_value, condition (dropdown), description, order_number (editable)
- Auto-generated order numbers (PO-XXXXX) with option to provide custom values
- CSV manifest upload persists to S3 with S3File record and manifest_preview JSON field
- S3File download URL via presigned URL property
- Manifest file info bar on detail page with filename, size, upload date, and Download button
- Ordered date editable on both create and edit forms
- Order list view enhanced with Description, Condition, Items, Retail Value columns

### Changed
- PO status choices renamed: `in_transit` → `shipped`, added `paid`
- Edit Order dialog reorganized: Order # + Date → Details → Costs → Notes (consistent across create/edit/detail)
- Create Order dialog now includes all fields matching edit dialog (# Items, condition, retail value, description)
- Upload manifest endpoint now returns full order detail instead of transient preview
- useUploadManifest hook invalidates specific order query for immediate UI refresh

---

## [1.1.0] - 2026-02-13

### Added
- Multi-role user model: User can simultaneously hold Employee, Customer, and Consignee profiles via Django Groups
- User `roles` property returning all assigned group names
- Employee termination workflow: termination type (10 industry-standard types), date, notes, status badge with tooltip
- Consignee account management: create from existing or new user, profile editing, soft-delete
- Consignee detail page with account settings and nested agreements (drop-offs)
- Customer management: full CRUD with auto-generated customer numbers (CUS-XXX)
- POS customer association: scan customer ID (CUS-XXX) at terminal to link customer to cart
- Admin password reset: generates temporary password for any user
- Forgot password flow: request reset token, enter new password (email delivery stubbed)
- Time entry modification requests: employee submit, manager approve/deny
- Phone number formatting utility (formatPhone, maskPhoneInput, stripPhone) applied across all UI
- Reusable ConfirmDialog component for destructive actions
- StatusBadge tooltip support for contextual information on hover
- Item detail page for viewing/editing individual inventory items
- ForgotPasswordPage with multi-step form
- ConsigneeDetailPage with profile editing and agreement management

### Changed
- AccountsPage rewritten to list consignee people (accounts) instead of agreements
- Agreement creation now defaults commission rate from consignee profile, start date to today, terms to standard template
- ConsigneeAccountViewSet uses user ID for lookups (not profile ID)
- DataGrid action columns vertically centered across all pages
- Date input fields use shrunk labels to prevent overlap
- Add Consignee dialog uses ToggleButtonGroup instead of confusing toggle switch

### Fixed
- EmployeeDetailPage crash: departments.map TypeError from paginated API response
- ConsigneeDetailPage 404: ID mismatch between frontend (user ID) and backend (profile ID)

---

## [1.0.0] - 2026-02-13

### Added
- Django 5.2 backend with 6 apps: accounts, core, hr, inventory, pos, consignment
- Custom User model with email-only authentication
- JWT auth with httpOnly cookie refresh tokens and in-memory access tokens
- Role-based access: Admin, Manager, Employee, Consignee (Django Groups)
- React 19 + TypeScript frontend with Vite, MUI v7, TanStack React Query
- 24 page components across dashboard, HR, inventory, POS, consignment, admin, and consignee portal
- Time clock with automatic clock-in (empty body POST)
- Sick leave accrual system (1 hour per 30 hours worked, 56-hour annual cap)
- Inventory pipeline: vendors, purchase orders, CSV manifest processing, item creation
- POS terminal with SKU scanning, cart management, cash/card/split payments
- Cash management: drawer open/close/handoff, cash drops, supplemental drawer, bank transactions
- Denomination breakdown tracking (JSON fields) across all cash operations
- Consignment system: agreements, item tracking, payout generation
- Consignee portal: self-service items, payouts, summary dashboard
- Dashboard with today's revenue, weekly chart, 4-week comparison table, alerts
- Public item lookup by SKU (no auth required)
- Local print server integration service (FastAPI at localhost:8888)
- Seed data management command (groups, admin user, registers, settings)
- Heroku deployment config (Procfile, WhiteNoise, gunicorn)
- Project documentation in docs/
- Developer workspace with bat scripts and Jupyter notebook
