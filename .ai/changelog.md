<!-- Last updated: 2026-02-13T21:00:00-06:00 -->
# Changelog

All notable changes to this project are documented here at the **version level**.
Commit-level detail belongs in commit messages, not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
