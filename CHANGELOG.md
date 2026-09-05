<!-- Line 1 release: ## [2.89.1] -->
<!-- Last reviewed: 2026-09-05 (v2.89.1 hours card + Visit rows) -->
# Changelog

All notable changes to this project are documented here at the **version level**.
Commit-level detail belongs in commit messages, not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.89.1] - 2026-09-05

User-facing theme: **Holiday hours you can scan** - one dated sentence, a two-column week, labels that stand off the values.

Initiative: [`pos_labor_day_summer_sale`](./.ai/initiatives/pos_labor_day_summer_sale.md) Phase 2 polish.

### Changed

- Holiday line is `Mon, Sep 7 (Labor Day): 9 AM to 6 PM, note.` (`holiday_sentence` in `apps/webstore/services/hours.py`, same wording in `frontend-public/src/lib/hoursLabel.ts` and Dash `storeHours.ts`). Dropped the "Holiday hours may differ…" filler.
- www `StoreHoursBlock` prints the weekly clock as day | time rows. Visit and Home store cards indent values from brand-green small-cap labels.

---

## [2.89.0] - 2026-09-05

User-facing theme: **Tell the store from Dash** - announcements and holiday hours land on www the same minute.

Initiative: [`pos_labor_day_summer_sale`](./.ai/initiatives/pos_labor_day_summer_sale.md) Phase 2.

### Added

- Dash **Announcements** (Studios): rich-text CRUD, gallery, placements (banner / Home / Visit / Shop), schedule, toggle, templates, and **Copy from…** / duplicate. `Announcement` + `AnnouncementImage` (`webstore.0018`). `GET/POST /api/webstore/announcements/`, `toggle/`, `duplicate/`, image upload/reorder. Public `GET /api/webstore/public/announcements/`.
- Settings → Store **Holiday & special hours**: dated open/closed overrides. `StoreHoursOverride` + `GET/POST /api/webstore/hours-overrides/`. Hold expiry and the public status pill honor overrides (including opening a normally closed Monday).
- www **Holiday hours** block: weekly schedule stays put; dated lines plus "Regular hours resume …" so customers see a temporary exception, not new hours. JSON-LD `specialOpeningHoursSpecification`.
- www announcement banner (dismissible), Home/Visit/Shop cards, and photo gallery. Tokens `{{holiday_hours}}`, `{{regular_hours}}`, `{{sale_end}}`, `{{store_name}}`.

### Changed

- `apps/webstore/services/hours.py` routes `is_open_day` / `close_on` / hold expiry through `effective_day()`. `GET /api/webstore/config/` hours payload adds `overrides`, `today`, `regular_label`, `resume_label`.

---

## [2.88.0] - 2026-09-05

User-facing theme: **Labor Day at the register** - 10% off runs itself, Summer is one tap, Assembly is $35.

Initiative: [`pos_labor_day_summer_sale`](./.ai/initiatives/pos_labor_day_summer_sale.md).

### Added

- POS Terminal Labor Day sale: date-driven 10% off merchandise (first Monday of September through that Saturday; 2026 = 09-07..09-12) with a header chip cashiers can toggle. `GET`/`POST /api/pos/sale-mode/`; AppSetting `pos.labor_day_sale`.
- Summer 50% off on cashier-marked cart lines via the **Summer** button (`POST /api/pos/carts/{id}/lines/{line_id}/sale/`). Floor-marked; no backend item flag. Stays 50% when Labor Day is off.
- **Assembly** button ($35): `line_kind=assembly`, `POST /api/pos/carts/{id}/add-assembly/`. Assembly and Delivery never take sale discounts.
- `POST /api/pos/carts/{id}/sync-sale/` re-applies Labor Day to eligible lines after a toggle.
- Print server 1.5.1: `1.25″ × 1.25″` square label preset on the local `/` UI, `/settings`, and dashboard Printing settings.

### Changed

- `CartLine` gains `sale_label` / `sale_percent` (`pos.0027`). `unit_price` stays list price; `line_total` applies the sale. Completing a sale writes the effective sale price to `Item.sold_for` and consignment `sale_amount`.
- Receipts print the effective unit price and a ` (10% Labor Day)` / ` (50% Summer)` suffix on sale lines.

### Fixed

- `apps/documents/flatten.py` imports `pymupdf as fitz` (new PyMuPDF module name).
- `scripts/dev/dev.ps1` no longer treats Python stderr from `migrate --check` as a terminating error.

---

## [2.87.0] - 2026-09-03

User-facing theme: **One desk for the floor** - Home, Today, Pay, and Routines share one band and the same four names as the phone.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Added

- Desk `FloorNav` (Home / Today / Pay / Routines, Settings for Manager+) on every floor page.
- Desk Pay: current period as the hero, past periods and recent shifts as duty cards, shift and status columns on the grid.

### Changed

- Home, Today, Pay, and Routines open with the same compact green band and the same nav. Content sits in a 1440 column on sage paper. Dashboard keeps its olive body under the band.
- Desk Routines keeps the phone stage, inset in the shared shell. My Routines / Catalog stays at the top of the list.

### Fixed

- A Retail day with no letter stays a dash. It is not painted as a missed scheduled day. `0008_retail_program_v2` reseeds Open / Day / Close in place and does not delete runs.

### Documentation

- Floor pages: band, column, `FloorNav`, duty card recipe. Routines desk shell is `FloorPage`.

## [2.86.0] - 2026-09-03

User-facing theme: **Today is the punch on every screen** - desk Today clocks you in, desk Pay is the ledger.

### Added

- Desk Today (`/today`): greeting, shift punch, week hours, and the day's routines in two columns.
- Desk Pay (`/pay`): this week, current and past periods with `••••`, and a recent-shifts grid. No punch.

### Changed

- Dashboard quick links and the profile menu open `/today` and `/pay` on desk and phone. The Day at a glance dialog is gone. `/hr/time-clock` and `/hr/time-history` redirect to Pay.
- Catalog demo no longer has Cancel. Pick another routine or leave the page.

### Fixed

- Staying on a catalog demo no longer freezes the phone frame (`Maximum update depth exceeded` in `RoutinePreview`).

### Documentation

- Today owns the punch. Pay is the ledger. Same names on desk and phone; desk uses the width.

## [2.85.0] - 2026-09-03

User-facing theme: **Today is the punch, Pay is the ledger** — Home / Today / Pay / Routines on the phone.

### Added

- Today on a phone clocks you in, takes a break, and clocks you out above the day’s routines. The week-limit warning is a fixed colour-only line, not a pulsing banner.
- Pay tab (`/pay`): this week, the current biweekly period, past periods, recent shifts, and Request time change. Dollars stay behind Show pay and reset when you leave the screen.

### Changed

- Phone tabs are Home / Today / Pay / Routines. `/hr/time-clock` on a phone opens Pay. Desktop Time clock and the desk Day at a glance dialog are unchanged.

### Documentation

- Phone Today owns the punch. Pay is a staff ledger over `GET /hr/time-entries/my_pay/`.

## [2.84.0] - 2026-09-03

User-facing theme: **Routines is just a list** — My routines and Catalog, no editing on the floor, and Spanish from the profile menu.

### Changed

- Staff Routines is My routines + Catalog. Add, edit, and delete stay in Admin - Routines. No filter, no "Assigned to me" eyebrow, no "This week" / "Done this week", and no "nothing blocking" placeholder.
- Language (EN / ES) lives in the profile dropdown and is remembered on the user. Day at a glance no longer has its own toggle. Phone tab labels, the Routines list, and phone chrome follow that setting.

### Documentation

- Staff lists are read/fill only; language is set from the profile menu.

## [2.83.0] - 2026-09-03

User-facing theme: **Dashboard is a phone app now** — today's sales first, one scroll, a Home / Today / Clock / Routines / More bar. Desktop is unchanged.

### Added

- Phone shell on Dashboard, Today, Time clock, and the Routines list: hamburger + title, and an in-flow Home / Today / Clock / Routines bar. Filling or demoing a routine swaps that bar for save/cancel or the demo chip.
- Purpose-built `/dashboard` phone layout: today hero, 4-week / 13-week trend, this-week list, past-week sheet, compact department cards. Day detail and week history open as bottom sheets.

### Changed

- Desktop dashboard still uses the 2-column Sales grid and department cards. Phone no longer stacks those widgets or the quick-link strip.

### Documentation

- MainLayout phone shell and Dashboard phone tree in frontend context.

## [2.82.0] - 2026-09-03

User-facing theme: **One walk for every aisle** — Daily Check, Tuesday, and Owner look the same; Owner also ticks a few Open / Day / Close checks.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Changed

- Section walks share one body: counters, optional photo, notes. No "how many items" question. No photo lock.
- Owner spot picks a random aisle that has not been walked this week. When none are left: NO SECTIONS LEFT TO CHECK. Choose another picks a different unseen aisle.
- Daily Check demo shows one real section (not two fake samples) and Choose another. The bar still says Demo.

### Documentation

- Routines: owner rotation no longer wraps; item floor removed.

## [2.81.0] - 2026-09-03

User-facing theme: **Owner is who, not a list of rooms** — the unused Subject pool box is gone.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Removed

- **Subject pool.** Authored list of areas/tills/vehicles that each run used to draw from. No routine used it. Section work still writes `RoutineRun.subject` from the floor plan. `subject_source` stays (`pool` now means a plain checklist).

### Documentation

- Routines: subject pool dropped from the model table and program writable list.

## [2.80.0] - 2026-09-03

User-facing theme: **Your day follows your punch** — Open, Day, and Close belong to the cashier shift, not to everyone in Retail.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Changed

- **Audience.** Owner is Type (person / shift / department), Share (one shared / each), then Who or All. Shift-typed routines hide when clocked out. My Day (mine, today, nags) uses the same rule; superusers no longer see every open run on their personal list.
- Program: Open / Day / Close are shift + one shared on that punch. Work cycle is the four retail punches. Person-tied work still shows when clocked out.

### Documentation

- Routines: audience replaces role ∩ department.

## [2.79.0] - 2026-09-03

User-facing theme: **Missed stays missed** — a Wednesday Open cannot be filled on Thursday, while changing the air filter still can.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Added

- **Missed if not done.** Separate expire clock from Counts as late. `expire_rule` (`never` / `end_of_day` / `end_of_week` / `after`) plus count, unit, and optional hours-start time. Past `miss_at` flips the open run to `missed`; start / submit / cover return 400. New authored routines default to never.
- Program clocks: Open expires 6 hours after 8:30am; Day, Close, owner spot, Tuesday cross-check, and my-section expire at the end of that day; Work cycle never expires.

### Documentation

- Routines: fourth instant `miss_at`, status `missed` is now written.

## [2.78.0] - 2026-09-02

User-facing theme: **Clock in, pick a shift, see the day** — seven tiles grouped Retail / Warehouse / Office, a bilingual Day at a glance, and the real 52-item Open / Day / Close lists.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Added

- **Shift on the punch.** `TimeEntry.shift` grouped Retail (Cashier Open / Day / Close, Customer Service), Warehouse (Processing, Restoration), Office (Management). Self clock-in requires it. `POST /hr/time-entries/{id}/set_shift/` changes an open punch. Serializer exposes `shift_label` and `shift_department`. Roster and Time & payroll show `Retail: Cashier - Open`. Clock-in uses quiet department tiles instead of a green button wall.
- **Language.** `User.language` (`en` / `es`). `PATCH /auth/me/` plus an EN/ES toggle. Routine chrome and content use `frontend/src/i18n/routines.ts`.
- **Day at a glance.** `GET /api/routines/today/` maps the current shift to the start-with checklist. Due today omits the other Open / Day / Close lists (an opener does not see Close). Dialog in MainLayout once per punch per device; `/today` and the account-menu **Today** item.
- Per-check verify of the last shift (`verify_prev`). Work-cycle non-shelf ticks come from Day.
- **Dashboard quick links.** Today, Time clock, Routines, and Settings as raised pills in the Sales header (desktop) or a strip above it (phone). Today (dashboard or account menu) always opens Day at a glance. Account menu otherwise unchanged.

### Changed

- Taxonomy is ordered groups with solutions and Spanish. Grades score by group. Just-do (dirty, trash, hangers) is never stored.
- `0008_retail_program_v2` reseeds Open (31-41), Day (1-30), Close (42-52) in place. Titles: Retail open / Retail day / Retail close. Day nags at clock-out.
- Due + in progress is one row: drafts on a scheduled run stay in the time bucket. In progress is on-demand drafts only.

### Documentation

- Routines, backend, frontend updated for shift, language, glance, and the new lists.

## [2.77.0] - 2026-09-02

User-facing theme: **Retail QA settles in** — Work cycle is a real walk with phone pickup, idle registers get asked, and Routine Control stops swapping the page.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Added

- **Work cycle** is its own kind (`work_cycle`): shelf check (section + taxonomy counters) or non-shelf ticks from Opening and Closing. `GET /routines/routines/:id/` sends `runner` context; start POST accepts `mode`.
- **Draft pickup.** `GET /runs/mine/` returns `drafts` and `idle_prompt_minutes`. `?draft=` resumes a submission. My Routines and the app-bar nag show **In progress**. The mine query polls every 15s and refetches on focus.
- **Terminal idle prompt.** After `retail_qa.idle_prompt_minutes` (default 5) with no cart, the register asks Shelf / Non-shelf / Not now. Answers log `WorkCyclePrompt` (`POST /api/routines/work-cycle/prompt/`). The Work cycle pill stays.
- **Dashboard and Grades activity.** Retail note lists work cycles and dismissed idle prompts. Grades gains a Work cycles band (six day tiles plus idle prompts). Work cycles do not change the letter.
- Settings > Retail QA: idle prompt minutes.

### Changed

- **Cleanup** (`routines/0006_retail_qa_cleanup`): authored leftovers deleted; program titles lose dashes; Day is a before-you-leave list; `retail.work_cycle` flips to `kind=work_cycle`.
- **Program routines are locked.** They cannot be retired. `trigger`, `assignment`, `subject_source`, `verifies`, `is_active`, and `kind` stay as seeded; only checklists may edit `definition`.
- Owner spot check re-rolls an empty section the next time materialize runs after a section exists.
- Routine Control is one persistent header. Sections and Grades sit in a centred column. `?id=` survives a view switch.
- Em and en dashes removed from `frontend/src` and `apps` Python.

### Documentation

- Routines, POS, initiative record, and the navigation map updated for work-cycle pickup and the idle prompt.

## [2.76.0] - 2026-09-02

User-facing theme: **Routines replace Quality Audit** — staff fill Open / Day / Close and section walks; the floor grades A–F.

Initiative: [`routines_and_documents`](./.ai/initiatives/routines_and_documents.md).

### Removed

- **Library** workspace (`/library/*`, `apps.library`) and the Quality Audit system (`QualityAudit` / `QualityAuditForm`, `/admin/quality-audit*`). Production tables `pos_qualityaudit` and `pos_qualityauditform` drop via `pos.0026_drop_quality_audit`.

### Added

- **Routines** (`/routines`, `/api/routines/`) — periodic and on-demand fill-in forms, pooled or per person, mockup-styled list, runner, superuser editor, app-bar nag, nav badge. `materialize_routines` replaces `materialize_duties`.
- **Documents API** (`/api/documents/`) — PDF-only upload, field placement, assign-to-everyone, flatten + audit page. Staff routes and the account-menu link are unwired for this ship; pages stay in the repo for a later tune.
- **Routine Control** (`/admin/routines`, Admin workspace, superuser) — every routine, retired ones too, with run history (performed, pass rate, open / overdue, last performed by, next due, who is assigned). Search, Active / Retired / All, health chips with counts (Overdue, No one assigned, Never run, Blocking), department and cadence filters, four sorts. Inspector saves Name / Schedule / Owner in place (Ctrl+S), and handles Retire (with Undo), Restore, and Delete forever. API: `GET /routines/routines/admin/`, `POST …/:id/restore/`, `DELETE …/:id/hard-delete/` (retired rows only).
- **Retail QA program** — seven seeded routines that grade the floor A-F. Opener does Opening and signs off last night's Close; the closer signs off Opening and does Closing; the Day shift logs shelf checks, non-shelf checks, and projects. Everyone walks the section they keep and logs what they had to put right; on Tuesdays they cross-check somebody else's section, photo first, with a minimum number of items inspected. The owner's daily spot check draws two random checks and one section not yet checked this week. A day is half the checklists and half the spot check when one happened; a week is the daily average and the cross-checks. Daily walks are recorded but never scored.
- **Sections** (`/api/routines/sections/`) — named areas of a department with an owner, ordered by drag, retired rather than deleted. Routine Control gained a **Sections** view with inline owner selects and a Coverage panel naming areas with no keeper and people with no area. `POST /runs/:id/cover/` hands an absent owner's walk to whoever takes it.
- **Routine Control > Grades** — the week's letter with its figures, a Mon-Sat strip of day letters, the selected day taken apart (who did Open / Day / Close, on time or late), the cross-checks with their photos and findings, a tally grid per section, today's unclaimed walks with **Cover**, and checker gaps where an owner found what the auditor did not.
- **Settings > Retail QA** — every number behind the grade: the owner spot check's weight, the daily average's weight in the week, credit for a late checklist, the A / B / C / D lines, the issue counts that step a category down, the items an audit must inspect, and how many checks a spot check draws.
- **Work cycle pill** on the POS terminal cart header, opening the on-demand `retail.work_cycle` run.
- **Clock-out guard** on the time clock — anything hard-due or due at clock-out is listed with **Do them now** and **Clock out anyway**. It warns; it never blocks.

### Changed

- **Users directory** — Employees: Dept (dropdown), Job (inline), Role, Type, and Phone save on the row; columns run identity → number → dept → job → role → type → phone → tenure → access. Customers: Notes is on the table; Phone and Notes save on the row; columns run identity → number → phone → notes → holds → account → since.
- **Essentials** is Dashboard only. Time clock and Routines live in the account menu. Digit 9 and letter L are free.
- **Routines** is a phone-first two-pane shell: My Routines / Catalog on the left, the same 9:20 phone render on the right, running the full height of the pane with no desk slab behind it. Bi-weekly trigger uses a next-due date and repeats every 14 days.
- **Routine editor** is a single form sheet (Name, Schedule, Owner, Checklist) with two-line check cards carrying hint, unit, critical, and delete. Cancel and Save sit in a green-tinted pane header. **Copy for AI** puts the routine plus who can own it (departments and people with ids), a field guide, and reply rules on the clipboard; **Update from JSON** takes back what the AI returned (pasted or uploaded, prose around it tolerated, department and people names accepted), validates it, shows what would change, and fills the form for review before Save. `/routines/routines/assignees/` now carries each person's role and department.
- **Routine lists** are two-line rows with a status tile on the left (overdue, blocking, today, in progress, passed, failed, or the routine's cadence), badges in a column, one pill verb and quiet icons on the right, and a filter box in the header. Lists and editor share one pane width so the phone never moves.
- **Routines chrome** uses brand green (`#2e7d32`) for actions, the phone header, and mode pills on the bottom bar. Colour context lives in `.ai/extended/brand.md`.
- **Deleted routines** leave the catalog, My Routines, and overdue nags. Delete is a retire (`is_active=false`); Routine Control restores or deletes for good.
- **Dashboard Retail** card is the Retail QA letter: the day's letter in each cell, the week's letter under the label, and a click that opens Grades on that day for a superuser. The overdue-routines strip is not on the Dashboard; that rollup waits for a SuperAdmin Control Center.
- **Routine nags have three levels.** *Remind at* starts the quiet one — badges and list tags. *Hard nag at* starts the app-bar alert, and can be set to **At clock-out** instead of a time, which keeps a routine off the app bar entirely and raises it on the time clock as the shift ends. *Counts as late* is separately chosen: as soon as the hard nag starts, at the end of the day (the default), or after N grace days. A 5:50pm close stays quiet all day and is not late until midnight.
- Saving a routine (and opening Routines) materializes today's run so a new checklist shows up immediately.
- Editing a routine updates open drafts, and submitting one removes it from pending lists immediately.

## [2.75.0] - 2026-08-26

User-facing theme: **Hours on the website match Settings** — saving Store hours updates the public schedule line.

Outside initiatives.

### Added

- **`GET /api/webstore/config/` `hours`** — timezone, open, close, Python `closed_weekdays`, and a generated `label` from AppSetting `online_sales.hours`.

### Changed

- **Public schedule copy** — Home, Visit, footer, checkout, holds, and account build `9 AM - 6 PM, Tuesday - Saturday · Closed Sunday & Monday` from those fields. Settings shows the same sentence as a live preview.

### Documentation

- `.ai/extended/frontend.md`, `.ai/extended/development.md`.

## [2.74.3] - 2026-08-26

User-facing theme: **Store hours save again** — dotted setting keys reach the API.

Outside initiatives.

### Fixed

- **AppSetting PATCH** — `lookup_value_regex` allows dots so `/api/core/settings/online_sales.hours/` no longer 404s.

## [2.74.2] - 2026-08-26

User-facing theme: **Hours stay on one line** — Open now and closes-at no longer stack.

Outside initiatives.

### Fixed

- **Public home hours** — inner Hours spans stay inline so **Open now, closes at 6 PM** does not wrap under a leading comma.

## [2.74.1] - 2026-08-26

User-facing theme: **Open now is green** — the public hours status actually looks open.

Outside initiatives.

### Fixed

- **Public home hours** — `.vrow .status-dot` no longer overrides the open color. The dot and **Open now** are green while the store is open.

## [2.74.0] - 2026-08-26

User-facing theme: **Rooms that stay put** — Studios, Catalog on the Floor, and one Settings house with a real permissions catalog.

Initiative: [`admin_workspace_overhaul`](.ai/initiatives/admin_workspace_overhaul.md).

### Added

- **Studios workspace** (`8` / `S`) — Label Studio, Floorplans, QA Forms, Blog Studio. Floorplans stay on Retail Floor too.
- **Settings house** — `/admin/settings?tab=` opens System, Printing, Store, Assumptions, Permissions. `/admin/assumptions` and `/admin/permissions` redirect in. Default tab is System.
- **Capability catalog** — `apps/accounts/capabilities.py`, `GET /api/auth/capabilities/`, `GET /api/accounts/capability-catalog/`. Permissions tab is a read-only matrix (Employee / Manager / Admin / Super Admin, plus Consignee and Customer).

### Changed

- **Assigned workspace digits** — Buying 1, Processing 2, Restoration 3, Floor 4, Cashier 5, Deliveries 6, Online Sales 7, Studios 8, Admin 0. Catalog moved onto Floor; the empty Inventory workspace is gone. `9` is unused.
- **StaffRoute and roles** — one `ROLE_RANK` table; `StaffRoute` requires a staff role; `IsManager` removed; `UserUpdateSerializer` no longer clears extra groups.
- **Print Settings** — assignment rows, installer strip, click-to-refresh Print Server title, manage URL is a link.
- **Public home hours** — open/closed dot sits on the same line as the status text.

### Removed

- Standalone Assumptions and Permissions pages (redirects remain).

### Documentation

- `.ai/extended/frontend.md`, `.ai/extended/auth-and-roles.md`, `.ai/extended/backend.md`, `frontend/src/navigation/README.md`.

## [2.73.0] - 2026-08-26

User-facing theme: **Receipts that fit the tape** — full-width ESC/POS, a Google Review coupon, and a POS discount that can redeem it once.

Outside initiatives.

### Added

- **Google Review discount** — POS Discount reason autofills 5% / Full ticket (max $5). Cashiers enter the Google username and stars; `GET /pos/carts/google-review-usernames/` typeaheads prior names. The same username cannot redeem again on an open or completed cart (`POST …/add-discount/` with `mode`, `percent`, `google_review_username`, `google_review_stars`).
- **Receipt coupon** — printed tape ends with a framed 5% / next-visit Google Review offer and its terms.

### Changed

- **Receipts print raw ESC/POS** — `format_receipt` → `send_raw` so the POS-80C no longer shrink-to-fits a short receipt. Storefront (name, tagline, address, phone, Tue–Sat 9–6 / Sun & Mon closed) is hardcoded on the print server (v1.5.0). Policy is final-sale plus test-before-you-buy, not used/donated.
- **POS discount dialog** — reason first; `$` / `%` both visible; apply Full ticket or per line.
- **Public hours** — ecothrift.us and the holding page are **9 AM – 6 PM, Tuesday – Saturday · Closed Sunday & Monday**. Hold-expiry `online_sales.hours` matches (`webstore.0017`).
- **Ship protocol** — no production data pull after push.

### Documentation

- `.ai/extended/pos-system.md`, `.ai/extended/print-server.md`.

## [2.72.0] - 2026-08-25

User-facing theme: **People and pay** - one Admin Users board, emailed staff password reset, and a Time & payroll table that can be read in one pass.

Outside initiatives.

### Added

- **Admin → Users** — `/admin/users` replaces Employees. Customers (Manager+) and Employees (Admin) sit as tabs with search, rich rows, stats, and detail drawers. Staff can email a password-reset link from either drawer. `/admin/customers` redirects here. Customer directory left Online Sales; Messages is now `/online-sales/messages`.
- **Staff password reset** — forgot-password emails a one-hour `MagicLinkToken` (`staff_reset_password`) to `/reset-password?token=…`. The old cache token and plaintext admin temp password are gone. Account menu has **Change password**. New: `STAFF_DASHBOARD_HOST`, `POST /api/accounts/users/{id}/send-password-reset/`, `POST /api/accounts/customers/{id}/send-password-reset-link/`.
- **Directory stats** — `GET /api/accounts/customers/stats/`, `GET /api/accounts/users/stats/`, and a customer rollup on the drawer. Reservation list annotates hold counts via an index on `Reservation.email` (`webstore.0016`).

### Changed

- **Time & payroll** — one-line period toolbar, pending left of the payroll total, no page title. By employee is Employee / # Shifts / Rate / Ind. weeks / Time / Payroll with a totals footer. Regular vs overtime is 40 h per Mon–Sun week. Pay is computed from 2-decimal hours so the printed hours match the dollars.
- **Shop-floor grids** — Messages, Holds, Listings, Retail inbox, and Users fill the page so the bottom gap matches the side margins.

### Fixed

- **Staff last sign-in** — `POST /api/auth/login/` (and magic-link consume) now stamps `last_login`. The JWT path never fired Django's login signal, so every employee read as unused.
- **Payroll rounding** — `TimeEntry.compute_total_hours` quantizes to 2 dp before pay is multiplied, matching the roster.

### Removed

- `UserListPage`, the Online Sales Customers directory, and returning a staff reset token in the forgot-password JSON body.

## [2.71.0] - 2026-08-25

User-facing theme: **TARS on the floor** — queue and grade table, a parts command center, a hold story, and a staff Requests sheet.

Initiatives: [`finalize_tars_app`](.ai/initiatives/_archived/_completed/finalize_tars_app.md), [`enhancement_requests`](.ai/initiatives/_archived/_completed/enhancement_requests.md). GitHub only — not Heroku.

### Added

- **Enhancement requests** — staff file a Restoration or Processing ask from a bottom sheet on the bench and Processing (`RequestsDrawer`). Superuser triages on `/admin/enhancement-requests` (priority, target date, status). Notes are owner-or-superuser only. API: `GET/POST /api/core/enhancement-requests/`, `PATCH …/{id}/`, `GET/POST …/{id}/notes/`, `POST …/{id}/triage/` (superuser). Migration `core.0002_enhancement_request`.
- **Parts command center** — `/restoration/parts-requests` is Live (attention strip + Requested / Approved / Ordered / Received) and History (grouped by item). Receive and inspect are two steps: Delivered only marks arrival; inspect is per-line Acceptable / Issues (`POST …/inspect/`). The Received lane is the inspect form. Uninspected received stays Live after Finish; inspect moves the order to History. Old `POST …/review/` is 410. Timeline event `parts.order_inspected`.
- **Hold story** — Place on hold is pieces, not one reason code. Buy comes from live parts orders. Time / Space / Help / Other are optional add-ons with a description. Where it sits is Holding Rack or freeform. The hold-note field is gone; the assembled story writes to the item notes ledger. Same dialog on the bench and Overview.
- **TARS floor surfaces** — Overview scoreboard + queue, grade table bench, item notes ledger, Finish / Receive / Reject, salvage outputs, purchase desk, cancel-a-parts-request. Stages 1–5 and 8. See the initiative Record.

### Changed

- **Parts Requests nav badge** — counts approvals, cancel asks, and reviews from the same live orders list the board writes. Approve, deny, or file the last waiting order and the badge (and Restoration workspace pip) clear with the board instead of waiting on a 30s poll.

### Documentation

- **AI steering overhaul** — `.ai/` is a compass again: four protocols (`load-context`, `ship`, `initiative`, `sql-schema`), `context.md` no longer retells the changelog, `.ai/reference/` kept to TARS design/canon plus the bookkeeping recon, and session start/checkpoint/close machinery is gone.

## [2.70.0] - 2026-08-11

User-facing theme: **Processing retail/price lock** — lock % between Retail and Price, editable percent badge, and row-patch persistence that matches check-in.

Outside initiatives (Processing QoL + dev starters).

### Added

- **Processing retail/price lock** — on the Processing row-detail toolbar and the shared check-in detail fields, a lock toggle sits between Retail and Price, and a clickable percent badge sits on the Price input. With the lock on, adjusting retail scales price by the held percent (price edits never move retail); clicking the badge edits the percent and updates the dollar amount. Lock + last percent persist in localStorage.

### Fixed

- **Dev starters split correctly again** — `start_dashboard.bat` / `start_mobile_dashboard.bat` start Django + staff dash only; `start_website.bat` starts Django + public www only; `start_all.bat` starts the full stack. They had all been aliases of one script that always launched both frontends.
- **Processing row retail/price lock actually persists** — `processing-row-patch` now keeps `final_price` in lockstep with `shelf_price`, and denorm no longer overwrites a patched shelf price with a stale `final_price` on item-less rows. Row-detail lock/% updates match check-in modal dynamics.

## [2.69.0] - 2026-08-07

User-facing theme: **Online Sales goes live** - Customers workspace, verified holds, Graph mail, and a hard blank-slate for Online Sales only.

Initiative: [online_sales_mvp](.ai/initiatives/online_sales_mvp.md).


### Added

- **Online Sales → Customers** — new workspace page (`/online-sales/customers`) with Directory (create/edit profiles, active/inactive filter, notes) and **Messages** (moved off Holds). Customer service actions: send magic-link sign-in, deactivate/reactivate, open messages by email, and jump into recent holds. Sidebar unread badge now sits on Customers. Old `/online-sales/holds?tab=messages`, `/online-sales/inbox`, and `/admin/customers` redirect here.
- **Holds ↔ Messages cross-links** — holds with a thread show a Messages link (unread badge or “Messages”) into `Customers?tab=messages&thread=…`; the hold drawer surfaces the same and closes before navigating. Message threads tied to a hold show a clear **Open hold** action in the list and thread pane. Reservation payloads include `conversation_id` + `has_messages`.
- **Customers / Messages badge = your next action** — sidebar and Messages tab badges count `needs_reply` threads (Eco-Thrift owes a reply), not unread mail. Row pills can still show unread; the badge means work waiting on staff. Conversation list also accepts `?unread=0|1` when a screen needs that split.
- **Customer Messages: Unread filter + soft delete** — Messages has All / Unread tabs, Mark unread on an open thread, and Delete with a confirm (“This cannot be undone”). Delete sets `customer_deleted_at` so the thread disappears from the customer inbox only — staff still see it and the DB row stays. A later staff reply clears the soft-delete so the customer sees the new message. Endpoints: `POST /api/webstore/my/conversations/<token>/unread|delete/`.
- **Customer History archive** — finished holds can be archived from History (`POST /api/webstore/my/holds/<token>/archive|unarchive/`). That only sets `customer_archived_at` (separate from staff queue archive): the hold leaves History and shows on Account as a simple title + Restore list — no detail view. Active holds cannot be archived.
- **Customer account portal tabs** — `/account` is now Account / History / Messages. Active holds show as glanceable cards (thumbnail, status, deadline, pickup code, compact progress rail); past holds live under History; Messages is a real inbox with unread badges, thread preview, and in-page read/reply (including inquiry threads with no hold). New `GET /api/webstore/my/conversations/<token>/` returns a customer-scoped thread; `my/conversations/` adds last-message preview fields; hold payloads include `listing_image` + `listing_slug`.
- **Homepage featured items** — public `/` is now product-forward: who-we-are copy on the left and a wider Featured online panel on the right (one large card at a time; ← / → when there is more than one photographed available listing). The panel header is a single line — **Featured online** left, **Full store →** right — with no subtitle or update stamp. On production public hosts, Django stamps the intro + first card into `<!--PUBLIC_SHELL-->` before the SPA boots (60s cache).
- **Live store open status** — Visit strip on the homepage computes open/closed from America/Chicago hours (Sun closed; Sat evening → Monday), as real DOM text plus a decorative status dot.
- **Archive tier for Online Sales** — finished work now ages out of the staff queues instead of piling up forever. `Reservation` and `Conversation` gain `archived_at` / `archived_by` (migration `0013_archive_online_sales`); archiving is presentation-only, so it never changes a status, releases reserved stock, sends email, or hides anything from the customer's own view. Staff archive by hand from the hold drawer or the Messages panel (terminal holds and resolved threads only), and the new daily `archive_online_sales` command does the bulk by age. Reservation and conversation lists take `archived=0|1`; omitting it returns both, so search still reaches archived rows. Released and Messages panels gained Archived toggles, and `POST /reservations/<id>/archive|unarchive/` plus the conversation equivalents back them.
- **Abandoned-hold purge, opt-in** — `archive_online_sales --purge` deletes holds abandoned before the customer ever proved their email (released, no `verified` event, no confirmed `HoldConfirmation`, no customer message, no POS cart), plus their thread when it holds only system messages. Completed sales are never eligible at any age. Plain runs only report the eligible count; `--dry-run` writes nothing. Windows live in `apps/webstore/services/retention.py` and are settings-overridable — released holds and resolved threads archive at 30 days, purge at 30 days.
- **Unread is visible where the work is** — Customers Messages counts unread customer mail, and hold rows carry an unread chip plus a highlighted row, so a customer reply no longer hides behind a tab. Reservation payloads include `unread` from the hold's own thread.

### Removed

- **Whole-database wipe commands removed** - `reset_business_data`, `reset_buying_data`, and `create_test_auctions` are gone so production data cannot be erased in one line. Online Sales blank-slate remains `purge_online_sales` (DEBUG-gated; prod needs `--force-production --yes`). `seed_categories --clear` is also gone.

- **"Saved on this device" removed from Account** — the localStorage hold/message shortcut list was internal plumbing dressed up as a customer feature. Account already lists active holds and History; those device-local links are gone from the UI.
- **`.env.example` deleted** — exactly two env files remain, `.env` (local) and `.envprod` (Heroku mirror), and neither is committed. The file had decayed into an 18-line pointer covering 18 of ~107 keys, while several docs still cited it as the authoritative variable list. `.gitignore` now also blocks `.env.*` so no stray variant can be committed. The key list lives only in the **Environment Variables** table in `.ai/extended/development.md`.
- **Debug-token bypass removed** — customer APIs no longer return the raw magic-link token in any environment, and the "Continue with debug link" buttons are gone from the public Sign-in and Hold status pages. Confirming an email always means clicking the emailed link, so local testing exercises the real path. Affected account register, magic-link request, password reset, resend verification, hold create, and hold resend-verification.
- **Homepage clutter** — removed "Three simple steps", the standalone online-store green banner, fabricated testimonials, the single-item "In store now" spotlight, the blog teaser row (the nav and footer already link it), eyebrow labels, and the redundant "Plan your visit" / "Store details" buttons. Dead CSS for those blocks (`.hero`, `.frame`, `.how`, `.revs`, `.sell`) is gone too. Address remains in the visit strip and footer only; Google reviews link sits in the visit strip.
- **Surnames and staff names in public copy** — blog bylines are now "Bill / Owner" instead of "Bill Rollins / Founder & CEO" (`blog` migration `0002_author_first_name_only` updates existing posts), and no online-sales copy names a person. Pending-verification holds now read "Ask the front desk for help with an online hold", and hold-thread replies are attributed to "Eco-Thrift" rather than a raw author kind.

### Fixed

- **Needs action and Ready today could silently go empty as holds accumulated** — both tabs fetched one page of reservations and filtered in the browser, and Ready today ordered by `expires_at` ascending, so long-dead holds took the top of page one and pushed live work off it. Both now scope by status on the server (search deliberately spans every status so an old pickup code still finds its hold).
- **Emailed sign-in links reported "invalid or expired" on the first click** — the token was single-use and the public site spent it five times per click. `consumeToken` listed `user` in its dependency array, so a successful consume set `user`, gave the callback a new identity, and re-ran the `VerifyPage` effect that depends on it; StrictMode doubled each attempt in dev. One `200`, four `400`s, and the failures are what the customer saw. Consume now dedupes by token (rejections evicted so genuine retries still work) and reads `user` through a ref to stay identity-stable, and the verify page sends you to `/account` when a replayed token fails but its session is still valid.
- **Local Graph sends failed with `No module named 'msal'`** — `venv\Scripts\activate.bat` still pointed at `D:\Coding\…` from when the venv was built on another drive, so activation prepended a directory that does not exist and `python` fell through to system Python. The three relocated paths are corrected and `scripts/dev/dev.ps1` now launches Django by absolute `venv\Scripts\python.exe` instead of trusting activation, which also stops a stale venv from silently running the wrong interpreter.
- **Site header floated mid-viewport on every public page** — `.hdr` was pinned at `top: var(--util-height)` on the assumption that the "Under construction" banner sat above it, but that banner only renders when Online Sales is *off*. With the shop enabled the header stuck 52px down while content scrolled through the gap above and behind it. The header now sticks at `top: 0` and the notice banner is no longer sticky, removing the coupling. In-page sticky panels (product gallery, checkout summary) use a `--sticky-offset` derived from the header height instead of a hardcoded `96px`.

### Changed

- **No em dashes in UI copy** - staff dashboard, public site, and customer-facing emails/API messages use plain hyphens instead of `—` / `–`.
- **Staff customer API is service-ready** — customer payloads include `is_active` / `email_verified`; create assigns the Customer group; URL pk is the user id; delete soft-deactivates; `POST …/reactivate/` and `POST …/send-sign-in-link/` cover the common CS actions. Conversation list can filter by `customer` and search linked account names/emails.
- **Listing Studio sections share a baseline** — Details pairs with Shop preview and Photos with Facebook Page in two equal-height rows, so card bottoms line up on desktop. Preview shows the cover photo (or a dashed placeholder) and clamps the description so the side panels read evenly.
- **To list: quick Remove with confirm** — Waiting items get Remove (confirm → back to on shelf via `POST /api/webstore/work-queue/<id>/remove/`). Drafts get Remove (confirm → delete draft). Neither is a silent click.
- **Listings catalog table rebuilt** — Catalog rows now show a thumbnail, title + SKU/category, status, price, qty, **Facebook** (Posted / Not posted with last listed date; Posted links out when a URL exists), and glanceable Updated. Filters add All FB / Posted / Not posted (`fb_posted=0|1` on the listings API). Debounced search.
- **Customers Messages filters stay put** — toggling Needs reply / Has hold / etc. no longer blanks the panel into a loading screen. Conversations keep the previous page on screen (`keepPreviousData`), cache for 20s, and prefetch the other filter buckets so switches feel instant.
- **Customers unread badges no longer clip** — the Messages tab count and row unread pills were sheared by Tabs/DataGrid `overflow: hidden`. Tabs allow the badge to sit above the label, and unread counts render as a compact pill with overflow visible on the leading column.
- **Holds is mobile-first on phones** — below the `md` breakpoint (same cutover as the sidebar drawer), Needs / Ready / Completed / Released switch from DataGrid to field-app style card rows (large tap targets, status + pickup code up front, whole-row open). The hold detail opens as a bottom sheet with a grab handle and safe-area padding instead of a right drawer. Tabs scroll with shorter labels, Messages stacks list → thread with a back control (no side-by-side), and filter/search controls go full width. Desktop grids and the right drawer stay as they were.
- **Hold date columns are glanceable** — Requested, Expires, Released, and Completed show Today / Tomorrow / Yesterday (or a weekday) on the first line and the clock on the second, colored by urgency: Expires turns amber for today, blue for tomorrow, and red when overdue, with a short countdown on today's deadlines. Times use the America/Chicago store calendar.
- **Hold Status hover shows the full action timeline** — reservation list rows now include a compact `timeline` (event label, who, when, optional note). Hovering the Status chip on Needs action / Ready today / Released opens a panel with every step from request through pull, ready, complete, or release — so staff can see history without opening the drawer.
- **Hold drawer actions match the floor workflow** — Actions are split into Prepare (Pull item, Mark ready, Decline) and At pickup (Complete, Extend, Cancel, No-show). Steps that are already done disappear: Pull after confirmed, Mark ready after ready, Decline once pulling has started, and No-show only once the customer was expected. Buttons are large and color-coded inside a bordered Actions card. Timeline lists every event with a staff-facing label, who did it (customer / staff name / system), and the date/time.
- **Sidebar says when a customer is waiting** — the Customers nav row carries a count of threads awaiting a staff reply, so unanswered mail is visible from any page instead of two clicks deep. Counts come from `hooks/useNavBadgeCounts.ts` keyed by nav item id, so a new badge needs no navigation changes, and the query is gated on the Online Sales workspace being visible so staff who cannot open the page never poll it. The Customers Messages tab reads the same number: the paginated `count` of threads needing a reply, not a sum of page one, which silently undercounted past 25 threads.
- **Online Sales navigation trimmed to what exists** — dropped six catalog entries (`onlineSalesQueue`, `onlineSalesInbox`, `onlineSalesMarketing`, `onlineSalesSales`, `webStore`, `webOrders`) that pointed at routes which only redirect and appeared in no sidebar group. The redirects stay in `App.tsx` so old bookmarks keep working; the catalog is once again only links the sidebar shows. The Listings tab now lives in the URL (`?tab=tolist`) like the Holds page, so refresh, bookmark, and back all land where you were. `frontend/src/navigation/README.md` had drifted — it listed workspaces that were renamed and pages that had moved — and now matches the real layout.
- **Online Sales looks like the rest of the dashboard** — the area was assembled panel by panel, so each tab invented its own status chips, date format, filter controls, and grid chrome, and every grid trailed a paragraph of grey instructions. Presentation now lives in one place (`frontend/src/pages/online-sales/presentation.tsx`): hold, thread, and listing chips with counter-facing labels (`Needs pull`, `Pulling`, `Ready`, `Awaiting email`) instead of raw snake_case, one datetime format, shared borderless grid styling, and centered empty states that read as calm rather than broken. Filters are consistent — debounced search plus `ToggleButtonGroup` buckets rather than hand-rolled button rows — money uses `formatCurrency`, guidance moved into page subtitles and one caption per tab, Completed gained a summary card, Messages gained thread search and a structured read/reply pane, and the hold drawer gained a proper toolbar header with the pickup code as its own block. Listing Studio is organised into titled cards, its readiness warnings are a list, and Mark sold / Archive / Delete moved behind an overflow menu so nothing destructive sits beside Publish.
- **Local email sends for real** — `.env` now carries the `MS_GRAPH_*` block, so dev exercises the true verification flow through the `retail@ecothrift.us` mailbox while `ONLINE_SALES_PUBLIC_BASE_URL` keeps every emailed link pointed at `localhost:5174`. Set `MS_GRAPH_ENABLED=false` for console-only output. `msal` (already in `requirements.txt`) is required in the venv.
- **`walk_online_sales_demo`** — reads the magic-link token from `MagicLinkToken` and asserts the API does *not* return it, standing in for the customer clicking the emailed link.
- **Heroku env sync** — new `--check-drift` flag reports Config Vars present on Heroku but absent from `.envprod`. The sync only ever sets keys, never unsets, so vars added directly on Heroku were invisible. First finding: `VITE_API_URL` is set in production but read by nothing.
- **Customer History says Picked up / Ended** — filters and chips no longer say "Released"; declined, cancelled, and expired holds are **Ended**. History defaults to the last 90 days plus every picked-up hold, with older ended holds behind "Show older"; Messages keeps open and unread threads and folds settled ones away after 90 days. The History tab badge counts what the list actually shows.
- **Homepage restructure** — the first band is Intro + Featured online items side by side, then Visit, then Footer, so the page reads like a storefront instead of a brochure. The intro states plainly that most stock is on the retail floor and a handful of special items are online. Visit strip is compact (map + live hours + phone + directions + pickup note + reviews) and vertically centered in the band between the intro rule and the footer on taller viewports. Blog card excerpts clamp to two lines on `/blog`. "Sell to us" is deferred until real consignment terms exist.


## [2.68.0] — 2026-08-04

User-facing theme: **Reopen a released hold** — staff can put a cancelled, declined, or expired hold back in play without asking the customer to start over, and only when the item is genuinely still available.

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md).

### Added

- **Reopen action** — `POST /api/webstore/reservations/<id>/reopen/` returns a released hold to Approved. Requires an internal note, re-checks that the listing is published and has enough left, and re-reserves the quantity under lock. Refuses outright on completed sales, since inventory already moved.
- **Reopen lands on Approved, not Ready** — staff must pull the item and mark Ready again, so "Ready" keeps meaning the item is physically on the shelf.
- **Customer comms** — `send_hold_reopened` email plus a system message saying the hold is active again and not to come in until Ready. The `reopened` event shows on the customer timeline as "Hold reopened"; the internal note never does.
- **Dev tooling** — `manage.py purge_online_sales` clears all Online Sales records (dry-run by default, DEBUG-gated) and leaves inventory Items intact.

### Changed

- **Hold drawer** — shows Reopen for released holds, and surfaces the server's refusal verbatim so "only 0 available" is visible instead of a generic failure.
- **Prod pull script** — `0_pull_prod_to_local.bat` now rebuilds the `pg_trgm` extension and the two trigram search indexes that `DROP SCHEMA CASCADE` removes, then runs `migrate`.

### Fixed

- **Stale test assertion** — the confirm system-message test still expected the pre-v2.67 wording ("confirmed" rather than "approved").

## [2.67.0] — 2026-08-04

User-facing theme: **Hold clarity + consolidation** — customers see a plain-language timeline (Approved → Ready → Picked up) and when to come in; staff work holds from one page with notes and required decline/cancel reasons; Online Sales nav shrinks to Listings + Holds.

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md).

### Added

- **Hold vocabulary** — `hold_status.customer_view` maps DB statuses to stage / customer_status / headline / next_step / can_pickup / tone; public hold payload exposes timeline (staff notes filtered out).
- **Release reasons** — `Reservation.release_reason`; decline/cancel require a reason; shown to the customer and recorded on `ReservationEvent`.
- **Staff notes** — `POST /api/webstore/reservations/<id>/notes/` appends internal `kind=note` events (never public).
- **Emails** — `send_hold_ready` on stage; `send_hold_released` on decline/cancel/expire.
- **Public UI** — Hold status banner, step tracker, ready-to-pick-up callout, terminal reasons; Account/Checkout copy aligned.
- **Staff UI** — Shared `HoldDetailDrawer` (Approve / Mark Ready / reason dialog / notes); `/online-sales/holds` with Needs action / Ready today / Completed / Messages.

### Changed

- **Staff nav** — Online Sales is two items: Listings (Catalog + To list) and Holds. Redirects: `/online-sales` and `/marketing` → listings; `/inbox` → holds; `/sales` → holds?tab=completed; legacy admin web-orders → holds.
- **System messages** — Approved / Ready copy tells customers not to come until Ready.

## [2.66.0] — 2026-08-04

User-facing theme: **Sales log detail** — completed online holds get a real event timeline, a click-through drawer, and a usable grid (currency, range/search, totals, POS link).

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md).

### Added

- **Webstore / ReservationEvent** — Append-only hold history (requested → verified → confirmed → staged → extended → completed / declined / expired / cancelled), written fail-soft from reservation services; backfill from existing timestamps.
- **API** — `GET /api/webstore/reservations/<id>/detail/` (reservation + events + thread); `sales-log` supports `?days=` and `?search=` (cap 500).
- **Staff UI** — Sales log range filters, search, totals strip, formatted money, POS chip, row detail drawer (timeline, notes, messages, Open in Inbox).

### Changed

- **Sales log scope note** — Still read-only and no exports; fees/contribution columns (present since v2.62) plus a contribution totals strip are intentional vs the earlier “no contribution math” gap wording.

## [2.65.0] — 2026-08-04

User-facing theme: **Verified holds + optional-password customer accounts** — a hold or question reaches staff only after the email is proven; passwords stay optional.

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md) (**G8 revised**).

### Added

- **Accounts** — Magic-link purposes (`sign_in`, `verify_email`, `verify_hold`, `verify_thread`, `reset_password`); `CustomerProfile.email_verified_at`; customer lookup / register / set-password / reset-password / resend-verification; `has_password` + `email_verified` on `/api/auth/me/`.
- **Holds / questions** — `pending_verification` reservation status (stock reserved, staff-hidden) and conversation state; confirm-email + resend endpoints; 30-minute auto-release; unverified inquiry purge after 24h.
- **Public site** — Email-first sign-in (password, magic link, or create account); `/verify`; hold status “Confirm your email”; Account add-password / verify-email cards.

### Changed

- **G8** — Accounts remain optional, but a **verified email is mandatory** before a hold or question reaches staff. Signed-in verified customers skip the confirm step.
- **Scheduler (manual)** — Run `expire_online_holds` **every 10 minutes** (was hourly) so 30-minute pending holds cannot sit on reserved stock for up to ~90 minutes.

## [2.64.0] — 2026-07-31

User-facing theme: **Microsoft 365 Graph mailbox (dormant)** — two-way mail for Online Sales + Admin retail inbox; ships with `MS_GRAPH_ENABLED=false`.

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md). Setup: [`.ai/reference/online_sales_mvp/email_setup.md`](.ai/reference/online_sales_mvp/email_setup.md).

### Added

- **Mailbox / Graph client** — New `apps/mailbox/`: MSAL client-credentials, cached token, `GraphMailClient`, `GraphEmailBackend`, `check_ms_graph`, `sync_ms_mailbox`. Settings `MS_GRAPH_*` with kill switch.
- **Mailbox / models** — `MailMessage`, `MailSyncState`, `EmailTemplate` (seeded hold/reply starters). Outbound Online Sales mail stamps `X-Eco-Thread` + `[ETO-…]` subject marker; inbound classification (header → subject → sender → general).
- **Mailbox / staff UI** — Online Sales Inbox Messages tab template picker; Admin-only **Retail inbox** (`/admin/retail-inbox`) with list/read/reply via `RichTextEditor` email variant, auto signature, server-side HTML sanitize, Refresh now.
- **Docs** — Entra app + Exchange RBAC-for-Applications scope to `retail@` only (no org-wide Graph mail grant; no SPF change).

### Changed

- **Email** — When Graph is enabled, Django `EMAIL_BACKEND` routes existing webstore/password-reset senders through M365; when disabled, console fallback (unchanged local/dev behavior).

## [2.63.0] — 2026-07-31

User-facing theme: **Listing Studio polish + shared rich-text editor** — hand-entry ready; TipTap reusable across the dashboard.

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md).

### Added

- **Online Sales / Listing Studio** — Photo reorder and alt text; delete listing (blocked when active holds); manual Mark sold; work-queue dedupe (`existing_listing_id`); config-driven public preview URL (`public_base_url` on `/api/webstore/config/`).
- **Shared / RichTextEditor** — TipTap extracted to `frontend/src/components/common/RichTextEditor/` with `variant="blog" | "email"` and injectable `uploadImage`. Blog Studio consumes it unchanged.

### Fixed

- **Online Sales / publish gate** — PATCH/create cannot set `status=published` or `sold`; use dedicated `publish` / `mark-sold` actions so readiness is enforced.

### Removed

- **Legacy / WebStorePage** — Dead admin page removed; routes already redirected to Online Sales listings.

## [2.62.0] — 2026-07-31

User-facing theme: **Online Sales MVP (parked)** — staff workspace live; public shop/holds gated by `ONLINE_SALES_ENABLED=false` until owner flip.

Initiative: [`online_sales_mvp`](.ai/initiatives/online_sales_mvp.md).

### Added

- **Online Sales / staff workspace** — Slot C nav: Work queue, Listings, Inbox (holds + messages + ready-for-pickup), Sales. Listing Studio create/edit/publish. Legacy `/admin/web-store` and `/admin/web-orders` redirect.
- **Online Sales / public surface** — Shop, hold status, ask-about-item, hold list, gated by `GET /api/webstore/config/` (`ONLINE_SALES_ENABLED`). Hold status by token stays reachable when the flag is off.
- **Online Sales / Messages** — `Conversation` + `Message` models; staff Inbox Messages tab; public thread on hold page; `POST /api/webstore/threads/<token>/messages/` and `/read/`.
- **Online Sales / system email** — Sign-in link, hold confirmed, you have a reply (From `Eco-Thrift <retail@ecothrift.us>`). Console backend locally; M365 Graph planned for two-way mail.
- **Online Sales / customer accounts** — Magic-link (`ONLINE_SALES_ACCOUNTS_ENABLED`), `Customer` role, `/account` My requests / My messages, guest claim by email.
- **Online Sales / ops commands** — `expire_online_holds` (confirmed/ready + 48h untriaged requests), `seed_online_sales_hours`, `seed_online_sales_demo`, `check_email_config`, `walk_online_sales_demo`.
- **Online Sales / settings** — `ONLINE_SALES_INQUIRIES_ENABLED`, `ONLINE_SALES_ACCOUNTS_ENABLED`, `ONLINE_SALES_REQUEST_TRIAGE_HOURS`, `ONLINE_SALES_PUBLIC_BASE_URL`, `ONLINE_SALES_EMAIL_*`.

### Fixed

- **Accounts / forgot-password** — Reset token no longer returned when `DEBUG=False` (was a staff account-takeover path).
- **Accounts / refresh cookie** — `secure=not DEBUG`; login and forgot-password throttles.
- **Online Sales / kill switch** — Public catalog and hold create return 410 when the flag is off.
- **Online Sales / unread** — GET hold status no longer clears `customer_unread` (explicit mark-read POST).
- **Online Sales / pickup tab** — Ready-for-pickup filter is day-scoped (`isTodaysPickupRow`).
- **Online Sales / holds** — Idempotency scoped to active + matching email; cache-backed hold/message rate limits.

### Changed

- **Public site copy** — Hold-list language; reserved badge; policy copy guard test.
- **Auth** — Staff routes reject `Customer` role.

### Documentation

- `.ai/reference/online_sales_mvp/` — overnight log, audits, email setup, staff SOP draft, demo script, self-review.
- Heroku Scheduler: hourly `expire_online_holds` (see `.ai/extended/development.md`).

## [2.61.0] — 2026-07-29

User-facing theme: **Orders summary strip + dashboard polish** — full table metrics on the PO cards, uniform department grids, QA wizard crash fix.

Initiative: [`retail_qa_submission_reliability`](.ai/initiatives/_archived/_completed/retail_qa_submission_reliability.md).

### Added

- **Inventory / Orders summary** — Seven uniform two-line KPI cards: Trucks in Transit (shipped count + cost), Items (+ pallets), Cost/EST REC, Retail/PRC, Priced/MFT, Sold/7d, Profit/ACT REC. `GET /orders/summary/` adds `in_transit_count`, `in_transit_cost`, `pallet_count`, `sold_last_week`, `priced_retail`.

### Fixed

- **POS / Quality Audit wizard** — Opening an audit no longer blanks the page (`useBlocker` requires a data router; app uses `BrowserRouter`). Leave guards stay on Exit confirm + `beforeunload`.
- **Dashboard / department grids** — Scroller shows exactly two week rows (same footprint as before); extra weeks scroll underneath and snap back to the top on leave.

### Changed

- **Dashboard / department cards** — Removed per-card status captions; fixed metrics band and grid geometry so dividers and week cells align; only font size flexes for longer values.
- **Inventory / Orders ratios** — EST REC / ACT REC use recovery bands (&lt;100 dark red → 150 → 200 dark green → 250+ bright green). MFT keeps the break-even-at-100 scale. Column hover tooltips kept only on Order # and Description.

## [2.60.0] — 2026-07-29

User-facing theme: **Retail QA reliability + dashboard deep links** — stranded audits recovered, drafts resumable, 8-week department grids, mobile dashboard overhaul.

Initiative: [`retail_qa_submission_reliability`](.ai/initiatives/_archived/_completed/retail_qa_submission_reliability.md).

### Added

- **Dashboard / Retail QA deep links** — Day cells with submitted audits open that audit (Manager+); multi-audit days offer a picker. Metrics payload adds `retail_audit_ids` and `retail.form_slug`.
- **Dashboard / 8-week department grids** — All four department cards load 8 weeks of history in a fixed-height scroll area (`GET /api/pos/dashboard/metrics/?weeks=`, default 8, clamped 2–12).
- **POS / `finalize_stranded_qa_audits`** — Management command to finalize complete draft audits (dry-run default; `--apply`, `--ids`, `--database`).

### Fixed

- **POS / Retail QA submission** — Drafts are visible and resumable on the Quality Audit hub; the wizard autosaves, persists on section jumps, pins Submit in the sticky footer, and warns before leaving a fully answered but unsubmitted audit. Untouched photo/chips checks no longer auto-answer. Week audit counter includes off-schedule days. Plus/minus grade bands so goals like `B+` are achievable.
- **Dashboard / mobile** — Department grids stay inline on phones with readable fonts and 44px touch targets; weekly sales book uses the accordion list through 900px; sales chart no longer forces horizontal overflow; department cards go 2-up until `lg`.

### Changed

- **Inventory / Orders list** — Two-line cells with named ratios: Order # adds vendor · condition (Cond column removed), Cost adds **EST REC** (priced ÷ cost), Retail adds **PRC** (priced $ vs manifested retail), Priced adds **MFT** (listing retail on priced items vs manifested retail), Profit adds **ACT REC** (sold ÷ cost, recovery banked so far), Items adds pallet count, Sold adds last-7-day revenue. The three 100%-is-break-even ratios (EST REC, MFT, ACT REC) share one color scale (&lt;75/85/90/95/100 → bright green over 100%); PRC stays neutral. Money primaries read as a progression — cost dark red, retail near-black, priced dark green, sold lighter green. Zero-value secondary lines are suppressed. Order # is abbreviated to its first and last dash-delimited segments (`TRGET-ORD-G511` → `TRGET…G511`, or first 3 / last 4 characters when undashed) with the full value on hover. `page-metrics` adds `sold_last_week` and `priced_retail`.
- **Inventory / Orders list layout** — Column widths are budgeted from worst-case content with tabular numerals; Description is the only flex column so money columns stay pinned right, and a `ResizeObserver` on the grid drops Priced → Sold → Retail → Profit → Cost only when the measured width cannot fit them (replaces viewport breakpoints, which ignored the sidebar).
- **Dev scripts** — `scripts/dev/` is three starters: `start_dashboard.bat`, `start_mobile_dashboard.bat`, `start_website.bat`. Removed `start_mobile_vite.bat`, `kill_servers.bat`, `seed_delivery_test_dataset.bat`, `reset_intake_test_env.bat`.
- **POS / QualityAudit** — `updated_at` field (migration `pos.0025`); draft DELETE allowed; list `limit` query param.

## [2.59.1] — 2026-07-28

User-facing theme: **Delivery Desk run-sync safety** — assign-day blocked when freight is loaded or en route; restore re-queues the archived stop.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md).

### Fixed

- **POS / assign-day guard** — `POST /deliveries/{id}/assign-day/` refuses to move a delivery to another day once its stop is loaded or its run is en route (400 `ASSIGN_DAY_BLOCKED`), matching the reschedule guard; the job is no longer re-dated before the check.
- **POS / restore after archive** — Restoring an archived delivery re-queues the run stop that archive failed (`sync_job_onto_open_run(..., requeue_inactive=True)`), so it reappears on the live route instead of only looking scheduled on the Desk.

## [2.59.0] — 2026-07-28

User-facing theme: **Delivery Desk production add/adjust** — create from past sale, day-detail adjust/cancel, real route maps, change history, shared Delivery tokens.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md) Phase 5B–5C (function-first, then unification).

### Added

- **POS / Desk Add delivery** — Mounted `AddDeliveryDialog` on Desk Total and Day detail; past-sale create via audited `POST /deliveries/` with `cart_id` / `cart_line_ids`.
- **POS / Desk adjust** — Day detail planning rows open `DeliveryDetailsModal` for notes, contact, append-address, reschedule, run-aware cancel, and manager item add/remove (`POST /deliveries/{id}/items/`, `…/items/{itemId}/remove/`).
- **POS / Desk day create + edit** — `DeskDayDialog` for date, window, crew, driver, notes, and planning disposition from Days list and Day detail.
- **POS / change history** — `GET /delivery-days/{id}/history/` and `GET /deliveries/{id}/history/` serialize `DeliveryChangeEvent` into a human-readable timeline (`DeliveryHistoryPanel`) on Desk Day detail and the details modal.
- **POS / real route map** — Routes API `encodedPolyline` persisted in `run.route_summary` and rendered as a cached server-side Static Map (`GET /delivery-days/{id}/route-map/`, `delivery_route_map.py`) on Desk live monitor, Field day preview, and the Field Routes header; the decorative MiniMap is gone.
- **POS / upload progress** — Byte-level photo upload progress (axios `onUploadProgress`) drives the run busy bar and the evidence button ring.
- **POS / shared Delivery theme** — `frontend/src/theme/deliveryTheme.ts` with phone/desktop density; Field re-exports from it.

### Changed

- **POS / assign-day + archive** — Sync onto open runs (`sync_job_onto_open_run` / `cancel_job_with_run_sync`); Desk Day detail uses card planning rows instead of a bare jobs table.
- **POS / Desk chrome** — Days, Total, and live monitor restyled onto shared Delivery tokens.
- **POS / Field step sync** — The run only auto-follows the server phase when the driver is already at the live edge; stepping back keeps position and offers a “Live: …” jump chip (`resolveUiStepSync`).
- **POS / Field stop card** — Primary action pinned outside the card scroll area; stop selection freezes while a mutation is in flight; Call shows a parsed phone extension.
- **POS / SignaturePad** — Rotation and resize letterbox existing ink instead of stretching it.

### Fixed

- **POS / stale cart tests** — `test_cart_totals`, `test_cart_add_item_audit`, and `test_cart_add_resale_copy` create Items through `Product` (the `Item.title` field is long gone); `test_dashboard_metrics` no longer future-dates audits or collides with the migration-seeded retail goal. `apps.pos` is green again (176 tests).

### Removed

- **POS / legacy driver wizard** — `DeliveryDayBoard`, `DeliveryDayCard`, `DeliveryCardPhaseActions`, their orphaned `usePOS` hooks, and 16 unused delivery API clients.

## [2.58.0] — 2026-07-28

User-facing theme: **Delivery Field polish** — hold-to-complete, off-route membership, camera-first reseal, compact Routes, device-path fixes, honest test-data scoping.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md) Phase 4A–4C.

### Added

- **POS / camera-first seal** — Seal/Reseal opens the camera when the seal-window photo is missing; reopen truck requires a fresh seal photo (`truck_reopened_at`).
- **POS / off-route membership** — Confirmed stops can leave and re-enter the route via drag-and-drop or one-touch toggle (`excluded_unconfirmed_at`); serialize `off_route` / `off_route_reason`.
- **POS / hold-to-complete** — Press-and-hold stop completion that does not fight card swipe paging (`FieldHoldToComplete`); window-level release cancel + pending guard.
- **POS / evidence-in-buttons** — Proof, signature, and issue thumbnails live inside their capture buttons (tap thumb → viewer; rest of button retakes).
- **POS / zig-zag seed** — Scenario v6: five Omaha Today stops, one item each, intentionally suboptimal order for Optimize demos.

### Changed

- **POS / Field Routes UI** — Compact one-line expandable ETA header; footer icon row (Optimize / Maps / Add N); Undo snackbar after reorder (replaces Restore optimized order); collapsible Off-route section; compact row density.
- **POS / stop completion** — `complete_stop` stamps `delivered_at` when unset; Field no longer requires a separate “Items handed to customer” tap.
- **POS / test-data lists** — Desk/Field list queries send `include_test=1` only in Vite `DEV` builds so production never asks for QA rows.
- **POS / Routes API** — Omit past `departureTime` (INVALID_ARGUMENT); conditional optimized-waypoint field mask.
- **POS / Field safe area** — `viewport-fit=cover` + run shell `100dvh`; bottom inset only on the step rail so iPhone home indicator no longer overlaps chrome.
- **POS / Field pager taps** — Call/Text/Navigate no longer lose the first tap to a 10px swipe lock; only past the swipe dead zone suppresses the click.
- **POS / Field outbox** — Single-flight drain; also drains on focus/visibility; retake of the same file works; hold label says “Proof uploading…” when evidence is queued.
- **POS / SignaturePad** — Mid-stroke iOS toolbar resize no longer wipes ink; save guard; single-pointer drawing.
- **POS / barcode scanner** — Camera restarts after app backgrounding; Type SKU stops the camera LED.
- **POS / Call/Text** — Disabled with “No phone” when the stop has no digits; iPadOS desktop Safari uses the iOS SMS `&body=` separator.

### Removed

- **POS / Field chrome** — Unused `FieldSlideToComplete`, `FieldStageHeader`, and `FieldBottomShortcuts` (step rail + `FieldListBottomNav` own chrome).

## [2.57.0] — 2026-07-24

User-facing theme: **Delivery Phase 3** — Google Routes API optimization/ETAs, configurable unload time, Field route/evidence polish, Desk route monitor, legacy board retired.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md).

### Added

- **POS / Routes API** — `computeRoutes` + `computeRouteMatrix` replace Directions/Distance Matrix; traffic-aware ETAs, honest `provider` / `fallback_reason`, optimized-order snapshot.
- **POS / unload setting** — `AppSetting` `delivery_service_minutes_per_stop` (default 20) on Admin → Assumptions; ETA totals = drive + unload × stops.
- **POS / Field Routes** — Depart/finish/total header, per-stop ETA + drive, always-available Optimize, late-confirm insert support.
- **POS / Field evidence** — Signature PNG + outbox, proof/issue capture + viewer/replace, iOS/Android SMS templates with ETA.
- **POS / Desk live monitor** — Route/ETA panel, pending media, exception list, completed evidence (signatures/overrides/return issues), manager Optimize.
- **POS / manager force-finish** — Available in Field Finish after return-to-store (reconcile may still be forced with reason).

### Changed

- **POS / insert preview** — One route-matrix call + cheapest-insertion math (no N+2 provider loop).
- **POS / ETA refresh** — Hold/release recalculate remaining ETAs.
- **POS / legacy board** — `/pos/deliveries/legacy` redirects to Desk/Field entry; unmounted Field stage shell removed.

## [2.56.2] — 2026-07-22

User-facing theme: **Field list bottom nav** — Days / Deliveries / Test as a fixed button bar; shared Include [TEST] across Desk and Field.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md).

### Added

- **POS / Field list bottom bar** — Fixed Days · Deliveries · Test navigation (icons + depressed selected state), matching open-day shortcut chrome; hidden on day-detail/run shell so operational shortcuts stay sole bottom bar.

### Changed

- **POS / Include [TEST]** — One shared preference (localStorage) for Desk and Field; Field Total Deliveries respects it; Desk page switches removed in favor of the compact shared control (Field uses the bottom-bar Test action).

## [2.56.1] — 2026-07-22

User-facing theme: **Field chrome** — viewport Desk/Field, compact Days/Deliveries swap, Start Today unblocked.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md).

### Changed

- **POS / experience routing** — Mobile → Field, desktop → Desk from viewport only; Desk/Field toggle removed.
- **POS / Field chrome** — Dropped wasteful “Delivery Field” headers; Days ↔ Deliveries is a one-tap top-strip swap.
- **POS / Start Today** — Removed stale Phase‑1 “use legacy until Phase 2” banner; Start Today is the normal Field path again.

## [2.56.0] — 2026-07-22

User-facing theme: **Delivery Phase 2** — full-day Field workflow (contact → load → truck → route → drive → return) plus Desk live monitor.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md).

### Added

- **POS / contact truth** — Separate contact attempts (`call_placed` / `composer_opened` / `text_marked_sent`) from stop dispositions; explicit unconfirmed exclusion; legacy `/call/` remains an adapter (`pos.0023`).
- **POS / item execution** — Runtime `DeliveryRunStopItem` snapshots on run start/sync; quantity-aware scans with `client_scan_id`; audited skip/load/photo-exception; `load_item` attachments scoped by `stop_item_id`.
- **POS / workflow gates** — Phase order calls → load → truck → route → active → return; truck closeout; manager departure override; stale `route_revision` → 409; `assert_run_action` on phase/departure transitions.
- **POS / day-scoped run API** — `GET /api/pos/delivery-days/{id}/run/` with contact/load/truck/current-stop monitor aggregates (keeps `start-run/`).
- **POS / Field shell** — Mobile Start Today, sticky timer, stage router, bottom shortcuts (Unconfirmed/Route/Navigate/Current), dirty/outbox guard; stages for contact, load, truck, route, drive/deliver, return.
- **POS / Desk live monitor** — Read-only polling monitor on Desk day detail (no driver wizard).
- **Ops / active-run seed** — `seed_delivery_test_dataset --with-active-run --stage …`; `show` reports contact/load state.

### Changed

- **POS / Field cutover** — Start Today is the normal Field path; `/pos/deliveries/legacy` remains one-release deprecated escape hatch.
- **POS / loading rules** — Candidates may load while replies are pending; departure still requires confirmed/rescheduled/cancelled/excluded resolution plus item+truck evidence (or manager override).

## [2.55.0] — 2026-07-22

User-facing theme: **Delivery Phase 1** — canonical Days + Total Deliveries, separate Desk/Field shells, and production-safe dummy datasets.

Initiative: [`delivery_mobile_operations_completion`](.ai/initiatives/_archived/_completed/delivery_mobile_operations_completion.md).

### Added

- **POS / DeliveryDay domain** — In-place rename of availability → `DeliveryDay` (same table/IDs), normalized job items, stop-item snapshots, quantity-aware scans, change audit, and named `DeliveryTestDataset` ownership (`pos.0020`–`pos.0022`).
- **POS / Days + Deliveries APIs** — Paginated `GET/POST /api/pos/delivery-days/` and `/api/pos/deliveries/` with search, archive/restore, item add/remove, and audited mutations. Legacy `/delivery-availabilities/` and `/delivery-jobs/` remain as compatibility adapters.
- **POS / dummy-data loop** — `seed_delivery_test_dataset`, `show_delivery_test_dataset`, `reset_delivery_test_dataset` (dry-run default; production requires `--allow-production --confirm-dataset KEY --execute`).
- **POS / Delivery Desk + Field** — Separate inactive experiences under `/pos/deliveries/desk/*` and `/pos/deliveries/field/*` (Days + Total Deliveries). Entry redirect at `/pos/deliveries` remembers Desk/Field preference.
- **Ops / migration preflight** — `report_delivery_migration_conflicts` for duplicate dates/runs and related blockers before constraint rollout.

### Changed

- **POS / delivery correctness** — Structured cart-line lineage on board-created jobs; authoritative item quantities; manager-only proof override; completed-day start blocked; safer boolean parsing; successful photo uploads clear the IndexedDB outbox immediately.
- **POS / Deliveries navigation** — Active unified board moved to `/pos/deliveries/legacy` for QA; new Desk/Field pages do not expose Start Today (Phase 2).

## [2.54.0] — 2026-07-22

User-facing theme: **Receiving photo thumbnails, required-photo overrides, and reusable image/CSV viewers**.

Initiative: outside initiatives hotfix (Receiving media performance + manifest preview).

### Added

- **Inventory / Receiving photo variants** — Uploads store a 2048px high-res JPEG plus a 480px thumbnail (target ≤100 KB). UI loads thumbnails by default; click opens full-res in shared **`ImageViewerDialog`**. Migration `inventory.0082`; idempotent backfill `backfill_receiving_photo_thumbnails`.
- **Inventory / Receiving complete photo guard** — Complete requires BOL + truck + four sides per pallet, or one audited per-slot reason via `photo_overrides[]` (`ReceivingPhotoOverride`). Desktop/mobile use **`ReceivingCompleteDialog`**.
- **Shared file viewers** — App-wide **`ImageViewerDialog`** / **`CsvViewerDialog`**; order wrapper **`PurchaseOrderManifestDialog`** on Order detail, Preprocessing, and Processing header.
- **Inventory / manifest preview + download** — `GET …/manifest-preview/` (stored ≤10 rows) and authenticated `GET …/manifest-download/` blob stream.

### Changed

- **Inventory / Receiving + Processing floor pickers** — Shared status set + milestone sort; vendor glyph badge colors encode receiving/processing status.

## [2.53.0] — 2026-07-22

User-facing theme: **Orders profitability dashboard + Retail QA scheduled goals with gold celebration**.

Initiative: outside initiatives hotfix (Orders list redesign follow-on; Retail QA goal schedule).

### Added

- **Admin / Quality Audit history** — Hub lists **all submitted audits** (table on desktop, cards on phone); click **Review** to open a read-only walkthrough of sections + final grade. Submitted list ordered by newest `submitted_at`.
- **Dashboard / Retail QA goals + week grid** — Superusers configure required weekdays, audits per selected day, and minimum letter grade. Daily cells show last grade + count progress; a day succeeds only when **count is met and that day's last submitted grade meets the minimum**. Successful cells turn gold; once every scheduled day in the week succeeds, the full card turns gold with **“Hurray — weekly goal hit!”** (`DashboardDepartmentGoal.schedule`, migration `pos.0019`). Week score remains the **last submitted** grade by `submitted_at` — never average or highest.
- **Inventory / Orders dashboard profitability** — Top strip shows **Cost / Retail / Priced / Sold / Profit**; row selection recalculates the strip; `GET /orders/summary/?ids=` and `GET /orders/page-metrics/?ids=` return authoritative aggregates (shelf history for Priced; completed-cart net of discounts for Sold; Profit = Sold − Cost).

### Changed

- **Inventory / order pickers** — Processing + Receiving dropdowns share one card layout (vendor glyph, bold order #, description, most-relevant date as `DEL · Nov 22, 2026`). Lists sort by delivered → shipped → paid → ordered → id (nulls first); Receiving `for-receiving` uses the same sort; list API exposes `paid_date` / `shipped_date`.
- **Inventory / Orders list (`/inventory/orders`)** — Server-paginated DataGrid with Status, Order #, Description, Dates, Condition, Items, Cost/Retail/Priced/Sold/Profit; no empty leading column or vendor column; URL-backed search/filters (status buckets, condition, date type/range, item count) with active chips. Quick **90–60** (delivered 90–60 days ago), **Last 60** (ordered in last 60 days), **Select visible** (current page), and **Older orders** toggle (default hides POs with no milestone in ~6 months via `include_older=0`). Milestone sort is delivered → shipped → paid → ordered **desc with nulls first**.

## [2.52.0] — 2026-07-21

User-facing theme: **Unified Delivery Day Board** — one persistent board for the full driver day (calls → route → load → drive → return).

Initiative: outside initiatives hotfix (follow-on to [`pos_discount_and_delivery`](.ai/initiatives/_archived/_completed/pos_discount_and_delivery.md)).

### Added

- **POS / unified Delivery Day Board** — One persistent Day Board (no Board vs Driver / wizard split). Same delivery cards stay visible; stage adds inline actions (calls → route → load → drive → return → complete). Card click opens a mobile-first details modal (full-screen on phone, centered dialog on desktop). Run-only timer (not payroll). Guarded stage transitions, report-issue, audited pre-load reschedule (`rescheduled` stop), address ETA recalc, event history (`pos.0014`–`pos.0018`).
- **POS / Add delivery from board** — Manager **Add delivery** modal: pick items from a past POS sale, append inventory SKU/title, or free-text describe; contact + schedule (or schedule later). `POST /api/pos/delivery-jobs/` (no fee line required; syncs onto an open day run).

### Changed

- **POS / Google Maps route** — store return leg + Directions optimize/ETA planning for confirmed stops only (`POST /api/pos/delivery-runs/…`). After day start, route/open-map uses persisted run order; job-address preview only before start.
- **POS / delivery completion** — open-run completion must use stop complete/override (job PATCH `completed` blocked while stop incomplete).
- **POS / delivery card + details layout** — phone gets more room (stacked on mobile; wider field / desktop meta column); Day Board cards use a desktop contact column; details/Add dialogs stay full-screen on phone only.

### Fixed

- **POS / delivery item counts** — Day Board “Items N left” now follows linked sale-line quantities instead of a stale `item_count` from checkout (e.g. one washer showed as 2 left).

## [2.51.0] — 2026-07-21

User-facing theme: **POS deliveries can sell without a date** — schedule later on the Deliveries board with customer text + notes.

Initiative: outside initiatives hotfix (follow-on to [`pos_discount_and_delivery`](.ai/initiatives/_archived/_completed/pos_discount_and_delivery.md)).

### Added

- **POS / schedule later** — terminal **Schedule later (no date)** books the fee without `availability_id`; creates `DeliveryJob` with status `needs_scheduling` (`POST …/add-delivery/`, migration `pos.0013`).
- **POS / delivery notes** — notes on add/edit delivery and on the Deliveries board (`DeliveryJob.notes`).
- **POS / schedule-from-board** — Deliveries warning for unscheduled jobs; Schedule dialog assigns a date; response includes copyable `customer_schedule_message` (“Your delivery has now been scheduled for …”).
- **POS / unscheduled cashier prompt** — after schedule-later add, remind cashier: Saturdays, customer must be home, signature / drop-off rules.

### Changed

- **POS / delivery jobs list** — `needs_scheduling` jobs stay visible alongside date-filtered scheduled work.

## [2.50.0] — 2026-07-21

User-facing theme: **POS discount + delivery scheduling board.** TARS Studio remains available (initiative parked). Online Sales code retained but **disabled** for this release.

Initiatives: [`pos_discount_and_delivery`](.ai/initiatives/_archived/_completed/pos_discount_and_delivery.md) (completed). Parked: [`online_sales_workspace`](.ai/initiatives/_archived/_pending/online_sales_workspace.md); [`tars_full_instruction_wizard_guidance`](.ai/initiatives/_archived/_pending/tars_full_instruction_wizard_guidance.md).

### Added

- **POS / discount + delivery** — terminal **Discount / store credit** (cart or per-line) and **Delivery** (`$50` ≤5 mi / `$75` 5–10 mi) with name, phone, address, Apt?/Unit #, **cart-line multi-select for items**, **scheduled delivery date** (`add-discount`, `add-delivery`; `CartLine.line_kind` + `meta`). Address lookup auto-quotes distance to Eco-Thrift (`/pos/delivery/address-suggest/`) and selects the fee tier (or blocks if over 10 mi).
- **POS / deliveries board** — Cashier **Deliveries** (`/pos/deliveries`): list jobs by date; managers set **available dates** (date, times, who, 1/2-person crew) with booked delivery/item counts (`DeliveryAvailability` / `DeliveryJob`, `pos.0011`); **Open Google Maps route** for a day’s scheduled stops.
- **POS / printables** — Cashier **Printables** hub + browser-print HTML: bilingual appliance warranty/delivery policy, sell log, Saturday delivery driver log (`/pos/printables`, `frontend/public/pos/*.html`).
- **TARS / standalone Studio (available, initiative parked)** — `/restoration/tars` full-screen staff work app (new tab): one header, Inbox / one-item Bench / Pending, Item State, focused actions, Restoration log. Feature work resumes after this release.
- **TARS / durable restoration history** — `RestorationTimelineEvent` preserves attributed valuations, assessments, tests, estimates, decisions, parts, performed work, timers, holds, returns, and disposition (`inventory.0081`).
- **Restorations / valuation requests** — `POST …/request-valuation/`; `valuation_pending` badge + request list on Restorations TO.
- **Online Sales (code retained, disabled)** — Listing Studio / holds / POS guard remain in repo; `ONLINE_SALES_ENABLED` defaults **false**; staff `/online-sales/*` redirects to dashboard; public Shop/holds hidden; `POST /api/webstore/holds/` returns 410 `HOLDS_DISABLED`.

### Changed

- **TARS / incomplete grades** — bench check-in allowed when `needs_setup`; Done still blocked until all grade values are complete.
- **TARS / stop-outs** — no Stops step; unanswered stop-outs treated as clear; only explicit blocked responses interrupt commit.
- **TARS / labor + bench ownership** — one explicit technician-owned Bench item at a time; state-changing work auto-starts labor; header Pause / Resume; HR breaks/clock-out pause server-side; five idle minutes trigger Yes/No with durable idle-time correction.
- **POS / delivery items** — “What is being delivered” is a cart-line multi-select; dialog opens with **no lines selected**.

### Fixed

- **POS / terminal cart** — cart panel fills leftover viewport with a dedicated line list scrollbar; subtotal/tax/total stay pinned at the bottom; after add / qty bump / manual / resale / line edit, the affected line scrolls into view (`TerminalPage`). QA SKUs: [`.ai/reference/pos_terminal_cart_scroll/testing_skus.md`](.ai/reference/pos_terminal_cart_scroll/testing_skus.md).
- **POS / action tiles** — Pink tag, Discount, and Delivery use square action tiles (icon + label) instead of plain outlined buttons.
- **TARS / tests** — Processing check-in with incomplete grades expects `needs_setup`; grade-scale list seeds deterministically under `--keepdb`.

### Documentation

- **Online Sales parked** — contract remains in [`.ai/reference/online_sales_workspace/phase_0_contract.md`](.ai/reference/online_sales_workspace/phase_0_contract.md); initiative under `_archived/_pending/`.
- **POS / terminal cart scroll QA** — seeded `POSTEST##` items + scenarios in [`.ai/reference/pos_terminal_cart_scroll/`](.ai/reference/pos_terminal_cart_scroll/README.md); `seed_pos_terminal_test_items`.
- **TARS / standalone Studio contract** — [`.ai/reference/TARS Restoration Processing App/standalone_studio_contract.md`](.ai/reference/TARS%20Restoration%20Processing%20App/standalone_studio_contract.md); initiative parked under `_archived/_pending/`.

---

## [2.49.0] — 2026-07-13

User-facing theme: **Processing Restorations hub (TO/FROM) plus TARS guided-decision MVP; Wizard UX A+ is next.**

Initiative: [`.ai/initiatives/tars_full_instruction_wizard_guidance.md`](.ai/initiatives/tars_full_instruction_wizard_guidance.md).

### Added

- **Processing / Restorations hub** — `/inventory/restorations` replaces Restoration Returns: **TO** setup (grade scale/values + handoff after dispatch) and **FROM** desk (one loud list for Worked + Untouched with rich decision panel). Processing restoration check-in creates the job and navigates to TO setup with Back.
- **Restoration / Guided decision** — `/restoration/tars` now guides and autosaves Processing handoff review, mandatory stop-outs, condition/completeness, structured tests and unknowns, viable grade/sale-state paths, authoritative contribution-per-labor-minute comparisons, recommendation, and the selected grade/action/reason.
- **Processing / Restoration handoff** — sending an item to Restoration records explicit tested status plus optional condition evidence, unknowns, and quick-test results; the handoff remains read-only in TARS and survives split/requeue independently of Mike's mutable work session.

### Changed

- **Processing / restoration dispatch** — grade values are no longer required at check-in; incomplete jobs stay `needs_setup` until Restorations TO setup (TARS bench check-in still blocked).
- **Restoration / returns list** — includes untouched returns and desk summary fields (`from_family`, `work_verbs`, `unit_kind`, `sale_state`, `decision_reason`); mark-handled accepts untouched.
- **Nav** — Processing **Restorations** replaces **Restoration Returns**; Restoration workspace drops orphaned Queue nav (TARS Studio Inbox remains).
- **Restoration / completion guardrails** — selected decisions remain synchronized with the existing grade/parts/Done lifecycle. Ordinary missing evidence requires an identified override reason; mandatory legal/prohibited/handling/truthful-disclosure stop-outs cannot be cleared by the economic score.

### Documentation

- Initiative next gate: **Phase 1.5 Decision Wizard UX A+** (owner graded current wizard D/F); Phase 2 catalogs blocked until that pass unless reordered.

---

## [2.48.3] — 2026-07-20

User-facing theme: **Blank-retail rows get AI MSRP estimates; review can filter and fill missing prices; processing opens paid/shipped orders.**

### Added

- **Inventory / AI cleanup** — when manifest `unit_retail` is blank, the model may output `est_retail` (MSRP claim); staging `unit_retail` is filled and the leashed scaler formula still prices the row (`apps/inventory/services/ai_cleanup.py`).
- **Preprocessing review** — **Missing price** chip filter and **Set missing** bulk fill for unpriced filtered rows (`PreprocessingReviewTable`).

### Fixed

- **Inventory / undo AI cleanup** — rewind clears AI-filled staging retail back to manifest blank (and manifest-less rows tagged with `ai_status.pricing.est_retail`) before wiping `ai_status`.
- **Processing workspace** — PO picker and entry redirect include **paid** and **shipped** (staff often prep before the order is marked delivered).

---

## [2.48.2] — 2026-07-09

User-facing theme: **Replacing a Label Studio background no longer reverts to the previous image after Save.**

### Fixed

- **Label Studio / background replace** — media proxy uses `Cache-Control: no-store` and clients fetch with `?v=<s3_file_id>` so a new upload is not served from a cached response for the stable `…/media/background/` path.

---

## [2.48.1] — 2026-07-09

User-facing theme: **Label Studio backgrounds load on production; Settings shows print-server 1.4.1.**

### Fixed

- **Label Studio / media proxy** — staff `GET …/media/{background|pdf_file}/` always streams bytes through Django instead of 302 to presigned S3, so authenticated axios `arraybuffer` fetches work on `dash.ecothrift.us` (cross-origin S3 bodies were blocked). Fixes blank backgrounds and PDF print after save/reload.
- **Print server release on prod** — registered **1.4.1** in Heroku Postgres (`publish_printserver`); Settings download link was still **1.2.38** because `distribute.py` only writes the local DB.

---

## [2.48.0] — 2026-07-09

User-facing theme: **Label Studio — design, AI-assist, save, and print custom labels (PDF or template) × N.**

Initiative: [`.ai/initiatives/_archived/_completed/custom_label_studio.md`](.ai/initiatives/_archived/_completed/custom_label_studio.md).

### Added

- **Admin / Label Studio** — **`/admin/label-studio`** library (Manager+): **PDF labels** (S3 upload, print × N) and **template labels**. New backend app **`apps.labels`** (`CustomLabel`, validated `definition` JSON, uploads, staff media proxy, soft archive, **duplicate**, **restore**) at `/api/labels/`.
- **Label Studio designer (Phase 2)** — full-page **`/admin/label-studio/:id`**: drag text/QR/Code128 on an aspect-correct mono canvas, variables rail, properties panel, background upload, 5% snap; New Template creates then opens the designer. PDF edit stays a dialog.
- **Template elements** — definition schema supports `text` (optional **bold**), **`qr`** (ecc L/M/Q/H, square `w_pct`/`h_pct`), **`barcode`** (Code128, `show_text`); client renderer uses `qrcode` + `jsbarcode` at 203 DPI for preview and print.
- **AI Create for me (Phase 3)** — designer dialog: LLM proposes validated `definition` JSON (`AI_MODEL_LABEL_STRUCTURE`); xAI Grok Imagine generates a monochrome background preview (`AI_MODEL_LABEL_IMAGE` → `/v1/images/generations`); user must **Apply** / **Use as background** before Save. Endpoints: `POST …/ai/propose-structure/`, `POST …/ai/generate-background/`.
- **Variables + increment** — designer variables are **Name** + **Default** (text) or **Start / Step / Format** (increment). Element Source picks a variable by Name (preview uses default or Name). Print: text fields + per-increment start/step + Qty; when any increment exists, each copy is rasterized separately (`start + i × step`).
- **Label Studio final polish** — zero-training workflow: saved/unsaved status + leave protection; visible draft background/definition exactly matches print; starter template, selectable/layered element list, keyboard nudge, delete/AI-replace confirmations; exact print thumbnail with increment copy browsing, examples, printer health/progress/partial-failure recovery; library search, archived view + restore, PDF-create guard, and friendly errors.
- **Print server 1.4.0 / 1.4.1** — `POST /print/image-copies` and `POST /print/pdf-copies`; **1.4.1** adds payload/page/raster bounds and exact-size template rasters (`fit_to_printable=False`); **distributed** 2026-07-09 (`PrintServerRelease` current **1.4.1**).

### Changed

- **Label Studio harden (Phase 4)** — orphan `label-studio/` S3 media purge (24h grace; soft-archived labels still protect FKs); Manager+ permission coverage on AI routes; print-server physical smoke checklist in initiative / print-server extended doc.
- **Label Studio production hardening** — AI endpoint throttles; upload magic-byte checks; retryable storage cleanup + `purge_label_media` command; bounded custom print payloads/pages/rasters; exact-size template printing in print-server **1.4.1**.

---

## [2.47.2] — 2026-07-03

User-facing theme: **Performance — inventory, processing, and the dashboard stay fast through a full workday (no UI changes).**

### Changed

- **Backend / dashboard metrics** — all date filters rewritten from non-sargable `__date` casts to indexed timestamp ranges (`_day_range` helper): the every-45s metrics rebuild no longer seq-scans the all-time `Cart`, `CartLine`, `ItemHistory`, and `RestorationJob` tables; the on-shelf aggregate now runs **one** query over the wide window instead of two overlapping ones (`apps/pos/services/dashboard_metrics.py`; identical outputs, dashboard tests green).
- **Backend / indexes** — migration **`inventory.0079`**: `pg_trgm` extension + trigram GIN indexes on `Item.search_text` and `PurchaseOrder.search_text` (so `icontains` search stops scanning every row) and `Item` index `(-checked_in_at, -created_at)` matching the item list's sort; `ItemViewSet` also `select_related`s `product__category` (removes a per-row category query).
- **Backend / processing workspace** — per-request whole-PO scans page-scoped: same-product peers and collapse rollups now query only the products/masters on the returned page (identical output for those rows); `expected_retail` computed with a DB aggregate instead of hydrating every linked row.
- **Frontend / processing workspace** — workspace query cache bounded (`gcTime` 60s; each distinct search previously held a full 10k-row copy for 5 min); refresh refetches only **active** queries (was: every cached search variant in parallel); per-scan invalidations no longer force-refetch the 100-row PO picker; row-callback identities stabilized so scanner keystrokes stop re-rendering every visible row; virtualizer spacer heights moved from `sx` to `style` (Emotion was permanently accumulating a CSS rule per scroll step — the main long-tab degrader); canvas text measurement memoized; the header's 1 Hz rate tick now runs only once a session has started.
- **Frontend / Catalog workbench** — right-hand panels memoized with stable callbacks (scan-bar keystrokes no longer re-render the ~500-option category select and dirty-check serialization); table row-open handlers stabilized (memoized rows actually skip re-renders); column-resize persists to localStorage on release instead of every mousemove and cleans up window listeners on mid-drag unmount; post-check-in invalidations scoped to the mounted workbench queries and parallelized; copy-chip/scan-bar timeouts cleaned up; stable empty-array fallbacks stop effect churn during loads.

---

## [2.47.1] — 2026-07-03

User-facing theme: **Hotfix — Catalog product check-in creates real items (and prints) again.**

### Fixed

- **Inventory / product check-in** — `POST /inventory/products/:id/check-in/` returned 201 with `created_count: 0` since v2.32 split `processing_add_item` (row-only) from row check-in; **`product_check_in()`** now calls **`processing_row_check_in()`** after creating the added row so items, **`ItemCheckIn`**, and the label print preview are created (`processing_ops.py`; fix authored by a Cursor session, no automated regression test yet).

### Changed

- **Inventory / Catalog workbench** — after a successful create check-in, search updates to **`{checkin=<id>}`** and selects that check-in; UI no longer shows success when the API returns zero items (`InventoryWorkbenchPage`, **`ItemCheckInManagePanel`**).

---

## [2.47.0] — 2026-07-03

User-facing theme: **Wall cutter — a knife tool that splits a wall into two segments where you click.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md).

### Added

- **Floorplan / cut tool** — new scissors tool in the toolbar (**C**): hovering a wall shows a dashed, grid-snapped cut line across it; clicking splits the wall into two independent segments at that point (**`cutWallAt`**). Both pieces keep the kind, thickness, rotation, flip, and group; both are selected after the cut, and the tool stays active for repeated cuts. Works only on wall-kind elements (rotation-aware — vertical walls cut along their length); locked walls and cuts that would leave a stub are ignored.

### Fixed

- **Build tooling** — root `package.json` lost a stray UTF-8 BOM (introduced by a scripted edit in v2.46.0) that broke local vitest module resolution; npm/Heroku builds were unaffected.

---

## [2.46.0] — 2026-07-03

User-facing theme: **Walls become a first-class element type — typed selection sizing with aspect lock, bulk wall thickness, wall-group palette shortcuts — plus Catalog check-in parity with processing.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md).

### Added

- **Floorplan / selection size** — multi-select properties panel shows the combined **Width × Height** and both are typeable: entering a value scales the whole selection about its top-left, with a **link icon** toggling aspect lock (locked = proportional, unlocked = one-axis stretch). Walls keep their thickness through any of it.
- **Floorplan / wall groups in the palette** — **2 walls (L)**, **3 walls (U)**, **4 walls (room)** under Structural: frontend-defined composites that place standard 8'×6" `wall` segments pre-grouped (corners overlap, segments stay uniform 8'); each wall is individually editable after placement (**`WALL_COMPOSITES`** + **`compositeToElements`**).
- **Floorplan / bulk wall thickness** — with walls selected, a **Thickness** field applies to every selected wall at once (shows the common value, or "mixed — type to unify"); the panel header reports composition (**N walls, M elements, K other**), and image tools are scoped to non-wall elements.

### Changed

- **Floorplan / wall element class** — `FloorPlanElementKind.is_wall` (migration **`floorplan.0005`**; seeded `wall` kind flagged; Super Admin toggle in the kind dialog). For wall elements: raw height **is** the thickness — it survives rotation (a rotated wall's depth is never its length), corner-drag resize changes **length only**, group scaling uses the flag instead of the aspect-ratio guess, and the single-wall panel edits **Length / Thickness** instead of visual Width/Depth.
- **Inventory / Catalog workbench** — new check-ins start only from **Products → Check in items**, opening the create check-in panel on the Check-ins tab (no **New check-in** toolbar button). Create and duplicate flows use processing-style actions: **Cancel**, **Check in without printing**, **Check in & print** (`ItemCheckInManagePanel`, `InventoryWorkbenchPage`). Existing check-in edit keeps **Reprint** + **Save**. Standalone product check-in dialog/form (`ProductCheckInDialog`, `ProductCheckInForm`) use the same two-button print split (print toggle removed).

---

## [2.45.0] — 2026-07-03

User-facing theme: **Floorplan drafting aids — Shift-constrained moves, group scaling that respects wall depth, flip, and a print dialog built for outline printouts.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md).

### Added

- **Floorplan / print dialog** — **Print** in the editor header opens a live preview with comprehensive toggles: black & white, element style (**images / solid fill / outline only**), element labels, zones + zone labels, freehand drawings, text labels, info blocks, grid, border weight (thin→extra heavy), plan border, inactive elements — plus a one-click **Outline preset** for printing a blank layout to sketch new configurations on. Prints landscape-fit via the browser (**`PrintDialog.tsx`**, dedicated print renderer).
- **Floorplan / flip** — toolbar Flip horizontal / Flip vertical: a single element mirrors its content (`flipH`/`flipV`, rotation-aware; captions stay readable), a multi-selection mirrors the whole arrangement about its center; freehand paths mirror point-wise (**`flipObjects`**).
- **Floorplan / group scaling** — multi-selections get corner scale handles on the combined bounds: positions and sizes scale about the opposite corner, and **wall-like thin elements (aspect ≥ 3) keep their depth** — scaling a room outline lengthens walls without fattening them (**`scaleObjects`**).

### Changed

- **Floorplan / Shift constrains** — holding **Shift** while moving locks to the dominant axis (pure left/right or up/down, no diagonals); while resizing (single or group) it changes exactly one dimension.

---

## [2.44.0] — 2026-07-02

User-facing theme: **Floorplan power tools — layout configuration tabs, JSON/YAML round-trip, lockable objects, per-item labels, rotate-in-place, and scroll-to-pan.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md).

### Added

- **Floorplan / file round-trip** — plans export as JSON (**wrapped** `ecothrift-floorplan` document; old bare-document backups still import); **Import** on the list page creates a plan from a JSON or YAML file (name/location dialog), and the editor's Export menu gains **Load from file** to replace the current draft. New **`planFile.ts`** — tolerant parsing (missing ids generated, collections defaulted) + standard schema migration; server validation still gates saves.
- **Floorplan / configuration tabs** — compact tabs in the canvas's bottom-right corner switch between layout **configurations** stored in one plan (`configStore` + `settings.configs`, active config stays in the top-level collections for back-compat); **+** duplicates the current layout into a new tab, double-click renames, × deletes (never the last). Each switch/edit is undoable.
- **Floorplan / rotate each in place** — multi-select **Shift+R** (or the second rotate button) rotates every selected object 90° about its own center, unlike R which rotates the selection as one rigid unit (**`rotateObjectsEachInPlace`**).
- **Floorplan / per-item labels** — `element.labelHidden`: single-element "Show label" switch + bulk Hide/Show labels on multi-select; hidden labels stay hidden even when plan labels are on.
- **Floorplan / locked (inert) objects** — Lock button makes the selection ignore all pointer interaction (clicks pass through, marquee skips them) while rendering normally; a toolbar lock chip with a count opens a popover listing locked objects with per-object **Unlock** (selects it) and **Unlock all**.

### Changed

- **Floorplan / mouse wheel** — scrolling pans (vertical; Shift or trackpad for horizontal); **Ctrl/Cmd + wheel** (and trackpad pinch) zooms at the cursor. Zoom buttons and +/- keys unchanged.

---

## [2.43.1] — 2026-07-02

User-facing theme: **Hotfix — saving the system retail QA form works again.**

### Fixed

- **Admin / QA form editor** — saving a **system** form returned 400: the editor always sent `slug` and the backend rejects any system-form PATCH containing it. Updates now omit `slug` when it is locked or unchanged (`QualityAuditFormEditorPage.handleSave`).

---

## [2.43.0] — 2026-07-02

User-facing theme: **QA Forms get a clean list-first admin page and a JSON/YAML round-trip — export a form, redesign it (or hand it to an AI), and import it back.**

Initiative: [`.ai/initiatives/_archived/_completed/retail_quality_audit.md`](.ai/initiatives/_archived/_completed/retail_quality_audit.md).

### Added

- **Admin / QA form export + import** — every form exports as **JSON or YAML** (list row menu, or the editor header for the current draft); **Import** on the list page parses either format, generates any missing section/check ids, previews sections/checks, and creates a new form or (on slug match) updates the existing one; the editor's **Load from file** replaces the current draft for review before saving. New **`qaFormFile.ts`** helpers (`js-yaml`); server-side `validate_definition` still gates every save.

### Changed

- **Admin / QA Forms page** — **`/admin/quality-audit/forms`** is now a clean list page (**`QualityAuditFormListPage`**): form rows with status chips, section/check counts, Edit / Export / Delete actions, and New form + Import up top. The editor no longer renders a blank form under the list — it opens only via **Edit** or **New form**.
- **Admin / QA form editor** — decluttered: sections are collapsible accordions (title + check count + reorder/delete in the header, one open at a time), the 15-button control picker is a compact dropdown, and Save/Cancel/Delete live in a sticky action bar.
- **Floorplan / delete guard** — deleting a floorplan now requires typing its name to arm the Delete button (`FloorplanListPage` type-to-confirm dialog).

---

## [2.42.0] — 2026-07-02

User-facing theme: **Floorplan bulk image editing — select all, set or reset images across a whole selection, and unused images clean themselves up.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md) (Session 1 continued).

### Added

- **Floorplan / select all** — **Ctrl+A** selects every object on the plan.
- **Floorplan / bulk image tools** — with multiple elements selected, the properties panel sets one image across all of them (pick from library or **Choose from file…** upload), clears them to solid color, or **Reset to kind defaults** — each element re-adopts its kind's *current* default image, so re-running it after a kind default changes updates every instance to the newest image.
- **Floorplan / single-element reset** — per-element **Reset to kind default** image action; upload buttons relabeled **Choose from file…** everywhere (instance panel + kind dialog).

### Changed

- **Floorplan / orphan image cleanup** — server-side sweep (**`apps/floorplan/services.purge_orphan_assets`**) hard-deletes image assets no active plan element or element kind references, with a 24h grace window for fresh uploads; runs after plan content saves, kind create/edit/delete, and asset delete (an unreferenced asset now deletes outright instead of lingering soft-deleted). Asset pickers refresh automatically after saves.

---

## [2.41.0] — 2026-07-02

User-facing theme: **Floorplan editor precision — align/distribute tools, arrow-key nudging, exact footprints, correct rotated resize, and absolute grid snapping.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md) (Session 1 continued).

### Added

- **Floorplan / align + distribute** — with 2+ objects selected the toolbar offers align left / horizontal-center / right / top / vertical-center / bottom; with 3+, distribute horizontally/vertically with equal gaps (outer objects stay put). Pure helpers **`alignObjects`** / **`distributeObjects`** work on visual (rotation-aware) bounds; unit tested.
- **Floorplan / arrow-key nudge** — arrow keys move the selection **1"** per press (**Shift** = 1'); each press is one undo step.

### Fixed

- **Floorplan / element footprints** — borders now draw fully **inside** the element (`stroke` inset by half its width), so an element never renders larger than its stated W×H.
- **Floorplan / rotated elements** — resize handles sit on the **visual** (rotated) corners and resize math runs in on-floor space (**`rawRectFromVisual`**); the properties panel shows and edits the visual X/Y/Width/Depth (a rotated 48×144 gondola reads 144 wide × 48 deep).
- **Floorplan / snapping is absolute** — dragging snaps the moved object's position to the grid itself, not the drag delta: an object at 1' 8" with 1' snap lands on 2', not 2' 8". Other selected objects keep their relative offsets.

---

## [2.40.1] — 2026-07-02

User-facing theme: **Infrastructure — Heroku stack upgraded to heroku-24; builds use Node 22.**

### Changed

- **Ops / Heroku stack** — app moved from deprecated **heroku-22** (EOL 2027-04) to **heroku-24** (`heroku stack:set`; takes effect with this deploy).
- **Ops / build toolchain** — root `package.json` `engines` bumped **Node 18.x → 22.x**, npm **9.x → 10.x**; clears the Vite 7 "requires Node 20.19+" build warning. No app code changes.

---

## [2.40.0] — 2026-07-02

User-facing theme: **Floorplan element types live in the database — Super Admins create and edit palette entries (size, color, image, shape) from inside the editor.**

Initiative: [`.ai/initiatives/_archived/_completed/floorplan_builder.md`](.ai/initiatives/_archived/_completed/floorplan_builder.md); plan: [`apps/floorplan/PLAN_element_kinds.md`](apps/floorplan/PLAN_element_kinds.md).

### Added

- **Floorplan / element kind catalog** — **`FloorPlanElementKind`** model (migrations **`0003`–`0004`**, 19 built-ins seeded from the legacy hardcoded palette); **`GET/POST/PATCH/DELETE /api/floorplan/element-kinds/`** (staff read, Super Admin write); system kinds editable but not deletable, `kind` slug immutable; auto slug from label.
- **Floorplan / shape control** — per-kind footprint **`shape`** (`rect` | `circle`) and **`corner_radius`** (inches); rectangles now render **sharp** by default (replaces the hardcoded `rx=1.5`); `column`/`rackRound` seeded as circles so existing plans render unchanged; placement ghost matches shape.
- **Floorplan / in-editor kind management** (Super Admin) — **New element type** button + per-row edit in the palette sidebar (**`ElementKindDialog`**): name, category (free text w/ autocomplete), default size, fill color, shape/radius, resizable, optional default image (pick or upload); custom kinds removable with confirm.

### Changed

- **Floorplan / palette** — editor palette, legend, and canvas resolve kinds from the DB catalog (**`useFloorPlanElementKinds`**, `kindIndex` threading); static `palette.ts` array retained only as a loading placeholder mirroring the seed; kinds with a **`default_image`** place with the image preset.
- **Floorplan / element images** — images stretch to fill the element footprint on resize (**`preserveAspectRatio="none"`**) instead of letterboxing, so one image serves any W×H.

### Removed

- **Floorplan / legacy "Custom" palette section** — raw uploaded assets are no longer a placeable palette category; create an element kind with a default image instead (per-instance image assignment in the properties panel is unchanged).

---

## [2.39.0] — 2026-07-02

User-facing theme: **Floorplan builder ships in Floor Ops; TARS restoration hardening lands; Add Order shows all active vendors.**

Initiatives: [`.ai/initiatives/_archived/_pending/tars_restoration_workspace.md`](.ai/initiatives/_archived/_pending/tars_restoration_workspace.md) (Session 4 hardening).

### Added

- **Floor Ops / floorplan builder** — new `apps/floorplan` app with `FloorPlan` + `FloorPlanAsset` models (migrations `0001`–`0002`); **`GET/POST/PATCH/DELETE /api/floorplan/plans/`** with optimistic locking (`revision` / HTTP 409); **`GET/POST/DELETE /api/floorplan/assets/`** for sanitized SVG/PNG/JPEG uploads (data URIs, ≤512 KB).
- **Floor Ops / editor** — lazy-loaded routes **`/floor-ops/floorplans`** (list) and **`/floor-ops/floorplans/:id/edit`** (SVG canvas editor): palette placement, zones/paths/labels, grid/snap popover, copy/paste/duplicate, grouping, rigid group rotation, upright labels, custom image assets on elements, JSON/PNG export.
- **Floor Ops / nav** — **Floorplans** entry under Floor Ops workspace.

### Changed

- **Restoration / API** — `final_grade` on bench Done validated against the job's grade scale; omitted `spent_parts_cost` defaults to actual ordered-parts cost; `mark-handled` guarded to returns-eligible jobs + new `unmark-handled`; scan-create returns 400 for validation errors (404 only for unknown SKU); queue transitions row-locked (`select_for_update`); job-list serializer reuses prefetch (N+1 removed); race-safe job backfill (`get_or_create`).
- **Restoration / cleanup** — dead `executing` stage removed (migration `0078`, + partial index for the Returns list); dead `useRestorationJobs` hook and unused exports removed; stage lists follow pagination (no silent 200-row cap); shared `tarsMoney` util replaces five divergent money parsers; new tests cover requeue reset, mark-handled guard, multi-site orders, malformed `work_session`, and grade validation.

### Fixed

- **Inventory / Add Order** — **`CreatePurchaseOrderDialog`** vendor dropdown now lists all active vendors (`useVendors({ is_active: true, page_size: 200 })`) instead of a hardcoded seven-name whitelist; newly created vendors appear immediately after save.
- **Restoration / send dialog** — `useGradeScales` record memoized; **`ProcessingSendToRestorationDialog`** no longer re-render-loops and wipes typed grade values while open.
- **Restoration / requeue** — scanning a `done`/`returned` item back into the queue now fully resets the job lifecycle (disposition, final grade, timer, `work_session`, handled flags) instead of resurrecting stale state.
- **Restoration / work_session** — server-side validation (dict shape, `actions` list-of-dicts, 100KB cap); dashboard `_count_tars_actions` fully defensive (malformed sessions can no longer 500 `/api/pos/dashboard/`); parts upsert parses qty/price safely and truncates strings to column widths.
- **Restoration / bench drafts** — grade direction cards merge onto the local draft (no longer clobber unsaved bench edits); failed debounced saves re-mark the draft dirty instead of silently reverting on next refetch; Hold flushes the draft like Done/Move-back.
- **Restoration / queue edits** — debounced job patches keyed per job and merged (scale + grade edits within 400ms no longer drop); flush on unmount/job switch; patch responses update the live `restoration-queue-jobs` cache (bulk **Clear values** now visibly clears).
- **Restoration / cache invalidation** — completing or returning a job invalidates the **Restoration Returns** list; return/split invalidate the TARS bench list; parts upsert refreshes bench jobs.
- **Restoration / parts orders** — recording an order on a multi-site request requires `site_id`/`line_ids` (no more cross-supplier blanket ordering); skipped lines excluded from order/receive updates; submit only from draft; order dialog confirms before discarding a dirty draft on backdrop close; tax/amount fields no longer blank at ≥ $1,000.
- **Restoration / crashes + validation** — null `eval_snapshot` no longer crashes Parts Requests; negative money rejected/clamped everywhere (grade values, approve dialog, Returns set-price); split dialog allows exact full coverage and shows inline errors; timer start/pause/adjust surface errors instead of failing silently.
- **Dashboard / restoration metrics** — done counts keyed by `dispositioned_at` (marking an old job handled no longer counts it as done today).

---

## [2.38.0] — 2026-06-29

User-facing theme: **Managers run mobile floor QAs from configurable forms; Super Admins edit checklists; the dashboard Retail QA card shows the latest letter grade.**

Initiative: [`.ai/initiatives/_archived/_completed/retail_quality_audit.md`](.ai/initiatives/_archived/_completed/retail_quality_audit.md)

### Added

- **Admin / Quality Audit hub** — **`/admin/quality-audit`**: start cards for each active form; latest submitted grade badge; Super Admin **Manage forms** entry.
- **Admin / QA wizard** — **`/admin/quality-audit/run/:formSlug/:auditId`**: mobile-first shell (gradient hero, live grade ring, section chip rail, sticky footer); 5 sections × 25 checks driven by form definition; summary with projected grade, section bars, fail list, submit confirm.
- **Admin / QA form editor** (Super Admin) — **`/admin/quality-audit/forms`**: CRUD for **`QualityAuditForm`**; section/check builder with 15 control kinds (yes/no, thumbs, rating, emoji, severity, slider, chips, counter, zone, photo, confidence, toggle, priority, comment, letter grade); system retail form locked (slug + dashboard binding); **`QA Forms`** nav item.
- **Backend / QA models + API** — **`QualityAuditForm`** + **`QualityAudit`** (migrations **`0008`–`0009`**); seeded retail system form (`feeds_dashboard=True`); **`GET/POST/PATCH/DELETE /api/pos/quality-audit-forms/`** (Super Admin write, Manager+ read) + **`GET/POST/PATCH /api/pos/quality-audits/`** + **`…/submit/`**; definition validation + server-side **`derive_result`** per control kind.
- **Dashboard / Retail QA card** — Latest submitted audit on a **`feeds_dashboard`** form **`overall_grade`**; cache invalidates on submit.

### Changed

- **Dashboard / weekly labels** — Week totals under week date in sales book (`WeeklySalesRow`) and department card grids (`DepartmentCardGrid`, week detail dialog); compact date range helper **`compactWeekDateRange`**.

### Fixed

- **Dashboard / processing grid** — **`processing_by_day`** now spans last week through today (Mon–Sun department grid); last week showed **`0`** because aggregate used Sunday week start only.

---

## [2.37.0] — 2026-06-29

User-facing theme: **Dashboard is fully usable on phone — natural scroll, touch-first weekly sales, expandable department detail, and today's sales at a glance in the header.**

### Added

- **Dashboard / mobile weekly book** — **`WeeklySalesWeekList`**: This Week day list + accordion for past weeks; tap a day opens revenue + items detail via shared **`SalesDayDetailContent`**.
- **Dashboard / mobile department detail** — **`DepartmentWeekDetailDialog`**: full-width 2-week grid from **View week detail** on compact cards.
- **Dashboard / layout helper** — **`useDashboardLayout`** (`isMobile` / `isCompact`) + responsive gutter `sx` for section padding.

### Changed

- **Dashboard / page shell** — **`DashboardPage`**: mobile flex scroll (no `height: 0` squash); chart + weekly book min-heights for reliable Recharts; **Today's Sales** pill on the Sales section header (mobile only).
- **Dashboard / sales chart** — **`SalesOverviewSection`**: stacked header + horizontal stat scroll on compact; taller chart on xs; every-2nd Monday X ticks; shorter goal label on phone.
- **Dashboard / department cards** — **`DepartmentMetricCards`**: `xs:12 sm:6 md:3`; inline micro-grid hidden on compact; goal/actual stack vertically on xs in **`DepartmentStatCard`**.
- **Dashboard / chrome** — **`MainLayout`**: reduced dashboard padding on xs; AppBar user name hidden on xs; **`SectionHeader`** mobile hint copy for Departments.

---

## [2.36.0] — 2026-06-29

User-facing theme: **TARS restoration closes the full lifecycle — bench Disposition returns items to Processing with achieved grade, parts flow parks/resumes cleanly, and Processing gets a dedicated Restoration Returns list.**

Initiative: [`.ai/initiatives/_archived/_pending/tars_restoration_workspace.md`](.ai/initiatives/_archived/_pending/tars_restoration_workspace.md)

### Added

- **Restoration / bench disposition** — `complete_restoration_job` moves items by destination (`processing`, `back_storage`, `salvage`, `online_sales`), writes `ItemHistory`, stamps `restoration_return_grade`/`scale` on check-in snapshot, and refreshes processing denorm; `'processing'` added to `DISPATCH_VALUES`.
- **Restoration / returns API** — Migration `0077`: `RestorationJob.processing_handled_at` + `processing_handled_by`; `GET …/restoration-jobs/returns/` lists unhandled processing returns; `POST …/{id}/mark-handled/` clears them.
- **Restoration / parts received signal** — `receive_parts_request` sets `work_session.pending.partsReceived` when the linked job is pending.
- **Inventory / Restoration Returns page** — `/inventory/restoration-returns` table (SKU, product, achieved grade, returned date) with inline **Print tag**, **Set price**, **Mark handled**; nav item under Processing.
- **POS / dashboard** — `_restoration_metrics` ships `active_jobs`, `awaiting_parts`, `returns_pending` with `ready: true`; Restoration card headline binds to active count with returns sub-stat.

### Changed

- **Restoration / TARS bench** — Request parts auto-holds item to Pending; Disposition enabled from Pending; green **Parts received — ready to finish** banner when parts arrive.
- **Restoration / cleanup** — Removed dead hold-update branch, unused `focusSection` nav state, orphan `executing` rail label, and unused `useSendRestorationJob` / `usePatchRestorationJobGrade` hooks.

---

## [2.35.0] — 2026-06-26

User-facing theme: **TARS bench MVP — simplified work session, grade-scoped parts requests with full order detail and per-part actual costs.**

Initiative: [`.ai/initiatives/_archived/_pending/tars_restoration_workspace.md`](.ai/initiatives/_archived/_pending/tars_restoration_workspace.md)

### Added

- **Restoration / TARS MVP** — Redesigned `work_session` JSON (top-level `parts`, `orders`, `gradePlans`, `benchRows`); **`TarsWorkBenchTable`** free-form action log; **`TarsGradeEvalDialog`** (hours + orders per grade); grade-scoped **Request parts** from eval modal, parts drawer, and hold dialog; **`POST …/restoration-parts-requests/{id}/receive/`** for tech mark-received.
- **Restoration / parts requests manager** — Open/Received tabs; **Approve** dialog with vendor-website picker, per-line actual cost vs estimate (mismatch chips), and full parts list (qty, URL, domain); order cards show `supplier_url` and order lines; **Open in TARS** jumps to workbench for the job.
- **Restoration / orders** — Migration `0076`: `RestorationPartsOrder.supplier_url`; `record-order` accepts `supplier_url` + per-line `unit_cost`; shared **`tarsUrl.ts`** (`urlDomain`, `absoluteUrl`) fixes bare-domain part links resolving against `/restoration/tars`.

### Changed

- **Restoration / TARS bench** — Eval cards: body opens eval dialog, bottom bar chooses grade; profit math removed, timer kept; hold dialog drops expected-resume, adds optional parts request; done dialog trimmed to grade/time/destination/notes.
- **Restoration / parts order dialog** — Inline **Add part**; aligned Shipping/Fees/Tax layout; URL field shows domain + Edit; wider price column.
- **Restoration / queue** — Seed + active DB grade scales always valid (`get_active_scales`); scale change resets grade values and surfaces patch errors.
- **POS / dashboard** — Weekly sales row and dashboard formatters extended for restoration/buying rollups (`WeeklySalesRow.tsx`, `dashboard_metrics.py`).

### Removed

- **Restoration / legacy action panels** — Deleted verb-specific panels (`TarsTest/Assemble/Repair/SalvageActionPanel`, `TarsActionLogPanel`, `tarsWorkDefaults.ts`).

### Fixed

- **Restoration / part links** — URLs without `https://` no longer open as `localhost/restoration/tars` + path (`absoluteUrl` on parts list, order dialog, parts-request page).

---

## [2.34.1] — 2026-06-26

User-facing theme: **Single TARS route at `/restoration/tars` — legacy tars-2 duplicate removed.**

Initiative: [`.ai/initiatives/_archived/_pending/tars_restoration_workspace.md`](.ai/initiatives/_archived/_pending/tars_restoration_workspace.md)

### Changed

- **Restoration / TARS routing** — Live bench workstation is now **`/restoration/tars`** (drawer item list + parts list); **`/restoration/tars-2`** redirects for old bookmarks; duplicate **TARS 2** nav item removed.
- **Restoration / TARS workstation** — **`TarsWorkstation`** is drawer-only; split inline-rail layout and resize handle removed.

### Removed

- **Restoration / legacy UI** — Deleted **`Tars2Page`**, **`ProcurementGroupDialog`**; repair-action orders use **`TarsPartsOrderDialog`** (same as parts drawer).

---

## [2.34.0] — 2026-06-26

User-facing theme: **Restoration bench goes live on TARS 2, dashboard metrics ship with goals, and parts-list orders get full CRUD with order-specific qty.**

Initiatives: [`.ai/initiatives/_archived/_pending/tars_restoration_workspace.md`](.ai/initiatives/_archived/_pending/tars_restoration_workspace.md); [`.ai/initiatives/_archived/_completed/hr_time_clock_mvp.md`](.ai/initiatives/_archived/_completed/hr_time_clock_mvp.md) (payroll polish)

### Added

- **Restoration / queue live data** — **`RestorationJob`** model (migrations `0068`–`0074`, one batch per **`ItemCheckIn`**); Processing check-in with **`dispatch=restoration`** persists grade scale/values and creates a **`queued`** job; **`GET/PATCH/POST /api/inventory/restoration-jobs/`**, **`POST …/{id}/send/`**, **`POST …/{id}/return-to-processing/`**; **`/restoration/queue`** wired to React Query (manual SKU scan, edit grades, send to bench-ready **`sent`** stage, or return to Processing with TARS-completed/untouched disposition).
- **Restoration / TARS 2 bench** — **`/restoration/tars-2`** full-width workstation with live bench API (`PATCH …/work-session/`, scan-to-bench, pending/hold/done flows); persisted **`work_session`** JSON on **`RestorationJob`** (migrations `0071`–`0073`); grade scales API (`GET/PATCH /api/inventory/grade-scales/`); parts requests scaffold (`RestorationPartsRequestViewSet`).
- **Restoration / parts list orders** — Parts drawer **Parts** + **Orders** tabs; per-order shipping/tax/fees; renamable orders; **`TarsPartsOrderDialog`** with drawer-style editable lines; **`partQtyOverrides`** on orders so order qty can differ from the parts-list master qty while description/URL/price stay synced.
- **POS / dashboard metrics** — **`GET /api/pos/dashboard/metrics/`** with sales run-rate, department cards, buying/processing/restoration rollups; **`DashboardSalesGoal`** + **`DashboardDepartmentGoal`** models (migrations `0005`–`0006`); editable goals in UI (`frontend/src/components/dashboard/`); 45s server cache + client **`sessionStorage`** placeholder for sub-second reloads; DB indexes on **`Cart`** and **`ItemHistory`** (migrations `0007`, `0075`).
- **Inventory / item label printed tracking** — `Item.label_printed_at` (backfilled for existing items); `POST /api/inventory/items/mark-labels-printed/` bulk marker after local print success; **Printed** column on workbench Items tab and Processing Prior Check-ins (`printedCount/qty`); Print vs Reprint affordances when labels already printed.
- **Restoration / TARS workspace (legacy mock route)** — `/restoration/tars`: **Check-In & Evaluate** (scan-in, live evaluation, perform path), **TARS** (active evaluation summary + Test/Assemble/Repair/Salvage queues). Client mock retained on legacy route while TARS 2 uses live data.

### Changed

- **Restoration / Send to Restoration** — **`/restoration/queue`** reads live **`RestorationJob`** rows instead of client mock seed data; **`TarsMockProvider`** scoped to **`/restoration/tars`** only.
- **Restoration / TARS 2 UX** — Debounced local **`work_session`** draft (`useWorkSessionDraft`) eliminates input lag on bench text fields; bench cache patch avoids full refetch on every keystroke.
- **Inventory / Processing — restoration check-in** — **`restoration_scale`** + **`restoration_grade_values`** validated server-side when dispatch is Restoration (`ProcessingSendToRestorationDialog` payload).
- **Inventory / Processing — edit check-in dialog** — `ProductSummaryCard` shows Product #, Title, Brand, Model only (no nested stat cards); edit mode surfaces **4 check-in-scoped item stat cards** (# Items, On Shelf, Sold, Printed) clickable to workbench with filters; modal spacing tightened (`ProcessingCheckInEditStats.tsx`, `ProcessingCheckInDialog.tsx`).
- **Inventory / Processing — check-in forms** — Status removed as a check-in input (status is automatic); `CheckInDetailFieldsSection.status` prop is opt-in; removed from Processing check-in dialog, workbench manage panel create/edit/duplicate paths.
- **Restoration / TARS mock UX** — Workspace pages renamed to **Send to Restoration**, **Check-In & Evaluate** (default), **TARS**; active evaluation summary above verb queues.
- **Dashboard** — **`DashboardPage`** rebuilt with department metric cards, weekly sales list, and sales overview section; metrics load from live API instead of static placeholders.
- **HR / Time & payroll — roster tab** — Columns reordered (Date, Employee, Start, Stop, Break, Hours, **Week hours**, Pay); **Week hours** shows full Mon–Sun partition sum per employee with red overtime format (`40.00 (+X.XX overtime)`); removed payroll running-total column (`apps/hr/services/roster.py`, `TimePayrollPage.tsx`).
- **HR / Time & payroll — by employee** — **This week** column (`hours_this_week` on `GET …/payroll/`); **This payroll** shows per-calendar-week OT breakdown; KPI **This week** uses current-week roster fetch.
- **HR / time entries** — `TimeEntry.save` syncs `date` from `clock_in`; **`validate_shift_duration`** rejects shifts over **16h** after breaks.

### Fixed

- **HR / roster display** — Start/Stop show date when clock timestamp spans a different day than the row date (`fmtClockCell` on `TimePayrollPage.tsx`).

### Documentation

- **AI protocols** — **`code.9.Push`** and **`review.0.Bump` Part 2E**: every GitHub push requires semver release + dated **`CHANGELOG`** section.

---

## [2.33.1] — 2026-06-23

User-facing theme: **Time clock “My recent shifts” shows only the logged-in employee’s entries.**

Initiative: [`.ai/initiatives/_archived/_completed/hr_time_clock_mvp.md`](.ai/initiatives/_archived/_completed/hr_time_clock_mvp.md)

### Fixed

- **HR / time clock** — **My recent shifts** on `TimeClockPage` no longer lists all staff for managers/admins; `GET …/time-entries/` list and `summary` default to the current user (`apps/hr/views.py`; frontend passes `employee` + `useTimeEntries` `enabled` guard).

---

## [2.33.0] — 2026-06-23

User-facing theme: **HR Time Clock MVP — clock in/out, breaks, overtime warnings, consolidated Time & payroll, and Employees admin with pay rates.**

Initiative: [`.ai/initiatives/_archived/_completed/hr_time_clock_mvp.md`](.ai/initiatives/_archived/_completed/hr_time_clock_mvp.md)

### Added

- **HR / time clock rebuild** — Essentials nav **Time clock**: clock in/out, **Take a break** / **End break**, weekly hours ring, **red overtime banner** at 40h/week (warn only — clock-in never blocked).
- **Admin / Time & payroll** — Super Admin consolidated page (`/admin/time-payroll`): calendar **From/To**, period quick select, split week/period/month buttons, roster tab (employee/hours filters, pay $, row + bulk soft-delete), by-employee payroll summary, change requests tab (approve + **reject**, bulk actions).
- **HR / payroll API** — `GET …/time-entries/roster/`, `payroll/`, `payroll_periods/` with running weekly/payroll totals and `pay_rate × hours`; manager CRUD on time entries; `bulk_delete` soft-delete.
- **HR / modification requests** — employees submit changes on completed shifts; Super Admin edit, approve, or **reject** (`reject` + `bulk_reject`); soft-delete + `bulk_delete`.
- **HR / break tracking** — migration `0003`: `TimeEntry.on_break`, `break_started_at`; `start_break` / `end_break` API actions.
- **HR / soft delete** — migration `0004`: `deleted_at`/`deleted_by` on `TimeEntry` and `TimeEntryModificationRequest`; `manage.py purge_soft_deleted_hr` (30-day hard purge).
- **Admin / Employees** — **Users** renamed to **Employees** in nav; add/edit includes status, contact, role, position, employment type, **pay rate** (`UserCreateSerializer` + `employee_profile` PATCH).

### Changed

- **Navigation** — Essentials **Time clock**; Admin **Employees**, **Time & payroll** (superuser); legacy HR routes redirect.
- **HR / modification review** — Super Admin approve applies edits to shift; **reject** marks denied without changing the time entry.

### Removed

- **HR legacy pages deleted** — `TimeHistoryPage`, `EmployeeListPage`, `EmployeeDetailPage`, `SickLeavePage`, old `PayrollHoursPage`, `TimeModificationRequestsPage`; routes redirect to Time clock or Time & payroll.

---

## [2.32.0] — 2026-06-16

User-facing theme: **Processing workspace unmanifested lines, faster queue resume, and tighter check-in UX.**

### Added

- **Inventory / unmanifested processing lines** — `POST …/processing-add-item/` creates pending `row_kind='added'` queue rows (title/brand/model only); check-in follows attach-product-then-check-in like manifest rows; manifest audit rollups exclude added lines.
- **Inventory / delete unmanifested lines** — `POST …/processing-delete-added-row/` removes empty added rows; queue trash icon on added rows only; blocked when check-ins exist.
- **Inventory / processing queue filters** — independent multi-chip OR filters (`open`, `partial`, `done`, `disputes`, `unmanifested`) via `segments` query param.
- **Inventory / processing workspace resume** — sessionStorage restores queue search + open row detail per PO when navigating away and back.
- **Inventory / processing quick recall** — scan-bar search history (10, per order) and horizontal **Recent** row chips (last 10 opened/checked-in rows); client-only, no extra API calls.
- **Inventory / processing refresh** — **Refresh page** on row detail refetches workspace stats, row detail, and product editor caches without browser reload.
- **Inventory / Google search shortcuts** — product editor, add-line dialog, attached product cards, and row details link to Google from title/brand/model/tags.

### Changed

- **Inventory / set-part check-in pricing** — check-in prefill and `processing-row-check-in` default item price/retail scale by product link ratio (`manifestUnits / checkIns`) from row bookmark values.
- **Inventory / added-row detail UX** — removed standalone **Check in…** under Row Details; staff attach or create a product first, then check in from the product card (same as manifest rows).
- **Inventory / Add unmanifested line dialog** — simplified to title (required), model, brand; no immediate item creation or auto-print.

### Fixed

- **Inventory / processing validation** — tests for added-row create/check-in/delete, multi-segment OR filter, set/part price scaling, and manifest audit isolation for unmanifested lines.

---

User-facing theme: **Processing workspace product-linked check-ins and a cleaner prior check-ins workflow.**

### Added

- **Inventory / processing workspace product links** — migration `0066_processingrow_product_links` adds durable product linkage for processing rows/check-ins so staff can attach, remap, and carry product identity through row detail and prior check-in flows.
- **Inventory / prior check-ins table** — new measured column layout (`checkedInHistoryColumnLayout.ts`), flat row history, Product editor links from ID/Brand/Title/Model/Category cells, and inline condition/dispatch/price edits for prior check-in batches.
- **Inventory / processing accounting helpers** — manifest accounting utilities and tests keep split/collapse/check-in quantities aligned in the active processing workspace.

### Changed

- **Inventory / detailed check-in** — simplified product/item workflow, reuse of attached product options, and product draft validation for processing row check-ins.
- **Inventory / processing queue** — tightened column sizing, queue cell labels, filter helpers, and prior-history display; dispatch labels now use proper option capitalization such as **Back storage** and **On shelf / floor**.
- **Inventory / product drawer** — Product management integrates better with processing-row context and row product drafts.

### Fixed

- **Inventory / prior check-ins** — removed Status from the prior check-ins table so staff cannot manually change item status from history rows; Sold remains a POS-controlled status and `processing-patch` rejects manual `status: "sold"`.
- **Inventory / processing validation** — split, collapse, identity, and status-patch tests cover the revised product/check-in behavior.

---

## [2.30.0] — 2026-06-15

User-facing theme: **Inventory Catalog — one search-first page for products, check-ins, and items with in-place edit/create.**

### Added

- **Inventory / Catalog** — staff page at `/inventory/workbench` (nav **Catalog**): shared scan-bar search, Products / Check-ins / Items tabs, split detail panels, URL state (`tab`, `q`, `selected`), and relationship navigation between records. See initiative [`product_item_crud_and_processing`](.ai/initiatives/product_item_crud_and_processing.md).
- **Inventory / ItemCheckIn catalog API** — `GET /api/inventory/item-check-ins/` with searchable catalog serializer, filters (`product`, `item_check_in`, `search`), and dedicated pagination count (no Item list cache bleed); [`test_item_check_in_catalog.py`](apps/inventory/tests/test_item_check_in_catalog.py).
- **Inventory / rich search** — `{product=…; checkin=…; item=…}` filter syntax, URL builders ([`richInventorySearch.ts`](frontend/src/utils/richInventorySearch.ts)), and search history per catalog.
- **Inventory / migrations `0063`–`0065`** — `Item.check_in` FK normalization, drop `ItemCheckIn.item_ids`, index cleanup; see [12_check_in_normalization](.ai/reference/product_item_field_audit/12_check_in_normalization.md).
- **Inventory / catalog UX** — three-way save dialog on price change (print / no print / cancel), `ConfirmDialog` replaces system confirms, copyable ID chips, column-width reset in table toolbar.

### Changed

- **Inventory / catalog consolidation** — replaces separate **Manage Products** / **Manage Items** pages; legacy `/inventory/manage-products` and `/inventory/manage-items` redirect into Catalog with query preserved.
- **Navigation** — Inventory workspace third link labeled **Catalog** ([`navItemCatalog.ts`](frontend/src/navigation/navItemCatalog.ts)).
- **Inventory / money fields** — Retail and Price accept decimal `.` while typing (`sanitizeDecimalPaste`); blur still normalizes to two decimals.

### Fixed

- **Inventory / Catalog tabs** — free tab switching without selection bounce; stat-card clicks filter in place without forced tab changes.
- **Inventory / pagination** — ItemCheckIn list total count no longer reuses Item catalog cache ([`ecothrift/pagination.py`](ecothrift/pagination.py)).

---

## [2.29.0] — 2026-06-15

User-facing theme: **Product and Item catalog CRUD pages, canonical category reset, and product-first check-in from Manage Products.**

### Added

- **Inventory / Manage Products & Manage Items** — staff catalog pages at `/inventory/manage-products` and `/inventory/manage-items` with virtualized tables, scan-bar search, and CRUD drawers (`ProductManageDrawer`, `ItemManageDrawer`); Product modal adds AI suggest, stat cards (# Orders / # Items / On shelf / # Sold with tooltips), and **Check in items** for saved products.
- **Inventory / product-first check-in** — `POST /api/inventory/products/{id}/check-in/` locks catalog identity and creates on-shelf Items via `processing_add_item`; `GET /api/inventory/products/check-in-orders/` lists misfit default + manual check-in POs; `ProductCheckInDialog` with quantity, PO select, item fields, and print; post-check-in navigation to Manage Items with `ids` + `product` filters. See initiative [`product_item_crud_and_processing`](.ai/initiatives/product_item_crud_and_processing.md).
- **Inventory / product suggest** — `POST /api/inventory/products/suggest/` for AI-assisted Product CRUD copy (structured JSON).
- **Inventory / migrations `0061`–`0062`** — product identity cleanup (`0061`); canonical 19-category `Product.category` FK, drop `Product.description` and preprocessing/manifest description columns (`0062`); `canonical_categories.py` helper.
- **Inventory / item catalog filters** — `GET /api/inventory/items/?ids=1,2,3` exact batch filter; default ordering `-checked_in_at`, `-created_at`.
- **Inventory / tests** — [`test_product_check_in.py`](apps/inventory/tests/test_product_check_in.py), [`test_product_suggest.py`](apps/inventory/tests/test_product_suggest.py); `processing_add_item` now records `ProcessingCheckInBatch` for added-row check-ins.

### Changed

- **Inventory / category unification** — single flat `Category` table (19 `TAXONOMY_V1` names); `Product.category` FK replaces string/`category_ref`; Item category derived from product; preprocessing finalize and AI cleanup use canonical category names only.
- **Inventory / Manage Items entry** — **New item** opens Product create (not standalone item drawer); after product create, Manage Products opens with search prefilled to the new product number/title (`productManageCatalogSearchTerm`).
- **Inventory / detailed check-in dialog redesign + true batch editing (owner spec)** — dialog is **Product · Item · buttons**; prior check-in row click **edits** the batch via `POST …/processing-check-in-batch/{id}/update/`; AI suggest auto-applies with per-field **AI ⇄ original** toggles.
- **Inventory / check-in performance** — slim PO fetch for processing mutations (~20s → ~0.2s on large POs); `_bulk_create_checked_in_items` + batch `POST /print/labels` on the print server.
- **Inventory / Prior check-ins table** — inline condition/dispatch edit; Print/Delete only; Expected treated as estimate (over-check-in allowed).
- **Navigation** — Slot C catalog entries for manage-products / manage-items ([`navItemCatalog.ts`](frontend/src/navigation/navItemCatalog.ts)).

### Documentation

- **Product/Item field audit** — planning pack updated through category-unification reset ([`11_category_unification_description_removal_plan.md`](.ai/reference/product_item_field_audit/11_category_unification_description_removal_plan.md)).

---

## [2.28.0] — 2026-06-12

### Changed

- **AI / universal LLM router** — every AI call site now routes through [`apps/core/services/llm_router.py`](apps/core/services/llm_router.py): model resolved per purpose from `.env` (`AI_MODEL_<PURPOSE>`), provider inferred from the model id (`grok-*` → xAI, `gemini-*` → Google, else Anthropic), API key resolved per provider with a clear `LLMConfigError` when missing. Gemini now works for **all** features (previously cleanup-only); chat proxy, suggest item/finalization/formulas, legacy cleanup, buying services (category AI, key mapping, manifest template, title estimate), classifier, and benchmark commands migrated off direct Anthropic SDK use. `llm_chat.py` consolidated into the router; usage logging now covers xAI/Gemini calls. Router tests: [`apps/core/tests/test_llm_router.py`](apps/core/tests/test_llm_router.py).
- **Deploy / env sync** — single entry point `scripts\deploy\env\sync_to_heroku.bat` pushes the repo-root `.envprod` (prod mirror) to Heroku Config Vars: fixed Windows Heroku CLI resolution (`heroku.cmd` vs unix shim), added a prod-sanity guard (refuses dev `DEBUG`/`ALLOWED_HOSTS`/`ENVIRONMENT` values), corrected dry-run secret masking, removed duplicate legacy sync scripts; `.env` / `.envprod` restructured (env-specific top, shared section below).

### Documentation / steering

- **Initiative — preprocessing AI cleanup review** — Session 1 analysis ([`preprocessing_ai_cleanup_review.md`](.ai/initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md)): Step 2 is **offline CSV only** in UI; legacy **`ai-cleanup-rows`** has no Step 2 UI and writes **`ManifestRow`**; Heroku ~30s vs **`ensure_manifest_products_and_items`** per batch; **`apply-cleanup-csv`** all-rows atomic POST risk. Benchmarks on PO 323 (744 rows): Haiku batch 5/10/25; Grok local ~37s @ 16×20. Fable handoff: [`workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md`](workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md). Synced `.ai/context.md`, `inventory-pipeline.md`, `frontend.md`, `backend.md`.

### Fixed

- **Dev tooling — `test_ai_cleanup`** — fixed stale `vendor_name` / manifest field refs so Anthropic batch benchmarks run on current models.

### Added

- **Inventory / singles & sets — row transforms (P9)** — Item Processor rows can now be reshaped for merchandising (owner spec 2026-06-12; see [`intake_processing_improvements.md`](.ai/initiatives/intake_processing_improvements.md)): **Break apart** (N units × X subitems — 10 cases of 500 plates → 5,000 plates) and **Make set** (K sets of S units with ONE tag per set — candle boxes for churches) via `POST …/processing-break-apart-row/` / `…/processing-make-set-row/` (`product_mode` keep/existing/new). Whole-row transforms rewrite expected quantity in place; partial transforms create a **sub row** (`ProcessingRow.split_parent`/`split_seq`, displayed `#12.1`) sharing the frozen manifest line; every op is recorded in `ProcessingRow.transforms` and `Item.unit_count` stamps physical units per tag (set check-ins report real units; migration `0060_processingrow_split_transforms_item_unit_count`). **Restart row** (`POST …/processing-restart-row/`, two-step confirm) is the coarse v1 undo: deletes the family's Items/batches/sub rows, restores the root from its first-transform snapshot, and deletes transform-created Products only when unreferenced — blocked when items are sold or in POS carts. Per-row Item attribution is family-aware (siblings sharing a manifest line never cross-count: denorm, detail, mixed-product guard, shelf-price push); split rows and collapse groups are mutually exclusive. 18 backend tests ([`test_processing_transforms.py`](apps/inventory/tests/test_processing_transforms.py)); full inventory suite 299 green; frontend tsc + 85 tests green.
- **Inventory / unified item creation** — `ProcessingRow.row_kind` (`manifest` | `added`) links no-manifest items via `item_ids`; `POST …/processing-add-item/` creates Product+Item+added queue row; check-in supports `product_mode` keep/edit/existing/new and quantity overage; added rows appear in the processing table with an **Added** badge (replaces separate unmanifested list).
- **Inventory / Item Processor phases 1–6** — row detail shows expected/checked-in/remaining/overage, checked-in unit table with open-item links, Google search assist, and row-defaults inline edit (`PATCH …/processing-row-patch/`); in-workspace **Add unmanifested item** (PO-scoped, no fake `ManifestRow`); search blob now includes Product number/UPC and checked-in Item SKUs with exact SKU scan open; workspace exposes order **rollups** and **unmanifested_items**; **Create Processing Data** hidden for manifest-linked new-flow orders (`intake_migration` flags).
- **Inventory / intake redesign** — began the north-star intake flow: standardize now creates stable **`ManifestRow`** audit/spine rows and links **`PreprocessingRow.manifest_row_id`**; finalize creates **`ProcessingRow`** bookmarks without deleting ManifestRows or real Items; Item Processor has a new row-level check-in endpoint that creates/matches **`Product`** and creates real **`Item`** rows only when physically checked in.
- **Inventory / Add Item** — standalone Add Item now routes category/model/UPC through Product-first matching/creation while keeping `Item` as the physical unit; `retail_value` maps to `Item.unit_retail`.
- **Inventory / Add Item AI** — AI Suggest now returns suggested **retail/MSRP**, optional **search tags**, and a **Google item** query/link; durable tags save conservatively to `Product.specifications.search_tags`, and row-level check-in can reuse the same tag contract from `ProcessingRow.search_tags`.
- **Inventory / ops** — added `classify_intake_redesign_orders` dry-run command to classify orders into migration safety cohorts before any cleanup.
- **Inventory / Item Processor — detailed check-in** — `ProcessingCheckInDialog` rebuilt: header quantity stepper, product modes (new/prior/existing/keep/edit), user-triggered AI suggest/apply, compact title/brand/model, emphasized identifiers/tags/notes, hover full-value tooltips.
- **Inventory / Item Processor — row defaults UX** — manifest toolbar pills for identifiers, tags, and notes with larger type; title/brand/model compact; hover tooltips on truncated values.
- **Inventory / product matching backend (P1)** — staging rows gain `match_candidates` (scored suggestions: UPC → `VendorProductRef` → exact title/brand), `final_matched_product` (decided match; null = believed new), and `match_source` (auto/staff; staff never auto-overridden); `apply-cleanup-csv` auto-generates candidates and UPC-exact hits auto-select; `preprocessing-review` GET/PATCH exposes and accepts match decisions; finalize copies the decided match to `ProcessingRow.matched_product`, and workspace denorm refresh now **preserves** ProcessingRow's own match instead of overwriting from `ManifestRow`. Design: `.ai/reference/product_identity/product_identity_design.md`.
- **Inventory / Final Decisions UI (P2)** — Step 3 renamed **Final Decisions** with product match column (`PreprocessingMatchCell`: candidate chips, inline catalog search, Confirm/New product/Same-as-row); `POST …/regenerate-match-candidates/`; review GET adds `matched_product_detail` + `same_product_row_numbers`; bulk pricing toolbar uses anchored AI scaling (Adjust % / Target total) and **% of retail** mode (skips rows with no base — never writes `$0.00`); workspace row detail prefers `ProcessingRow.matched_product` over legacy manifest match.
- **Inventory / workspace identity precedence (P3)** — `coalesce_processing_row_identity` drives product-wins display on workspace list + row detail when `ProcessingRow.matched_product` is set; list hydrates minimal nested `product`; detail adds read-only **`manifestEvidence`** (vendor claim); check-in dialog defaults to **`keep`** when row has a decided product; **`search_string`** keeps raw row tokens plus product augment (G1); denorm rebuilds `products_by_id` after legacy manifest backfill so product tokens land in the same pass.
- **Inventory / split / N-products (P4)** — `ProcessingRow.distinct_product_count` denorm + list **`distinctProductCount`**; queue/detail **N products** chip when ≥2; quick check-in blocked on mixed rows (backend 400 + UI tooltip); checked-in history grouped by product; **`POST …/processing-check-in-batch/{id}/remap-product/`** remaps batch Items atomically; denorm recomputes primary **`matched_product`** to most-units product when dispositioned items exist.
- **Inventory / collapse / check in together (P5)** — workspace list **`sameProductRowNumbers`** peer hints; **Group by product** queue toggle; multi-select + **`CheckInTogetherDialog`**; **`POST …/processing-check-in-together/`** checks in ≥2 same-`matched_product_id` rows atomically (shared condition/price/dispatch; per-row qty; Items keep own **`manifest_row_id`**; no manifest merge writes).
- **Inventory / manifest match deprecation (P6)** — **`POST …/processing-assign-shared-product/`** sets **`ProcessingRow.matched_product_id`** only (no manifest/Item mutation) when multi-selected rows need aligned hints before **Check in together**; **`processing_merge_rows`** / **`MergeModal`** removed; **`POST match-products`** returns **410 Gone**; denorm + row detail no longer fall back to **`ManifestRow.matched_product`**; **`ensure_manifest_products_and_items`** / check-in queue bootstrap sync ProcessingRow hints only.
- **Inventory / check-in & add-item overhaul (P8)** — speed-to-check-in pass per owner spec (buttons over dropdowns; ≤2 clicks + Print on the normal path): **Detailed check-in dialog** replaces its three dropdowns (product action, condition, dispatch) with always-visible **segmented buttons** (`SegmentedButtons`) and shows an **"affects X items across Y orders"** warning when editing a shared product (new `GET /api/inventory/products/{id}/usage/` + `useProductUsage`; fetched only when "Edit linked" is picked — nothing loads on dialog open). **Quick check-in** on a row with no decided product/prior batch now asks explicitly via `QuickCheckInProductPrompt` (New product from row / Existing catalog product / Detailed) instead of silently creating one. **Row detail** moves Row defaults to the **top** of the body (expanded; collapsible) so staff see what they're dealing with before checking in. **Add Item is ONE model everywhere:** the workspace "Add unmanifested item" dialog now hosts the Items-page `ItemForm` (AI suggest, taxonomy category, validation) via `submitOverride` into the existing processing-add-item pipeline (workspace patch + label print + open detail, no refetch), `ItemForm` create is **quantity-aware** (1–500 identical units, one label each), and **`POST /api/inventory/items/` accepts `quantity`** — when the PO is workspace-enabled it routes through `processing_add_item` so units land in the queue as a first-class Added row (response gains `created_count` + `created_items`). 8 new backend tests ([`test_item_create_unified.py`](apps/inventory/tests/test_item_create_unified.py)). **Perf:** `useProductSearch` debounced (250ms, keep-previous results) so product search is one request per pause instead of per keystroke; locked-PO `ItemForm` hosts skip the PO list/detail fetches.
- **Inventory / collapse rows (P7)** — multi-selected same-product manifest rows can now **collapse into one queue row**: `ProcessingRow.collapse_master` self-FK (migration `0059`; presentation + check-in distribution only — manifest untouched), **`POST …/processing-collapse-rows/`** (`product_mode` keep/existing/new — existing/new delegate to assign-shared-product) and **`POST …/processing-uncollapse-rows/`**. The master (lowest row number) shows **combined** qty (`collapsedGroup` rollup in workspace payloads); members are hidden by default (**Show collapsed rows** filter toggle reveals them indented `↳`); check-ins on the master **fill earlier rows first** (5/3/7 + check-in 10 → 5+3+2; overage lands on the last row; `check_in_batch_ids` lists every batch) and members reject direct check-in. Queue bulk bar gains **Collapse rows** / **Uncollapse**; mixed-product selections route through the shared-product dialog in collapse mode (pick existing or **New product from row #N**, one step). **Group-coherent everywhere (owner bug report — detail "Expected" showed only the first row):** the master's **`queue_status` is denorm'd from GROUP totals** (fill-in-order fills the master first, so its own-items status would read `checked_in` and `hide_checked_in`/segment filters would drop a half-checked group from the queue — including when a later check-in touches members only); the master's **row detail** carries `collapsedGroup` plus **every member's items and check-in batches** with a group-level status; the client computes all qty displays/caps from one **`effectiveRowQty`** helper (detail header tiles, quick check-in cap + "Left after", detailed-dialog pills/title — 5/3/7 shows **Expected 15**); a **"⊟ Rows 1, 2, 3 as one"** chip marks group detail; opening a **member** row (e.g. SKU scan) redirects to its master; bulk **Check in together** / **Assign shared product** exclude collapse-involved rows (uncollapse first); the **queue table's Qty cell and qty sort** also use the combined group numbers (the cell rendered raw row fields and missed the first fix). 15 backend tests incl. the owner's 5/3/7→10 example ([`test_processing_collapse_groups.py`](apps/inventory/tests/test_processing_collapse_groups.py)).
- **Inventory / check-in — 500-unit cap removed (owner ruling)** — quantity is no longer silently clamped to 500 anywhere (quick check-in, detailed dialog, check-in together, add-item, `POST /items`): staff can check in thousands at once. Above **100 units** a confirmation interrupts ("You are about to check in X items"), and when labels will print the staffer must type the exact phrase **`PRINT <qty>`** to start the run (`LargeCheckInConfirmDialog` + `largeCheckIn.ts` helpers, unit-tested). The only hard limit left is a **10,000 per-action fat-finger backstop** (`MAX_CHECK_IN_QUANTITY`) that returns an explicit 400 — never a silent clamp (501-unit check-in and 10,001 rejection covered by tests).
- **Inventory / Step 2 web AI cleanup** — staff can click **Run AI Cleanup** again: new **`POST …/ai-cleanup-batch/`** (≤25 staging row ids → one Anthropic call with a 25s client timeout → `PreprocessingRow.ai_*` merge + `final_*` snapshot via shared **`services/ai_cleanup.py`**; `ai_cleanup_generation` guard discards stale saves), **`GET …/ai-cleanup-status/`** now returns **`uncleaned_row_ids`** + `generation` for partition/resume, and fast idempotent **`POST …/ai-cleanup-complete/`** owns match candidates + `ai_cleaned_at`/`preprocess_status`. New **`WebAiCleanupPanel`** runs a browser worker pool (`utils/aiCleanupPool.ts`: batch **10**, concurrency default **4** / cap 8, per-batch retry ×2 with backoff, pause/resume, progress + rows/s + ETA); offline CSV moves under a Step 2 **Advanced** disclosure. Architecture: Fable verdict (initiative [`preprocessing_ai_cleanup_review`](.ai/initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md)).
- **Inventory / chunked offline apply** — **`POST …/apply-cleanup-csv/`** accepts **`partial: true`** (staging only): per-chunk validation + atomic apply without the all-rows coverage gate; toolbar **Run Cleanup** now posts **50 rows per chunk** then calls `ai-cleanup-complete`, so one bad row fails its chunk of 50 — not a 744-row PO — and large applies can't hit the Heroku ~30s router cut. Full (non-partial) apply still enforces exact coverage.
- **Dev tooling / intake regression loop** — `scripts/dev/reset_intake_test_env.bat` + `manage.py reset_intake_test_po` (`services/intake_test_reset.py`): prod-schema pull → migrate → purge PO WLMRT-OJU-3V74 pipeline artifacts → restore post-CSV-upload for repeatable end-to-end intake testing. Manifest resolves storage → rebuild from `PreprocessingRow.raw_row` → validated workspace fixture (cleanup-export-format and row-count-mismatch fixtures rejected); dev-only guard; tests use in-memory storage and an isolated fixture cache. See `.ai/extended/development.md`.

### Changed

- **Ops / Heroku web dyno** — gunicorn moved to threaded workers (**`--worker-class gthread --workers 2 --threads 8`**): AI-cleanup batch requests are ~95% network wait, so threads give ~16 concurrent request slots and the browser pool can't starve POS/staff traffic on the 2-worker dyno.
- **Inventory / Final Decisions — pricing-first toolbar + compact table** — helper text removed; bulk pricing is now four one-click ops (**= AI**, **= Ideal**, **−5%**, **+5%**) plus a single **Target $** field (Scale-AI/%-of-retail mode toggle removed); **all bulk ops apply to the current filter** (no filter = whole order) with a targeted-row-count chip and **Clear filters**; new **Set condition… / Reset to AI condition** bulk control; rows are single-line (description moved into the title hover), with **AI/Std layer values on hover** for title/brand/model/condition; **Ideal (Δ%)** is its own column; units display with thousands separators; **Refresh matches** renamed **Re-match products** with an explanatory tooltip. Follow-up pass: price fields **prefill the AI price** when no final price is set, are wide enough for `$x,xxx.xx` (number spinners hidden), and **Target order total $** now scales every row's **current** price across the **whole order** (ignores filters; Set embedded in the field; Enter applies) with **cent-residual distribution** so the achieved total lands exactly on target (`exactTargetPrices`, unit-tested); toolbar restructured (full-width search row + grouped Price/Target/Cond. ops row; **Re-match products** and **Reset to AI** buttons removed — candidate generation still auto-runs once on first entry); empty search results keep the toolbar + show an inline Clear filters; header shows **order number only** in the selector with **Vendor + Load description** facts beside it (Processing-header style); match popover now separates **Remove match** (back to undecided — `match_source: ''` unset supported by the review PATCH) from **New product** (staff decision); **Step 3 load slimmed**: whole-order totals sweep runs once per order at `page_size=500` (server cap raised from 100) instead of re-sweeping on every keystroke/match click, the cleanup-ids sweep is gated to Step 2, and bulk prefetch merges instead of clobbering the totals map (also fixes stats/Target $ reflecting the filtered subset instead of the whole order). (Owner Step 3 feedback passes, 2026-06-10.)
- **Inventory / legacy `ai-cleanup-rows`** — returns **410 Gone** on staging-active orders (it created Products/Items pre-check-in and wrote `ManifestRow` listing fields — both forbidden by the product-identity design); still works for legacy non-staging orders; full removal after soak. Frontend `aiCleanupRows` / `useAICleanupRows` (already caller-less) deleted.
- **Inventory / reports** — category and retail reporting paths now derive category from Product/ManifestRow and use `Item.unit_retail`, avoiding stale `Item.category` / `Item.retail_value` assumptions.
- **Inventory / workspace list + detail (P3)** — queue and row detail **title/brand/category/UPC** now show coalesced product-wins identity when matched (bookmark/manifest wording may differ); row-default pills display the same coalesced values while **`PATCH …/processing-row-patch/`** still writes bookmark columns only.
- **Inventory / check-in (P3)** — `POST …/processing-row-check-in/` no longer writes **`ManifestRow.matched_product`**; match resolution uses prior batch product → **`ProcessingRow.matched_product`** only (manifest read fallback removed from resolution).
- **Inventory / check-in (P4)** — mixed-product rows (≥2 distinct checked-in products) reject implicit quick check-in; staff must use Detailed check-in with explicit **`product_mode`** + **`product_id`** (or **`new`**).
- **Inventory / Item Processor** — Create Processing Data is now presented as a legacy compatibility build for bookmark-only orders; new linked ProcessingRows can check in directly from row detail.
- **Inventory / Item Processor — quick check-in** — always posts `POST …/processing-row-check-in/`; reuses latest batch **`product_id`** when the row has at most one product; disabled when mixed.
- **Inventory / Item Processor — queue (P5)** — checkbox multi-select, same-product peer chips, **Group by product** filter toggle, and bulk **Check in together** (replaces legacy merge CTA on same-product selection).
- **Inventory / manifest match fields (P6)** — deprecated **`ManifestRow.matched_product`**, **`match_status`**, **`match_candidates`**, **`ai_match_decision`** (help_text + docs); staff identity flows use **`PreprocessingRow.final_matched_product`** / **`ProcessingRow.matched_product`** only; legacy **`match-products`** POST disabled.

- **Inventory / Final Decisions — virtualized client-side table (Processing-queue strategy)** — one whole-order load (2 requests at 500/page, minimal fields now incl. scalar `ai_*`/`standard_*` for tooltips + AI-condition reset) feeds a `@tanstack/react-virtual` table: instant client-side search, no pagination, no double scroll, memoized rows. Candidate matching is **never** triggered from this page (generated once at AI-cleanup completion; auto-regen effect + `regenerateMatchCandidates` frontend surface removed). New clickable **AI** and **Ideal (Δ%)** reference columns on the right — click either to apply that price to the row (AI = row-specific model estimate; Ideal = retail-ratio formula). Saves no longer trigger a refetch (client merge + PATCH summary). Follow-up: processing-style fixed-viewport layout (table body is the only scroller), 3-state column sorting on all data columns, zebra striping, rows compacted to 34px, condition column/select widened.

- **Inventory / assign shared product — new product mode** — `POST …/processing-assign-shared-product/` accepts **`product_mode: new`**: creates a catalog Product seeded from the first selected row's bookmark fields (or payload overrides) and assigns it to all selected rows — the owner-approved pre-check-in Product creation for the "same item, no catalog product yet" case. Dialog gains **"New product from row #N"**. Queue **Qty** column widened (no more ellipsis).

### Fixed

- **Inventory / web AI cleanup — model echoed `ideal_price` instead of pricing** — the batch payload included each row's `ideal_price` and the prompt said to use it as "pricing context"; on PO 323 the model copied it verbatim on **744/744 rows**, so AI prices were never independent estimates. `ideal_price`/`base_cost` are no longer sent; raw responses now logged (INFO size / DEBUG body). Superseded same day by **leashed scaler pricing** (owner design): the model outputs only `retail_suspect` (×10/×100 typo flag — flagged rows get NO price, just a `RETAIL_SUSPECT` soft flag) plus two bounded judgment scalers (`m_resale` 0.05–1.10: real resale fraction of claimed retail; `m_saleability` 0.05–1.00: thrift-channel fit for industrial/parts/warranty/hygiene goods); the server computes `price = unit_retail × m_resale × m_saleability × qty_mult × condition_mult` from deterministic tables and records the full multiplier breakdown in `ai_status.pricing` for audit. Quantity now sent to the model; gold examples teach LEGO-near-retail, industrial parts, inflated-luxury, and retail-typo cases. **Provider switch:** web cleanup now defaults to **`grok-4.3`** (xAI, OpenAI-compatible `api.x.ai/v1`; provider inferred from model id — `grok-*` → xAI, else Anthropic; `XAI_API_KEY` env with dev fallback to the workspace harness key file); batch size raised to **25 rows/request** (server cap 60) since grok-4.3's 1M context handles it; per-request `model` override still works for Claude models.
- **Inventory / stale-state bug sweep (same class as the finalize-rewind guard)** — (1) **Cancel cleanup** cleared only `ai_*`, leaving the `final_*` snapshot, match candidates/decisions, and the order's "cleaned" flags intact — Final Decisions kept showing cleaned data on a supposedly un-cleaned order; it now does the full layer clear (ai_* + final_* + match fields) and resets `ai_cleaned_at`/`preprocess_status`, mirroring the timeline undo. (2) **`ai_cleanup_generation` was not bumped** by the "Before AI cleanup"/"Before finalize" timeline undos or by finalize itself — with the new web batch pool, an in-flight batch could save straight through an undo or overwrite Final Decisions edits after finalize; all three now bump the generation so in-flight batches discard. (3) **Re-uploading a manifest** deleted all staging rows but left `standardized_at`/`ai_cleaned_at`/`preprocess_status` untouched (order claimed "cleaned" with zero staging) and was allowed on finalized orders; upload now 409s when finalized and resets the flow flags otherwise. Regression tests for all three; flaky `BucketFieldEditor` test stabilized (`userEvent` delay removed).
- **Inventory / product matching — 97s → 0.3s on large POs** — `generate_match_candidates_for_order` ran a per-miss `iexact` fallback query for every unmatched UPC and title; on a 744-row PO against the 185k-product backfill catalog that was ~1,500 sequential un-indexed scans (~97s), re-triggered on every Final Decisions visit by the auto-regen effect. Replaced with one `Lower()`-annotated `IN` query per tier (3 scans total, ~0.3s); case-insensitive semantics preserved and covered by the existing 21 matching tests.
- **Inventory / intake undo (manifest spine)** — `intake_undo` no longer treats new-flow **`ManifestRow`** spine rows as legacy blockers: **Before standardize** undo deletes spine rows and clears staging layers while keeping the uploaded CSV; **Before AI cleanup** and **Before finalize (bookmarks)** undo work with spine rows present; blocks remain for processing bookmarks and existing Items ([`intake_undo.py`](apps/inventory/services/intake_undo.py)).
- **Inventory / intake undo — "Before finalize" rewind unblocked for new-flow orders** — the guard blocked whenever bookmarks were manifest-linked, but since the redesign finalize *always* links bookmarks at creation, so the rewind was impossible on every new-flow order. Now blocks only on real downstream facts (Items or **check-in batches**); the rewind also **preserves all Final Decisions edits** (prices, matches, listing fields — `final_*` is written pre-finalize now, so nulling it was stale behavior) and deletes only the `ProcessingRow` bookmarks. Linked-bookmark and batch-blocker test coverage added.
- **Inventory / ensure_manifest + legacy queue (P6 audit)** — `ensure_manifest_products_and_items`, `_build_check_in_queue_from_manifest`, `sync_manifest_row_outputs_to_items`, and `create-items` batch groups now prefer **`ProcessingRow.matched_product`** over legacy **`ManifestRow.matched_product`** when both exist; manifest match FK is never overwritten.
- **Inventory / P6 holistic review** — assign shared product now rejects rows with checked-in units of a different product (denorm would have silently reverted the hint); manual-review sync no longer re-points Items to a single product (protects P4 split rows; identity re-points go through check-in modes / batch remap); legacy chunk build no longer wipes a bookmark's decided match when creating its `ManifestRow` (one-way bootstrap only).
- **Inventory / Add Item** — fixed item detail white-screen after creating an item and fixed AI Suggest 500s caused by nonexistent `Item.category` queries.
- **Inventory / Item Processor — quick check-in** — fixed "Item already dispositioned" when a prior checked-in item was auto-selected (workspace called `processing-print-and-check-in` on an already checked-in unit).
- **Inventory / Item Processor — queue table** — fixed stray sort-icon dot before the **Brand** column header.
- **Inventory / Item Processor — row defaults (Rule 1)** — row-default edits (`PATCH …/processing-row-patch/`) no longer mirror onto the linked **`ManifestRow`** (title/brand/retail/condition/identifiers/…); the manifest stays the frozen vendor claim, so the **Vendor claim** evidence block shows what the vendor actually said. Regression test added; validation-matrix tests that asserted the old sync flipped to assert manifest-frozen. (Fable audit F1 — [`fable_product_matching_audit.md`](.ai/reference/product_identity/fable_product_matching_audit.md).)

### Removed

- **Inventory / dead frontend hooks** — `useClearManifestRows` / `useClearPricing` (+ `clearManifestRows` / `clearPricing` API fns and response types) deleted: legacy "Undo Step" hooks with no callers, superseded by the intake timeline undo. Backend endpoints retained as admin utilities.
- **Inventory / legacy match flow dead code (Fable audit F2)** — deleted the unreachable `POST …/undo-product-matching/` endpoint (cleared only deprecated `ManifestRow` match columns; no page called it) and the unmounted legacy panels **`ProductMatchingPanel`**, **`MatchReviewPanel`**, **`FinalizePanel`**, plus the orphaned frontend surface: `matchProducts` / `getMatchResults` / `reviewMatches` / `undoProductMatching` API fns (the latter three pointed at endpoints that no longer exist or return 410), `useMatchProducts` / `useMatchResults` / `useReviewMatches` / `useUndoProductMatching` hooks, their payload/response interfaces, `MatchStatus` / `AIMatchDecision` / `MatchCandidate` types, unread `ManifestRow` match fields on the TS interface, and orphaned `matchResults` query-key invalidations.

---

## [2.27.2] — 2026-06-01

User-facing theme: **Blog polish** — tighten the blog landing copy and keep draft URLs from showing `untitled-post` after a title change.

### Changed

- **Frontend / public blog** — `/blog` hero copy now reads **Founder Notes**, **The Eco-Thrift Journal**, and the shorter transparency-focused description; SEO description matches the visible page copy.

### Fixed

- **Frontend / Blog Studio** — draft/scheduled post URL previews now use the current title-derived slug until first publish, and autosave continues sending `slug: ''` for unpublished posts so the backend regenerates from the title instead of retaining `untitled-post`.

---

## [2.27.1] — 2026-06-01

User-facing theme: **Blog Studio polish** — rename series in the Publish panel and align studio chrome with Bold Modern sage accents.

### Added

- **Frontend / Blog Studio** — inline **series rename** next to the Series dropdown (saves on blur or Enter via `PATCH /api/blog/series/<id>/`); create-series still uses the existing prompt.

### Changed

- **Frontend / Blog Studio** — studio chrome accents (mark, kicker, slug, toolbar active state, links, blockquotes, focus rings, primary publish button) now use the sage **Bold Modern** blog accent instead of clay.

---

## [2.27.0] — 2026-06-01

User-facing theme: **Blog Studio** — a Super Admin-only writing room in the staff dashboard, plus a database-backed public blog so posts can be drafted, scheduled, and published without a code change. Begins initiative [`blog_studio.md`](.ai/initiatives/_archived/_completed/blog_studio.md).

### Added

- **Backend / blog** — new app **`apps.blog`** (`/api/blog/`): models `BlogSeries`, `BlogPost`, `BlogPostRevision`, and `BlogImage` (backed by `core.S3File`). A single **`BlogPost.objects.live()`** manager (published, or scheduled with a past time) is the one visibility source shared by the public list, detail, Home, and sitemap, so **scheduling works at request time with no worker/cron**. Slugs auto-generate from the title and **lock once a post is first published** (protects live URLs). `body_html` is **sanitized server-side at save time with `bleach`** (explicit tag/attribute allow-list) before it is ever rendered with `dangerouslySetInnerHTML`; TipTap `body_json` stays the editable source of truth and `body_text` is derived for word/read counts. Public `AllowAny` read endpoints (live list, detail-by-slug, active series) + a host-agnostic **image proxy** (`images/<id>/`, keeps S3 private). Each staff save snapshots a **revision**.
- **Backend / auth** — new permission **`IsSuperAdmin`** (Django `is_superuser`) and `is_superuser` now exposed (read-only) on `GET /api/auth/me/`, gating owner-only tooling.
- **Backend / seeding** — `python manage.py seed_initial_blog_posts` (idempotent) imports the three founder posts (`navigating-growth`, `turns-two`, `our-vision`) under an **Early days** series, uploading their hero art to storage.
- **Frontend / staff** — **Blog Studio** at a standalone full-screen route **`/blog-studio`** (outside `MainLayout`; `ProtectedRoute` + new `SuperAdminRoute`), **lazy-loaded so the net-new TipTap editor ships as its own chunk and never enters the main staff bundle**. A superuser-only **`Blog studio`** item sits at the bottom of the Admin workspace and **opens in a new window** (`openInNewWindow`; `superuserOnly` nav filtering). The three-pane studio (Library · writing desk · Publish cabinet) follows the refined Blog Studio layout with the **Bold Modern** typography group (DM Serif Display + DM Sans): WYSIWYG TipTap editor with formatting toolbar + inline image upload, debounced **autosave** (slug tracks the title until first publish), hero image replace, excerpt, series **create/continue**, native date+time **scheduling**, social/SEO preview, and **publish / schedule / save draft / duplicate / archive** actions.
- **Frontend / staff authoring tools** — Blog Studio now has reader preview, rich paste cleanup, selection-aware word/character counts, shortcut hints, callouts, tables, safe no-iframe link cards with removable selected-card controls, image alignment/size controls, code/pull-quote/drop-cap/columns blocks, and portal-safe color/highlight swatches.
- **Frontend / public blog** — the blog is now **database-backed**: `frontend-public` fetches via `fetchBlogPosts` / `fetchBlogPost` / `fetchBlogSeries`; `BlogPage`, `BlogPostPage`, `HomePage` ("Notes from Bill"), and `PostCard` read the API with loading/empty states. Post bodies render the sanitized `body_html` with extended `.abody` article CSS (h2/h3, blockquote, lists, links, images), and SEO/JSON-LD use API data.

### Changed

- **Backend / sitemap** — `/sitemap.xml` blog URLs are now generated from `BlogPost.objects.live()` (the hardcoded `_SITEMAP_BLOG_SLUGS` list is gone).
- **Backend / redirects** — `apps.core.middleware.rewrite_legacy_path` maps the known legacy Shopify blog article handles (e.g. `…/what-we-have-accomplished-so-far` → `/blog/navigating-growth`) to their new slugs instead of the generic `/blog` list.
- **Frontend / public** — static `BlogPost`/`POSTS` content removed from `frontend-public/src/data/content.ts` (now DB-backed).
- **Frontend / blog typography** — public blog list/article rendering and Blog Studio preview/editor styling now use the **Bold Modern** group (DM Serif Display + DM Sans, sage accent/drop cap, soft green highlight wash), updating old published blog posts through CSS without rewriting their stored HTML.
- **Dependencies** — added `bleach` (Python, server-side HTML sanitization) and TipTap packages to the staff app (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `extension-link`, `extension-image`, `extension-placeholder`, `extension-underline`, `extension-table`, `extension-table-row`, `extension-table-header`, `extension-table-cell`).

### Fixed

- **Frontend / Blog Studio** — color/highlight picker chips now render inside MUI popovers (portal-safe swatches), and selected link cards no longer navigate in edit mode before the owner can remove them.

### Deploy

- After deploy, run **`python manage.py seed_initial_blog_posts` once on production** to import the three existing posts (idempotent; skips slugs that already exist). Until then the public blog will be empty.

### Documentation

- **`public_website`** initiative parked in [`.ai/initiatives/_archived/_pending/public_website.md`](.ai/initiatives/_archived/_pending/public_website.md) (Session 7 closed; no active initiative on index). Resume notes: deploy, prod `seed_shop_categories`, Helcim + email.

---

## [2.26.0] — 2026-05-30

User-facing theme: **Public website — Phases 0–4** (hostname split + marketing site + curated catalog + in-store-pickup checkout + launch hardening). The public domains (`ecothrift.us`, `www.ecothrift.us`) now serve the new public Eco-Thrift storefront — marketing pages, a live hand-curated **Shop** (browse, product detail, cart), and **online checkout** (in-store pickup at Canfield) with staff order management — instead of the staff dashboard login; the staff dashboard stays on `dash.ecothrift.us`. Launch hardening includes SEO metadata, a sitemap, redirects from old Shopify URLs, and code-split loading. (Card charging is stubbed pending a payment processor; orders are placed end-to-end and payment is arranged by staff.)

### Added

- **Backend / public site** — `apps.core.middleware.PublicSiteMiddleware` host-based routing: serves the public site on the public hosts (the built public SPA when present, else a Django-rendered holding page at `apps/core/templates/public/holding.html`), enforces a canonical host with a **301 redirect** (`www` → apex), and passes `/api/`, `/static/`, `/assets/`, `/media/`, `/db-admin/` through untouched. New settings **`PUBLIC_SITE_HOSTS`** / **`PUBLIC_SITE_CANONICAL_HOST`** (production defaults to apex + www; empty in local dev so the dashboard is unaffected). Begins initiative [`public_website.md`](.ai/initiatives/public_website.md).
- **Frontend / public site** — new **`frontend-public/`** Vite + React + TypeScript app (separate build from the staff dashboard, so shoppers never download the staff bundle). Marketing pages built from real store copy: **Home, Blog list + post**, **Visit, Sell**, and a branded **404**, with the storefront design system (Spectral/Manrope, brand greens), shared header/category-subnav/footer, and per-page titles + meta description for SEO. Built assets are served at `/static/site/*`; the SPA `index.html` is served on the public hosts via `PublicSiteMiddleware`.
- **Backend / web catalog** — new app **`apps.webstore`** (`/api/webstore/`): models `WebListing` + `WebListingImage` for a hand-curated catalog (optional links to `inventory.Category` / `inventory.Item`; condition, price, compare-at, stock, draft/published/archived, featured). Public `AllowAny` API — catalog list (category/search/sort/featured/on-sale/available filters), detail-by-slug, category counts — plus an **image proxy** (`images/<id>/`) that keeps S3 private (302 → short-lived presigned URL, streams in local dev). Staff `IsStaff` CRUD via `WebListingViewSet` with multipart photo upload / reorder / delete.
- **Frontend / staff** — new **Web store** admin area (Admin workspace, `storefront` icon, `/admin/web-store`, Manager/Admin): DataGrid list + create/edit dialog (category, condition, price/compare-at, stock, status, featured, SKU, description) with inline photo upload and delete.
- **Frontend / public shop** — the Shop is now a live catalog: category sidebar with counts, sort + search, sale/sold-out badges, product **detail** pages (`/shop/:slug`) with image gallery and quantity, and a persistent **client-side cart** (drawer + header button, `localStorage`).
- **Backend / orders + checkout** — `apps.webstore` gains `Order` + `OrderLine` (auto `ETW#####` numbers; statuses pending/paid/fulfilled/cancelled; payment provider/status/reference; pickup/ship + address; money snapshot). Public `AllowAny` **`POST checkout/`** validates the cart, **atomically reserves stock** (409 on oversell), computes flat-rate shipping + Nebraska sales tax, creates the order, and runs a **provider-agnostic payment layer** (`payments.py`) — a `manual` stub records the order awaiting payment now, with a `Helcim` provider ready to wire by config (no Stripe). **`GET order-status/<number>/`** for public lookup. Best-effort **order-confirmation email** (console backend by default). Staff `IsStaff` `OrderViewSet` (list/retrieve, editable payment status/reference + staff note) with a `set-status` action that **restocks** on cancel. New settings `WEBSTORE_PAYMENT_PROVIDER`, `WEBSTORE_SALES_TAX_RATE`, `WEBSTORE_SHIP_FLAT`, `WEBSTORE_ORDER_NOTIFY_EMAIL`, `EMAIL_BACKEND`, `DEFAULT_FROM_EMAIL`.
- **Frontend / public checkout** — new **`/checkout`** (contact, in-store pickup summary, order summary) and **`/order/:number`** confirmation (status, totals, fulfillment, emailed-to). The cart drawer's primary action is now **Checkout** (replacing reserve-by-email).
- **Frontend / staff** — new **Web orders** admin area (Admin workspace, `receiptLong` icon, `/admin/web-orders`, Manager/Admin): DataGrid (order/date/customer/status/payment/fulfillment/total with filters + search) and a detail dialog with line items, totals, customer/shipping info, status action buttons (mark paid / fulfilled / cancel), and editable payment status/reference + internal staff note.
- **Public site / SEO + launch hardening** — per-route metadata via a new `useSeo` hook (title, description, **canonical** URL, **Open Graph** + **Twitter** cards, `robots`) with **JSON-LD** structured data (Store/LocalBusiness on Home + Visit, Product on listing pages); **`/sitemap.xml`** (marketing pages + blog posts + every published listing) and **`/robots.txt`** served on the public host; **301 redirects from old Shopify URLs** (`/products`, `/collections`, `/blogs`, `/pages/*`, `/cart`, `/account`) merged with the canonical-host redirect so legacy links resolve in one hop; an SVG **favicon** + `theme-color`; and **route code-splitting** (smaller initial download). Checkout, order, and 404 pages are `noindex`. Optional privacy-friendly **Plausible analytics**, off unless `VITE_PLAUSIBLE_DOMAIN` is set at build.

### Changed

- **Build / deploy** — root `heroku-postbuild` now also installs and builds `frontend-public/` (`STATICFILES_DIRS` collects it under `STATIC_ROOT/site`); `.gitignore` ignores `frontend-public/{node_modules,dist,.vite}`.
- **Public site / store facts** — retail location updated to **Eco-Thrift — Canfield** (8425 W Center Rd, Omaha NE 68124; Mon–Sat 9–6, closed Sun; (402) 881-9861); removed the closed **8072 H St** warehouse block from Visit + holding page.
- **Public site / shop categories** — storefront taxonomy aligned to **`TAXONOMY_V1_CATEGORY_NAMES`** (19 categories); `apps/webstore/shop_categories.py` + `manage.py seed_shop_categories`; legacy Shopify `/collections/*` 301s map to taxonomy slugs.
- **Public site / checkout UX** — pickup-only on the storefront (removed ship option and nationwide-shipping copy); **Sell** page is a “coming this summer” placeholder; prominent sticky **under construction** banner; high-res header/footer logos; embedded **Google Maps** on Visit; three founder blog posts with photos; dev **`start_servers.bat`** also runs public Vite on **:5174**.
- **Public site / pre-deploy polish** — removed global category **subnav** (shop categories only on `/shop` sidebar — fixes horizontal scroll); removed outdated **daily markdown / 5%** pricing copy sitewide; **Get directions** uses the Google **place pin** (`retailMapsDirectionsUrl`, not street-address search); Visit address block uses stacked labels; dropped “Near S 84th…” line; holding page aligned (see [`public_website.md`](.ai/initiatives/public_website.md) Session 7).

### Documentation

- Initiative **[`public_website.md`](.ai/initiatives/public_website.md)** (Phases 0–4 code-complete); steering in **`.ai/context.md`**, **`.ai/extended/frontend.md`**.

---

## [2.25.0] — 2026-05-30

User-facing theme: **Staff nav workspace sidebar** — lifecycle workspaces replace the accordion nav; shared links stay in the workspace you clicked from; unused staff pages trimmed.

### Added

- **Frontend / staff nav** — **Slot C workspace sidebar** (252px): pinned Essentials (Dashboard, Employees) + lifecycle workspaces **Buying → Processing → Restoration → Floor → Cashier → Admin**; **Alt+1..6** shortcuts; workspace persistence (`ecothrift.navC.workspace.v1`). Shared module: `frontend/src/navigation/`. Bake-off switcher and Classic/Composer/Slot B variants removed. See archived initiative [`staff_nav_redesign.md`](.ai/initiatives/_archived/_completed/staff_nav_redesign.md).
- **Frontend / restoration** — TARS placeholder at `/restoration/tars` (Test, Assemble, Repair, Salvage workflows coming later).

### Changed

- **Frontend / staff nav** — Sticky workspace: sidebar clicks pass `navFromSidebar` and keep `selectedWorkspaceId`; external URL entry (bookmark, refresh, address bar) resolves the **lowest lifecycle #** workspace via `resolveWorkspaceForRoute` in `slotCNavLayout.ts` (e.g. `/inventory/items` → Floor, not Cashier).
- **Frontend / staff nav** — Hidden from sidebar: HR Time Clock, Time History, Sick Leave; staff Consignment block (routes remain). Removed Inventory Admin subgroup from nav.

### Removed

- **Frontend / routes** — Deleted pages/routes: `/inventory/admin/categories`, `/inventory/legacy` (+ orders, admin redirect), `/inventory/processing-legacy`, `/inventory/products`, `/inventory/templates`, `/pricing` (public SKU lookup). **`ProcessingPage`**, **`ProcessingSettingsModal`**, legacy hub pages, product list, templates splash, public lookup page files deleted. Backend product/template/lookup APIs unchanged.

### Fixed

- **Frontend / staff nav** — Cashier → Search items no longer auto-switches workspace to Floor when both workspaces list the same catalog link.

### Documentation

- **Initiatives** — Archived **[`staff_nav_redesign.md`](.ai/initiatives/_archived/_completed/staff_nav_redesign.md)**; active **[`web_ui_cleanup.md`](.ai/initiatives/web_ui_cleanup.md)**. Steering in **`.ai/context.md`**, **`.ai/extended/frontend.md`**, **`frontend/src/navigation/README.md`**.

### Tests

- **`frontend`**: **`npm run build`**.

---

## [2.24.2] — 2026-05-19

User-facing theme: **Order hot-path fix** — opening and editing purchase orders stays fast on large POs; production no longer wedges when debounced field saves run.

### Fixed

- **Inventory / PO hot path** — `GET` retrieve, `detail-surface`, and `PATCH` use a single-row PO queryset (no multi-`Count` annotations on items). `PATCH` returns the same lean shape as detail-surface.
- **Inventory / processing stats** — New `GET …/orders/{id}/processing-stats/` runs one grouped count on items plus batch-group aggregates; removed live `processing_stats` from default retrieve.
- **Inventory / Order Detail** — Debounced PATCHes are serialized (one in-flight per tab) to avoid exhausting Gunicorn workers.
- **Buying / category stats** — Taxonomy bucket SQL uses `product.category` and `manifest_row.category` (dropped `item.category` column).

### Changed

- **Inventory** — Composite index on `Item (purchase_order, status)` for grouped status counts.
- **Frontend** — Processing and Receiving pages use detail-surface + processing-stats instead of heavy retrieve.

### Tests

- **`python -m pytest apps/inventory/tests/test_po_manifest_meta_surface.py apps/buying/tests/test_taxonomy_bucket_sql.py apps/buying/tests/test_phase5_category_need.py -q --tb=short`** — **16 passed**.
- **`frontend`**: **`npm run build`**.

---

## [2.24.1] — 2026-05-18

User-facing theme: **Processing gate hotfix** — staff can run **Orders → upload manifest → Preprocessing → Processing** while **Receiving** and **Disputes** remain independent until trained.

### Fixed

- **Inventory / Processing data build** — `build-processing-data`, chunk polling, and clear-processing-data normalize Django validation errors into structured API responses instead of leaking 500s.
- **Inventory / Processing gate** — Processing now requires finalized preprocessing only; it no longer requires `receiving_status='done'`. This keeps Receiving operationally independent for now while allowing staff to create processing data, print, check in, merge, and dispute from Processing.

### Tests

- **`python -m pytest apps/inventory/tests/test_preprocessing_redesign.py apps/inventory/tests/test_processing_validation_matrix.py apps/inventory/tests/test_receiving_api.py -q --tb=short`** — **98 passed**.
- **`frontend`**: **`npm run build`**.

---

## [2.24.0] — 2026-05-18

User-facing theme: **Inbound intake stabilization** — purchase orders can move more safely through **Orders → Preprocessing → Receiving → Processing handoff → Disputes / repair**, with schema rails, repair tooling, dashboard fallbacks, and frontend guardrails for business-hours release.

### Added

- **Inventory / intake schema wave** — Migrations **`0045_purchase_order_manifest_meta`** … **`0051_rename_inventory_d_purchas_2f1e4c_idx_inventory_d_purchas_c3911a_idx_and_more`** add purchase-order manifest metadata, preprocessing/receiving/processing/dispute status rails, timestamp rollups, **`Dispute`** persistence, and processing track compatibility. **`0047`** removes the legacy **`PreprocessingOrder`** intermediary.
- **Inventory / intake services** — Added deterministic intake repair / verification (**`repair_intake_pipeline_pos`**, **`intake_po_repair`**), intake gates, undo/reset helpers, manifest metadata/remove helpers, and dispute rollups for operational recovery.
- **Frontend / order detail** — Added the intake timeline drawer for order lifecycle visibility and undo/purge previews.

### Changed

- **Inventory / Orders dashboard** — Dashboard/list vendor filtering now falls back across **`vendor_name_cache`** and **`vendor__name`** so stale-empty cache rows still appear.
- **Inventory / Receiving and Processing** — Receiving statuses/timestamps, pallet counts, processing track fields, and legacy-processing flags are aligned for the rebuilt intake path.
- **Inventory / Preprocessing** — Preprocessing rows link directly to **`PurchaseOrder`** after **`0047`**, with final snapshot/backfill behavior documented for the rebuild wave.

### Fixed

- **Inventory / rollout repair** — Rollout PO identity mapping for ids **316–319** is canonicalized across migration expectations, repair verification, and tests: **`316=AMZ0N-OQL-CCP4`**, **`317=C5TC0-OM1-A8R3`**, **`318=TRGET-O4U-QP68`**, **`319=TRGET-O2R-1K40`**.
- **Inventory / Item Processor** — **`processing_dispute`** now commits item mutation, denorm refresh, and dispute row creation in one atomic unit so downstream failures roll back disputed item status.
- **Frontend / Orders** — Debounced order-detail PATCHes no longer silently discard pending edits when the detail cache is absent; failed PATCHes restore the pending snapshot.
- **Frontend / Receiving** — Desktop receiving renders a clear missing-order-detail fallback instead of crashing on an unsafe **`po.data!`** access.

### Operations

- **Deploy / verification** — Rehearsed **`python manage.py migrate`**, **`repair_intake_pipeline_pos --verify`**, targeted inventory pytest matrix (**121 passed**), and **`frontend npm run build`** before release.
- **Reference docs** — Intake recon SQL, order API SQL references, deep-dive reports, and Session 15 steering updates are captured under **`.ai/reference/order_processing_pipeline_rebuild/`** and **`.ai/reference/deep_dive/latest/`**.

---

## [2.23.0] — 2026-05-06

User-facing theme: **Item Processor workspace search** — substring search spans listing fields plus flattened **`identifiers`**, **`specifications`**, **`tracking`**, **`taxonomy`**, and **`search_tags`** via a persisted lowercased **`ProcessingRow.search_string`**; **`POST …/manual-review/`** mirrors edited manifest lines onto linked bookmarks so renamed titles stay findable.

### Added

- **Inventory / Item Processor** — **`ProcessingRow.search_string`** (migration **`0043_processingrow_search_string`**) rebuilt on every ORM **`save()`** (`update_fields` automatically includes **`search_string`**) plus explicit **`bulk_update`** paths; **`manage.py rebuild_processing_search_string`** (`--purchase-order-id`, `--dry-run`, `--batch-size`; excludes **`complete`**/**`cancelled`** POs by default).
- **Inventory / Item Processor (API)** — Workspace list rows expose **`searchString`** (from **`search_string`**); **`POST …/manual-review/`** updates linked **`ProcessingRow`** searchable fields after manifest saves (**`mirror_manifest_rows_into_processing_bookmarks`**).
- **Frontend / Item Processor** — **`processingWorkspaceSearchBlob`** reads API **`searchString`** (canonical blob); legacy **`buildProcessingSearchBlob`** retained for tests only — [`processingWorkspaceFilters.ts`](frontend/src/pages/inventory/processing/processingWorkspaceFilters.ts); [`inventory.types.ts`](frontend/src/types/inventory.types.ts).

### Changed

- **Inventory / Item Processor** — **`processing-workspace`** **`search`** param matches **`search_string__contains`** (tokens lowercased); pure-digit / **`rowNNN`** tokens still resolve **`row_number`** exactly — [`processing_workspace.py`](apps/inventory/services/processing_workspace.py).

### Documentation

- **`.ai/extended/development.md`** — optional periodic **`rebuild_processing_search_string`** note for bulk/SQL bypass safety net.

### Tests

- **`python manage.py test apps.inventory.tests.test_processing_validation_matrix apps.inventory.tests.test_preprocessing_redesign --noinput`** — **82 tests OK**.
- **`frontend`**: **`npx vitest run`** — **`processingWorkspaceFilters.test.ts`** (14).

### Build

- **`frontend`**: **`npm run build`**.

---

## [2.22.1] — 2026-05-02

User-facing theme: **Item Processor timeout hotfix** — row detail and purchase order loads avoid heavy manifest prefetch storms.

### Fixed

- **Inventory / Item Processor** — **`GET …/processing-row-detail/`** uses the slim **`PurchaseOrderViewSet`** queryset path by including **`processing_row_detail`** in slim actions (**no** annotate-stats + prefetch of all manifest rows on **`get_object`**).
- **Inventory** — **`GET /api/inventory/orders/{id}/`** retrieval no longer runs **`prefetch_related('manifest_rows')`** while keeping **`processing_stats`** and manifest row count annotations.
- **Frontend / Item Processor** — Removed **`onPointerEnter`** hover prefetch from **`ProcessingQueueTable`** (**no** **`processing-row-detail`** requests while moving the mouse across rows).
- **Frontend / Item Processor** — **`useProcessingRowDetail`** uses **`retry: false`** and **`refetchOnWindowFocus: false`** so failed detail loads do not loop.

### Tests

- **`python manage.py test apps.inventory.tests.test_processing_validation_matrix apps.inventory.tests.test_preprocessing_redesign --noinput`** — **79 tests OK**.

### Build

- **`frontend`**: **`npm run build`**.

---

## [2.22.0] — 2026-05-02

User-facing theme: **Item Processor row identity** — workspace selection and bulk flows use **`processing_row_id` / `processing_row_ids`** consistently; the server maps to manifest lines and items; unlinked bookmarks get a clear **`processing_data_required`** error.

### Added

- **Inventory / Item Processor** — **`processing_rows`** dispute scope and **`processing_row_ids`** (or **`ids`**) for bulk dispute; **`processing_row_id`** for print-multiple; **`processing_row_ids`** for merge and bulk disposition (**`POST …/processing-dispute/`**, **`processing-print-multiple/`**, **`processing-merge-rows/`**, **`processing-bulk-disposition/`**) — [`apps/inventory/processing_ops.py`](apps/inventory/processing_ops.py); [`apps/inventory/views.py`](apps/inventory/views.py). Legacy **`manifest_row_*`** fields remain accepted during transition; if both forms are sent they must agree or the request is rejected.
- **Inventory** — **`ProcessingDataBuild`** model and migration **`0042_processing_data_build`** for resumable chunked processing-data creation ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/migrations/0042_processing_data_build.py`](apps/inventory/migrations/0042_processing_data_build.py)).

### Changed

- **Inventory / Item Processor** — Merge mutations refresh **`ProcessingRow`** denorm only for manifest lines involved in the merge (not every row on the PO) ([`apps/inventory/processing_ops.py`](apps/inventory/processing_ops.py)).
- **Inventory / Item Processor (frontend)** — Modals and bulk bar send row-first payloads; bulk actions are disabled when selection includes rows with no linked manifest line, with on-bar copy ([`ProcessingWorkspacePage.tsx`](frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx); [`ProcessingBulkActionBar.tsx`](frontend/src/pages/inventory/processing/ProcessingBulkActionBar.tsx); modal files under [`frontend/src/pages/inventory/processing/modals/`](frontend/src/pages/inventory/processing/modals/)). **`BulkDispositionModal`** uses **`pendingItemCount`** when **`items`** is empty on workspace list rows ([`BulkDispositionModal.tsx`](frontend/src/pages/inventory/processing/modals/BulkDispositionModal.tsx)).

### Fixed

- **Frontend** — Restored **`processingBulkDisposition`** export in [`inventory.api.ts`](frontend/src/api/inventory.api.ts) (Vite import error with **`useProcessingWorkspace.ts`**).

### Tests

- **`python manage.py test apps.inventory.tests.test_preprocessing_redesign apps.inventory.tests.test_processing_validation_matrix --noinput`** — extended row-first coverage; **77 tests OK** ([`test_processing_validation_matrix.py`](apps/inventory/tests/test_processing_validation_matrix.py)).

---

## [2.21.1] — 2026-05-02

User-facing theme: **Processing data hotfix** — large finalized POs can enter Item Processor without the heavy product-matching build path timing out on Heroku.

### Fixed

- **Inventory / Item Processor** — **`POST /api/inventory/orders/{id}/build-processing-data/`** now uses a fast minimal build from **`ProcessingRow`** bookmarks: bulk creates **`ManifestRow`** + **`Item`** rows, pre-generates SKUs, sets item search text before **`bulk_create`**, preserves the existing response shape, and defers Product matching / Product rollups / BatchGroup creation so large POs avoid router timeouts ([`apps/inventory/services/processing_finalize.py`](apps/inventory/services/processing_finalize.py); [`apps/inventory/tests/test_preprocessing_redesign.py`](apps/inventory/tests/test_preprocessing_redesign.py)).
- **Inventory / Item Processor workspace** — Removed the full-PO duplicate UPC JSON scan from **`processing-workspace`** list and mutation patch payloads; duplicate hints are intentionally blank during this hotfix so large PO pages and patches stay bounded by visible/touched rows ([`apps/inventory/services/processing_workspace.py`](apps/inventory/services/processing_workspace.py); [`apps/inventory/tests/test_processing_validation_matrix.py`](apps/inventory/tests/test_processing_validation_matrix.py)).

### Tests

- **`python manage.py test apps.inventory.tests.test_preprocessing_redesign apps.inventory.tests.test_processing_validation_matrix --noinput`** — **66 tests OK**.

---

## [2.28.0] — 2026-06-10

User-facing theme: **Intake overhaul** — product identity through the whole pipeline (candidates → Final Decisions → product-wins display → split/collapse at check-in, with the manifest frozen as vendor evidence) plus Step 2 **Run AI Cleanup** returns as a resumable in-app batch pool, with offline Grok CSV as a chunk-applied fallback. Fulfills initiatives [`intake_processing_improvements`](.ai/initiatives/intake_processing_improvements.md) (Sessions 3–9, P1–P6 + audit) and [`preprocessing_ai_cleanup_review`](.ai/initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md) (Sessions 1–2).

**Deploy notes:** migrations 0053–0058 (all additive) run via the release phase; the Procfile change (`gunicorn --worker-class gthread --workers 2 --threads 8`) takes effect on this deploy and is required for the cleanup pool's concurrency; requires `ANTHROPIC_API_KEY` (already set for the AI proxy).

### Added (bake-off history)

- **Frontend / staff nav** — Multi-variant sidebar bake-off: shared `frontend/src/navigation/` module (`navItemCatalog`, hooks, registry); **Classic** (extracted baseline) and **Composer** (workflow-grouped, auto-collapse, 248px) variants; Admin-only **Nav Variant** switcher (`ecothrift.navVariant` in `localStorage`); Slot B/C placeholders for additional designs. See archived initiative [`staff_nav_redesign.md`](.ai/initiatives/_archived/_completed/staff_nav_redesign.md).
- **Frontend / staff nav (Slot B "quick-nav")** — Filter-first sidebar variant (256px): header-less pinned rows (Dashboard, Employees), **single-open accordion** (Inbound, Catalog, Point of sale, Buying) with the active route's section auto-opening (`ecothrift.navB.openSection.v1`), Administration pinned to the bottom, and a **Ctrl/Cmd+K jump-to filter** (arrow/enter/escape keyboard nav) as the fast path. Adds reusable `navResolve.ts` (`resolveNavItem`/`resolveNavGroups`) and a `slotB` `NavItemRow` style (neutral-pill active, no left rail).
- **Frontend / staff nav (Slot C "workspace")** — Workspace-first sidebar variant (252px): persistent Essentials (Dashboard, Employees), compact domain selector (Inbound, Catalog, Store, Buying, Admin), exactly one active workspace panel, manual workspace persistence (`ecothrift.navC.workspace.v1`), and **Alt+1..5** switching for visible workspaces. Adds `slotCNavLayout.ts` and a `slotC` `NavItemRow` style (compact active pill with right-side green marker).

### Changed

- **Visual authority:** **[`final_review_visual_rebuild_directive.md`](.ai/reference/final_review_visual_rebuild_directive.md)** is mockup ground truth for Pass 1; **[`fix_this.md`](.ai/reference/fix_this.md)** is the short pointer. **[`consult_design_final_review.md`](.ai/reference/consult_design_final_review.md)** and **[`final_review_ui_rebuild_plan.md`](.ai/reference/final_review_ui_rebuild_plan.md)** stay useful for behavior notes; where they **disagree on visuals**, the **directive** wins for the first pass.
- **Pass 1 (directive):** Stepper labels (**Manual Review** / **Finalize and Open Processing**), six summary stats, toolbar **Save Changes** tied to the active filter, dense table columns without horizontal scroll, bulk pricing on **filtered rows** (not a row-selection gate). **No** `@tanstack/react-virtual` in Pass 1. Count-based indicators **hidden at zero** and variance **tolerance bands** per **[`.ai/extended/ux-spec.md`](.ai/extended/ux-spec.md)**.
- **Later / Pass 2 (broader plan):** Explicit row selection for bulk, single `deriveFinalReviewIssues` source of truth, remove blur/interval auto-save in favor of **Save Changes** + `useBlocker`, keyboard cheatsheet, virtualization — see **`final_review_ui_rebuild_plan.md`** (banner: directive precedes conflicting items). Checklist and review gate (section 8 in that doc): **`final_review_visual_pass_plan.md`**.

**Out of scope for this rebuild:** Step 1 Standardize Manifest and Step 2 AI Cleanup panels unchanged; API contract, `PreprocessingRow` model, and serializers unchanged.

### Added

- **Core / LLM** — **`apps/core/services/llm_chat.py`**: single-turn **`llm_chat_completion_text`** routes to Anthropic or xAI Grok from **`AI_PROVIDER`** (`auto` / `anthropic` / `xai`) and model id (`grok*` → xAI when **`auto`**). Dependency **`openai`** ([`requirements.txt`](requirements.txt)).
- **Tests** — **`test_preprocessing_redesign`** covers dict **`ai_status`**, bad CSV cell → **`{}`**, review **`PATCH`** clears **`ai_status`**, **`GET`** includes **`ai_status`**, **`batch_flag`**-only preserve ([`apps/inventory/tests/test_preprocessing_redesign.py`](apps/inventory/tests/test_preprocessing_redesign.py)).

### Changed
- **Inventory / Preprocessing finalize** — **`ensure_manifest_products_and_items`** defers per-item **`PurchaseOrder.recompute_item_costs`** during bulk item sync (**`Item.save(..., defer_po_cost_recompute=True)`**), runs a **single** PO-wide recompute at the end, **`ManifestRow`** link fields via **`bulk_update`**, batched **`Product`** aggregate/count updates, prefetch **`batch_groups`** on finalize's batch-detection loop, and in-request Product lookup caches (UPC / vendor ref / exact match) to reduce Heroku request timeouts on large manifests ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / Preprocessing staging** — **`PreprocessingRow`** is three-layer (**`standard_*`**, **`ai_*`**, **`final_*`**, **`ai_title`** / **`final_title`**); **`final_*`** stay **`NULL`** until finalize; re-standardize after confirm clears **`ai_*`** and resets **`final_*`** on staging; **`GET …/download-cleanup-csv/`** reads **`standard_*`** only; narrow cleanup apply writes **`ai_*`**; preprocessing review search **`OR`**s text across standard/AI/final tiers (title uses **`ai_title`** / **`final_title`**); **`ManifestRow`** drops **`ai_suggested_*`** (canonical **`title`** / **`brand`** / **`model`** after finalize). Offline Grok CSV wire remains unprefixed; Django maps import/export ([`apps/inventory/models.py`](apps/inventory/models.py); migration **`0036_preprocessing_three_layer`**; [`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/serializers.py`](apps/inventory/serializers.py)).
- **Inventory / Preprocessing** — **`POST /api/inventory/orders/{id}/suggest-formulas/`** uses **`llm_chat_completion_text`** instead of Anthropic-only SDK calls; missing credentials return **`LLMConfigError`** as HTTP 503 ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Settings** — **`XAI_API_KEY`** (alias **`GROK_API_KEY`**), **`XAI_API_BASE`**, **`AI_PROVIDER`**; **`_normalize_anthropic_model_id`** passes through Grok model ids ([`ecothrift/settings.py`](ecothrift/settings.py)).
- **Manifest mapping** — **`MANIFEST_SOURCE_ALIASES`** adds **`title`** and **`condition`** synonyms; vendor item column label notes cleanup CSV **`sku`** ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Tests** — **`test_default_column_mappings_maps_lean_cleanup_csv_headers`** covers **`download-cleanup-csv`** headers → standard targets ([`apps/inventory/tests/test_preprocessing_redesign.py`](apps/inventory/tests/test_preprocessing_redesign.py)).
- **Inventory / Preprocessing** — **`GET /api/inventory/orders/{id}/download-cleanup-csv/`** exports a pre-AI CSV: **`row_id`**, **`row_number`**, **`quantity`**, **`unit_retail`**, **`base_cost`** (**`PurchaseOrder.compute_item_cost`**), **`ideal_price`** (2× **`base_cost`**), then **`description`**, **`brand`**, **`model`**, **`condition`**, **`notes`**, **`identifiers_json`**, **`taxonomy_json`**, **`specifications_json`**, **`tracking_json`**, **`search_tags_json`**. Omit **`title`**, flat **`category`** / **`sku`** / **`upc`**, and staging pricing columns (use JSON cells + **`unit_retail`**). **`POST …/apply-cleanup-csv/`** / **`upload-cleanup-csv`**: **wide** staging rows accept optional **`ai_status`** JSON (stored on **`PreprocessingRow`**; migration **`0038_preprocessingrow_ai_status`**) and use **`block_on_quality=False`** so most quality checks surface in **`soft_warnings`** instead of **`400`** ([`apps/inventory/views.py`](apps/inventory/views.py); [`cleanup_csv_validate.py`](apps/inventory/cleanup_csv_validate.py)). **Narrow** seven-column apply unchanged.
- **Inventory / Preprocessing — Step 2 (client)** — Parses optional trailing **`ai_status`** on Grok **`.cleaned.csv`** (12 or **13** columns); JSON **`rows`** payloads pass object or string **`ai_status`**; after **Run Cleanup**, server **`soft_warnings`** list is visible and dismissible ([`cleanupCsv.ts`](frontend/src/components/inventory/preprocessing/cleanupCsv.ts); [`RowProcessingPanel.tsx`](frontend/src/components/inventory/RowProcessingPanel.tsx); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx)).
- **Inventory / Preprocessing — apply path** — Malformed or empty per-row **`ai_status`** from CSV/JSON normalizes to **`{}`** before save ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / Preprocessing — Final Review** — **`PreprocessingReviewTable`** shows per-row **`ai_status`** state/issue chips; **`PATCH …/preprocessing-review/`** clears **`ai_status`** when staff change listing or price fields (**not** **`batch_flag`** or **`pricing_notes`** alone); client **`mergeReviewPatches`** mirrors that clear for optimistic UI ([`PreprocessingReviewTable.tsx`](frontend/src/components/inventory/PreprocessingReviewTable.tsx); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx); [`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / routing (frontend)** — **`/inventory/processing`** → **`ProcessingEntryRedirect`**; **`/inventory/processing/:id`** → **`ProcessingWorkspacePage`**; legacy **`/inventory/processing-legacy`** → **`ProcessingPage`**. **Order detail** and **Preprocessing** handoff navigate to **`/inventory/processing/{id}`** ([`App.tsx`](frontend/src/App.tsx); [`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx)).
- **Inventory / Item Processor** — **`ProcessingRow.shelf_price`** is the **workspace** single source for list + merged detail **`price`** (**`final_price`** fallback only when **`shelf_price`** is unset); **`refresh_processing_rows_denorm`** no longer copies **`Item.price`** onto **`shelf_price`** for manifest-linked bookmarks (**bookmark-only / no-Items rows** still seed from **`final_price`**/**`proposed_price`**). **`processing-print-and-check-in`**, **`processing-print-multiple`**, **`processing-bulk-disposition`**, and **`PATCH …/processing-patch/`** set **`shelf_price`** + **`final_price`** on the bookmark before **`Item.price`** ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py) **`push_shelf_price_to_bookmark`**, [`processing_ops.py`](apps/inventory/processing_ops.py)). **`ProcessingActiveCard`** initializes shelf **`price`** from **`row.price`**. Migration **`0044_rename_processingrow_list_unit_price_shelf_price`** renames **`list_unit_price`** → **`shelf_price`** and updates field help text.

### Documentation

- **AI steering / audits (`review.0` / `review.1` / `review.9`)** — Realigned **`.ai/`** tree (initiative = plan; version/changelog at repo root only); **[`.ai/reference/deep_dive/latest/`](.ai/reference/deep_dive/latest/)** refreshed post-**`v2.24.1`**.
- **Docs / reference** — **[`.ai/reference/cleanup_csv_contract.md`](.ai/reference/cleanup_csv_contract.md)** summarizes **`apply-cleanup-csv`** / **`upload-cleanup-csv`**: wide vs narrow rows, optional **`ai_status`**, staging-wide **relaxed** validation (quality **`HARD_*`** folded into **`soft_warnings`**), validation **`rule`** ids, and **`rejected_rows`** / **`soft_warnings`** response shape. **Historical:** a committed Jupyter tree under **`workspace/notebooks/ai-cleanup/`** was removed from the repo (**2026-05**); use **`workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md`** (gitignored unless whitelisted) plus the contract doc for CSV semantics.
- **Inventory pipeline (extended)** — [`.ai/extended/inventory-pipeline.md`](.ai/extended/inventory-pipeline.md): Item Processor workspace (**`processing-workspace`** API, **`ProcessingWorkspacePage`**, legacy grid route); optional adjunct **`workspace/ai-cleanup-grok/helpers/clean-grok.mjs`** for offline xAI cleanup (strict JSON Schema enums, **`.cleaned.csv`** + **`ai_status`**, optional **`--batch-api`**).
- **Environment template** — xAI Grok (**`XAI_API_KEY`** / **`GROK_API_KEY`**, **`AI_PROVIDER`**, **`XAI_API_BASE`**) aligned with Django settings ([`.env.example`](.env.example); [`.ai/extended/development.md`](.ai/extended/development.md)).
- **AI steering** — Preprocessing: Step 2 **`apply-cleanup-csv`** → staging **`ai_*`** / **`ai_title`** / optional **`ai_status`** (13-col client + **`soft_warnings`**); Step 3 **Final Review** — **`ai_status`** chips + clear-on-edit (`preprocessing-review`, **`finalize-preprocessing`**); Step 3 **mockup visual rebuild** (**[`fix_this.md`](.ai/reference/fix_this.md)** et al.) **pending** — **`order_processing_pipeline_rebuild`** ([`.ai/initiatives/order_processing_pipeline_rebuild.md`](.ai/initiatives/order_processing_pipeline_rebuild.md)).
- **Steering / process** — **`review.0.Bump`** (**2026-05-02** housekeeping): committed **`.ai/reference/`** Final Review pointers (**`fix_this.md`**, **`final_review_*`**, **`processing_data_lifecycle.md`**) so **`[Unreleased]`** links resolve; **`frontend/package.json`** **`0.0.0`** unchanged (**Part 2A**).
- **Steering / process** — **`review.0.Bump`** (**2026-05-01** release): semver **`v2.21.0`** (**.version** + root **`package.json`**); **`CHANGELOG [2.21.0]`** + **`extended/`** steering sync for paginated Item Processor (**no swap**).
- **Steering / protocol** — **`review.9.Deep.md`**: preprocessing-through–Final Review trace (models, views, `cleanup_csv_validate`, Grok adjunct, FE) for full audits; output under **`.ai/reference/deep_dive/latest/`** including GitHub / Heroku / prod DB gap (commit vs push vs `release:` migrate).
- **Reference** — **[`.ai/reference/fix_this.md`](.ai/reference/fix_this.md)** (pointer to Final Review visual rebuild spec); **[`.ai/reference/preprocessing_page_review.md`](.ai/reference/preprocessing_page_review.md)** (API-aligned review checklist); **`consult_design_final_review.md`** (Final Review UX spec); **[`.ai/reference/final_review_ui_rebuild_plan.md`](.ai/reference/final_review_ui_rebuild_plan.md)** (implementation plan, amended 2026-05-02); **[`.ai/reference/final_review_visual_rebuild_directive.md`](.ai/reference/final_review_visual_rebuild_directive.md)** (mockup ground truth, visual pass); **[`.ai/reference/final_review_visual_pass_plan.md`](.ai/reference/final_review_visual_pass_plan.md)** (execution plan for visual pass; includes review gate section 8).
- **Initiative** — **[`order_processing_pipeline_rebuild.md`](.ai/initiatives/order_processing_pipeline_rebuild.md)** preprocessing rollup links **`apps/inventory/cleanup_csv_validate.py`** (`validate_cleanup_row_values`, **`rule`** / **`rejected_rows`**).
- **Dev hygiene** — [`.gitignore`](.gitignore): **`frontend/.vite/`**, **`.pytest_cache/`**; **`scripts/deploy/2_push_github.bat`** uses **`git add .`** — **`.ai/reference/files.zip`**, **`Processor Mockups/`**, **`deep_dive/_runs/`** stay ignored.

---

## [2.21.0] — 2026-05-01

User-facing theme: **Item Processor workspace** stabilized with **`ProcessingRow`** bookmarks, **lazy row detail**, and **paginated workspace lists** (**25 rows** default slice).

### Added

- **Inventory / Item Processor (data model)** — **`ProcessingRow`** model and migrations **`0040_processing_row_bookmarks`** / **`0041_processing_row_canonical_denorm`** — per-PO queue bookmarks with denormalized **`queue_*`** / **`list_*`** fields, optional **`manifest_row`** / **`matched_product`** links, **`item_ids`** snapshot for lazy detail ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/migrations/0040_processing_row_bookmarks.py`](apps/inventory/migrations/0040_processing_row_bookmarks.py); [`apps/inventory/migrations/0041_processing_row_canonical_denorm.py`](apps/inventory/migrations/0041_processing_row_canonical_denorm.py)).
- **Inventory / Item Processor (API)** — **`GET /api/inventory/orders/{id}/processing-row-detail/`** — full row (**manifest**, **product**, **items**) by **`processing_row_id`** without building the entire PO-wide graph per click ([`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/services/processing_workspace.py`](apps/inventory/services/processing_workspace.py)).

### Changed

- **Inventory / Item Processor (workspace list)** — **`GET …/processing-workspace/`** serves a slim **`rows`** slice from **`ProcessingRow.values()`**; query params **`limit`** (default **25**), **`offset`**, **`segment`**, **`product_id`**, **`search`**, **`hide_checked_in`**; **`row_count_filtered`**, **`row_count_total_po`**, aggregated **`manifest_qty_dispositioned_total`**, **`order.total_manifest_qty`**, prefetch for active-row duplicate hint ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py); [`inventory.api.ts`](frontend/src/api/inventory.api.ts)).
- **Inventory / Item Processor (frontend)** — **`ProcessingWorkspacePage`** infinite scroll / paging via **`useProcessingWorkspace`** (**`flattenRows`**, client merge of paginated **`rows`**); processing mutations consume **`workspace_patch`** for React Query merges; **`PreprocessingPage`** finalize handoff aligns with **`/inventory/processing/{id}`** ([`ProcessingWorkspacePage.tsx`](frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx); [`useProcessingWorkspace.ts`](frontend/src/hooks/useProcessingWorkspace.ts); [`inventory.api.ts`](frontend/src/api/inventory.api.ts); [`PreprocessingPage.tsx`](frontend/src/pages/inventory/PreprocessingPage.tsx)).
- **Inventory / Item Processor (pricing UX)** — Read-only **Manifest pricing audit** accordion (**`manual-review`**) and **`ProcessingActiveCard`** manifest **unit retail** / over-MSRP warning unchanged in scope ([`ManualReviewPanel.tsx`](frontend/src/components/inventory/ManualReviewPanel.tsx); [`ProcessingWorkspacePage.tsx`](frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx); [`ProcessingActiveCard.tsx`](frontend/src/pages/inventory/processing/ProcessingActiveCard.tsx)).

### Removed

- **Inventory / Item Processor** — **`POST …/processing-swap/`** and **`SwapModal`** UI — cut from shipping scope for stability (**`ItemSwapAudit`** remains in DB for any historical rows) ([`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/processing_ops.py`](apps/inventory/processing_ops.py)).

### Fixed

- **Inventory / Item Processor** — Row detail avoids per-request full-PO duplicate-UPC scan; list-row duplicate hint preserved on merge ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py)).

### Tests

- **`apps/inventory/tests/test_processing_validation_matrix.py`** — **V-02**, **V-26–V-31**, **V-35**, **V-42** against workspace + ops ([`processing_workspace.py`](apps/inventory/services/processing_workspace.py); [`processing_ops.py`](apps/inventory/processing_ops.py)).

### Documentation

- **`.ai/`** — **`review.0.Bump`** sync for **`v2.21.0`**: **`CHANGELOG.md`**, **`context.md`**, **`initiatives/_index.md`**, **`order_processing_pipeline_rebuild.md`**, **`consultant_context.md`**, **`extended/frontend.md`**, **`extended/inventory-pipeline.md`**, **`extended/backend.md`** (**2026-05-01**).

---

## [2.20.0] — 2026-04-29

User-facing theme: **Inventory inbound** — purchase order dashboard + preprocessing + **Receiving** entry from sidebar and orders table (tiered **`for-receiving`** ordering).

### Added

- **Inventory / Orders** — **Create Purchase Order** dialog (**Ctrl/Cmd+N** from list or detail): dashboard vendors only, tier-one fields plus collapsible details/costs, keyboard/tab UX; successful create navigates to the new order detail ([`CreatePurchaseOrderDialog.tsx`](frontend/src/components/inventory/CreatePurchaseOrderDialog.tsx); [`OrderListPage.tsx`](frontend/src/pages/inventory/OrderListPage.tsx); [`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx)).
- **Inventory / Orders** — **Purchase Orders dashboard** refresh: denormalized **`vendor_name_cache`**, **`vendor_code_cache`**, **`search_text`** on **`PurchaseOrder`**; **`GET /api/inventory/orders/summary/`** KPI aggregates matching list filters; redesigned **`OrderListPage`** (KPI cards, debounced search, status segments, lightweight rows, **Receive** truck to `/inventory/receiving/:id` when status eligible) ([`apps/inventory/models.py`](apps/inventory/models.py); [`apps/inventory/views.py`](apps/inventory/views.py); [`frontend/src/pages/inventory/OrderListPage.tsx`](frontend/src/pages/inventory/OrderListPage.tsx)).
- **Inventory / Orders** — Purchase order detail **Raw Manifest**: upload or replace CSV via existing `POST /api/inventory/orders/{id}/upload-manifest/`; unlocks **Preprocessing** when saved ([`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx); [`inventory.api.ts`](frontend/src/api/inventory.api.ts)).
- **Inventory / Preprocessing** — New 3-step flow: **Standardize Manifest → AI Cleanup → Final Review** (stepper labels). Standardization always previews, creates deterministic Product links and early `Item` records; AI cleanup has preprocessing model add/verify/default controls; Final Review provides searchable staging editing, pricing summaries, and individual/bulk ideal-price adjustments before **`finalize-preprocessing`**.
- **Inventory / Receiving** — **`GET /api/inventory/orders/for-receiving/`** orders purchase orders by **expected_delivery** tiers (today/future ascending, overdue descending, null **`expected_delivery`** by **`ordered_date`** descending); tests in **`test_for_receiving_orders_by_expected_delivery_tiers`** ([`apps/inventory/views.py`](apps/inventory/views.py); [`apps/inventory/tests/test_receiving_api.py`](apps/inventory/tests/test_receiving_api.py)).

### Changed

- **Inventory / Orders** — **Order detail** redesigned as a workspace panel (2×2 **Lifecycle / Costs / Details / Manifest**), header financial strip, debounced inline **PATCH** edits, lifecycle-derived **status** when PO is ordered→delivered, **Escape** to list when no focused control, bottom bar **Preprocessing / Processing / Delete** ([`OrderDetailPage.tsx`](frontend/src/pages/inventory/OrderDetailPage.tsx); [`InlineEditableValue.tsx`](frontend/src/components/inventory/orderDetail/InlineEditableValue.tsx)). **`POST …/upload-manifest/`** stores raw file + **10-row** `manifest_preview` sample only (drops preprocessing staging side effects; **`process-manifest`** seeds staging on demand); **`POST …/remove-manifest/`** clears file + preview ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / routing** — **`/inventory/receiving`** (`ReceivingEntryRedirect`) loads the next eligible PO from **`GET /api/inventory/orders/for-receiving/`** (**`page_size=1`**) or falls back to **`/inventory/orders`**; **`/inventory/receiving/:id`** is **`ReceivingOrderPage`**; list page **`ReceivingListPage`** removed. Back controls on receiving use **`/inventory/orders`** ([`ReceivingEntryRedirect.tsx`](frontend/src/pages/inventory/ReceivingEntryRedirect.tsx); [`App.tsx`](frontend/src/App.tsx)).
- **Inventory / routing** — **Orders** sidebar link targets **`/inventory/orders`** (dashboard); legacy hub lives at **`/inventory/legacy`** with **`/inventory/legacy/orders`** for legacy workflows; **`/inventory/inbound?view=orders`** redirects to **`/inventory/orders`**; **`/inventory/admin/legacy`** redirects to **`/inventory/legacy`** ([`App.tsx`](frontend/src/App.tsx); [`Sidebar.tsx`](frontend/src/components/layout/Sidebar.tsx)).
- **Inventory / Orders** — **`GET /api/inventory/orders/`** and **`GET /api/inventory/orders/summary/`** only include purchase orders whose cached vendor display name is one of **Walmart**, **Target**, **Costco**, **Essendant**, **Wayfair**, **Home Depot**, **Amazon** ([`apps/inventory/constants.py`](apps/inventory/constants.py); [`apps/inventory/views.py`](apps/inventory/views.py)). Other vendors remain reachable via order detail and non-list APIs.
- **Inventory / API** — `upload-manifest` returns structured `code` on common errors (**`missing_file`**, **`decode_error`**, **`empty_csv`**, **`storage_error`**, **`save_error`**); writes new **`S3File`** + PO link before deleting prior storage object; **`process-manifest`** row replace uses **`transaction.atomic()`** ([`apps/inventory/views.py`](apps/inventory/views.py)).
- **Inventory / Preprocessing** — Product Matching is no longer staff-facing; exact deterministic product reuse happens during Product/Item preparation, and `create-items` now opens processing for existing early Items without duplicating them.

### Documentation

- **Workspace (gitignored)** — Adjunct preprocessing manifest experimentation: **`workspace/ai-cleanup-grok/`** (Grok **`helpers/clean-grok.mjs`** runner + prompts; **`prompts/amazon-examples.json`** few-shot regeneration via **`helpers/build-amazon-examples.mjs`** — **not tracked** unless `.gitignore` whitelists explicitly). Steering: [.ai/initiatives/order_processing_pipeline_rebuild.md](.ai/initiatives/order_processing_pipeline_rebuild.md) Sessions 2–5 (**2026-04-29**).
- **`.ai/`** — **`review_bump`** sync for **`v2.20.0`**: **`context.md`**, **`initiatives/_index.md`**, **`order_processing_pipeline_rebuild.md`**, **`consultant_context.md`**, **`extended/frontend.md`**, **`extended/inventory-pipeline.md`** (**2026-04-29**).

## [2.19.1] — 2026-04-21

User-facing theme: **Buying auction detail** — **valuation overrides** (fees, shipping, shrinkage, profit goal, pre-/post-shrink revenue) save **reliably**; invalid manifest-mapping refreshes no longer clobber in-flight **PATCH** responses; **invalid decimal input** returns **400** with a clear `detail` instead of **500**. Inline **Costs & revenue** fields **select all on focus** for replace-on-type.

### Fixed

- **Buying / React Query** — `useBuyingValuationInputsMutation` cancels in-flight detail queries, applies **`setQueryData`** before a **predicate** `invalidateQueries` (list/summary and other `buying/auctions/*` keys **excluding** the current detail) so a stale **GET** cannot overwrite a successful **PATCH** ([`useBuyingValuationInputsMutation.ts`](frontend/src/hooks/useBuyingValuationInputsMutation.ts)). Errors from **`PATCH …/valuation-inputs/`** show a **notistack** message via **`onError`**.

- **Buying / detail / manifest** — Debounced `map_fast_cat_batch` progress only invalidates **`manifest_rows`** and **auction summary**; it no longer invalidates the auction **detail** or full **list** on every tick, avoiding races with staff editing valuation inputs ([`AuctionDetailPage.tsx`](frontend/src/pages/buying/AuctionDetailPage.tsx)). Final `refetchQueries` after mapping workers still refresh the detail.

- **Buying / API** — `PATCH /api/buying/auctions/{id}/valuation-inputs/` normalizes string decimals (`strip`, leading `$`, commas), tolerates pastes like **`$12.34`**, and returns **400** `{"detail": "<field> must be a decimal number."}` on invalid input instead of an uncaught **InvalidOperation** ([`api_views.py`](apps/buying/api_views.py) `valuation_inputs`).

### Changed

- **Buying / `AuctionValuationCard`** — While the valuation mutation is **pending**, readouts prefer **local** state where applicable so the UI does not flash stale server values; **Fees / Shipping / Revenue** (empty local still shows table **estimated**). **`ValuationInlineField`** text inputs **`select()` on focus** (fees, shipping, shrinkage, profit, pre-shrink revenue, after-shrink revenue) ([`AuctionValuationCard.tsx`](frontend/src/components/buying/AuctionValuationCard.tsx)).

### Documentation

- **`.ai/`** — `context.md`, `consultant_context.md`, `extended/frontend.md`, `extended/backend.md` — v2.19.1 notes.

## [2.19.0] — 2026-04-21

User-facing theme: **Buying auction thumbs are per-user** — list and detail show **`my_thumbs_up`** (you voted) and **`thumbs_up_count`** (distinct staff voters). Legacy **`buying_auction.thumbs_up`** removed; votes remain in **`AuctionThumbsVote`**.

### Changed

- **Buying / API** — Auction list & detail JSON: **`thumbs_up`** replaced by **`my_thumbs_up`**; **`thumbs_up_count`** unchanged. **`POST`/`DELETE /api/buying/auctions/{id}/thumbs-up/`** response body uses **`my_thumbs_up`** instead of **`thumbs_up`**. List & watchlist **`ordering`** allow **`thumbs_up_count`** (replacing model field **`thumbs_up`**). Query filter **`thumbs_up`** (current user has a vote) unchanged — [`apps/buying/filters.py`](apps/buying/filters.py), [`apps/buying/serializers.py`](apps/buying/serializers.py), [`apps/buying/api_views.py`](apps/buying/api_views.py).
- **Buying / React** — Grid and mobile use **`my_thumbs_up`** for highlight; default list ordering **`-watchlist_sort,-thumbs_up_count,-priority,-need_score`**; **`normalizeBuyingListOrdering`** maps legacy **`thumbs_up`** sort tokens — [`frontend/src/utils/buyingAuctionList.ts`](frontend/src/utils/buyingAuctionList.ts), [`frontend/src/pages/buying/AuctionListDesktop.tsx`](frontend/src/pages/buying/AuctionListDesktop.tsx).

### Removed

- **Buying / schema** — Field **`Auction.thumbs_up`**; migration [`0020_remove_auction_thumbs_up`](apps/buying/migrations/0020_remove_auction_thumbs_up.py). Raw sweep upsert no longer inserts **`thumbs_up`** — [`apps/buying/services/sweep_upsert.py`](apps/buying/services/sweep_upsert.py).

### Fixed

- **Buying / auction list** — Thumbs icon filled only when the **logged-in** staff user voted; count reflects **all** voters (eliminates serializer fallback to a global flag).

### Documentation

- **`.ai/`** — `context.md`, `consultant_context.md`, `extended/backend.md`, `extended/bstock.md`, `extended/frontend.md` — thumbs API and schema.

## [2.18.2] — 2026-04-17

User-facing theme: **Buying UX polish** — snappier **active auctions** list (optimistic cache, no full-list refetch on toggles, archive **2s** cancel window), **auction detail** clarity (max-bid gauge **0 → break-even**, shared tooltips, category mix **Units**), and **filters / layout** refinements (two-column filter grid, pagination with results, category-need **ABA** rhythm). UI patterns: **`.ai/extended/ux-spec.md`**.

### Added

- **Buying / valuation** — Category mix table: **Units** column and footer total from `category_distribution` / `manifest_row_count` (`AuctionValuationCard`).
- **Buying / detail** — Max bid at each target: gauge scale **0 → break-even**; compact chart labels **Tgt / Mod / BE**; shared max-bid tooltip on bid tiles and gauge (`AuctionSecondaryCard`).

### Changed

- **Buying / auction list** — React Query trusts optimistic list cache: no `invalidateQueries` on thumbs/watch/archive bulk actions; `refetchOnMount: false` and `staleTime` on list hooks; single-row archive **2s grace** with cancel and row removal before POST (`useBuyingArchiveGrace`, `buyingOptimisticCache`); neighbor page prefetch; pagination controls moved to results header; **ABA** section rhythm for category need; search/filters **two-column** layout (Clear / All / Clear per row); desktop row render polish (`AuctionListPage`, `AuctionListDesktop`).

### Fixed

- **Buying / auction list** — Non-admin thumbs cell **stopPropagation** so row click does not navigate to detail.

## [2.18.1] — 2026-04-17

User-facing theme: **Managers see Settings** — canonical roles from Django groups (`/api/auth/me/`), rank-based sidebar visibility, **`/admin/settings`** on **`ManagerRoute`**. Fixes login **500** from redundant `source='roles'` on **`UserSerializer`**.

### Fixed

- **Auth / API** — **`UserSerializer.roles`** no longer uses redundant DRF `source` (restores **`POST /api/auth/login/`**).
- **Staff / Settings** — Managers get **Settings** in the nav and can open the page; **`GET /api/auth/me/`** includes **`roles`** and stable **`role`** when group names differ in casing or whitespace.

---

## [2.18.0] — 2026-04-17

User-facing theme: **Buying manifests are CSV-only** — anonymous order-process pulls, related REST actions, and server commands are removed. **Auction list** gains **Top category %**, **P/R %**, a richer **category** hover (full retail-weighted mix + source), **expand-all** on the detail column, and **tighter, vertically centered** grid rows.

### Added

- **Buying / auction list (desktop)** — **`Top category %`** (first word of lead category + rounded share), **`P/R %`** (current price ÷ list retail, integer %), **Category** column with hover showing **From Manifest** or **AI Estimate** and the full mix sorted by % desc; **expand** column header expands or collapses **all rows on the page**; cells and headers use compact padding with **vertical centering**.
- **Buying / auction list (mobile)** — Same category + price/retail line treatment where applicable.
- **Utilities** — [`frontend/src/utils/buyingCategoryList.ts`](frontend/src/utils/buyingCategoryList.ts), [`AuctionCategoryListBlock`](frontend/src/components/buying/AuctionCategoryListBlock.tsx).

### Fixed

- **Buying / React Query** — After **`DELETE …/manifest/`**, invalidate **`['buying','auctions']`** and **`['buying','auctions','summary']`** so list **`has_manifest`** and counts refresh without a full reload ([`AuctionDetailPage.tsx`](frontend/src/pages/buying/AuctionDetailPage.tsx)).

### Removed

- **Buying / manifests (breaking for automation using these endpoints or commands)** — Staff REST: `pull_manifest`, `manifest_pull_progress`, `manifest_queue`, `pull_manifests_budget`, `manifest_pull_log`. Management commands: `pull_manifests`, `pull_manifests_nightly`, `pull_manifests_budget`, `benchmark_manifest_pull`. Services: `manifest_api_pipeline` and related order-process client code. **Ingestion is CSV upload only** (`POST …/upload_manifest/`, `DELETE …/manifest/`). **Ops:** remove any Heroku Scheduler job that ran `pull_manifests_nightly`.

### Documentation

- **`.ai/extended/`** — `bstock.md`, `backend.md`, `development.md`; bookmarklet no longer references `pull_manifests`.

---

## [2.17.1] — 2026-04-17

User-facing theme: **Manifest retail invariant fixed** — **`ManifestRow.retail_value`** is now **canonically per-unit MSRP** across ingest (CSV upload; `normalize_manifest_row` still normalizes legacy stored API-shaped `raw_data` when present), aggregates (auction list, valuation, manifest mix, detail card), and tests. Extended retail = **`SUM(Coalesce(quantity, 1) × retail_value)`** at query time, never stored. Resolves auctions where multi-qty rows showed inflated **Manifest retail** (e.g. listing **102 units / $7,129** displayed **$15,012**).

### Fixed

- **Buying / aggregates qty-weighted** — [`valuation._manifest_retail_sum`](apps/buying/services/valuation.py), [`valuation.compute_and_save_manifest_distribution`](apps/buying/services/valuation.py), [`api_views.annotate_auction_list_extras`](apps/buying/api_views.py) (`_manifest_retail_sum` annotation), and [`serializers.AuctionDetailSerializer.get_manifest_extended_retail_total`](apps/buying/serializers.py) now use **`SUM(Coalesce(quantity, 1) × retail_value)`**. Auction `estimated_revenue` and the **Manifest retail** detail card field move in lockstep; no model migration.
- **Buying / CSV ingest** — [`manifest_template.standardize_row`](apps/buying/services/manifest_template.py) divides extended-retail columns by **`quantity`** when only `extended_retail` is mapped, logs a warning if both `retail_value` (unit) and `extended_retail` disagree by **>2%**, and warns when an extended value is stored as-is because qty is missing.
- **Buying / API ingest** — [`normalize.normalize_manifest_row`](apps/buying/services/normalize.py) keeps `unitRetail` preferred and now divides `extRetail` by `quantity` when only `extRetail` is present.
- **Buying / category-need** — Distribution bars no longer clip at **20%**. **`bar_scale_max`** is now **`max(max(shelf_pct, sold_pct) across categories, 20%)`** so the tallest bar fills the column while small distributions keep a 20% reference (**`apps/buying/services/category_need.py`**).

### Added

- **`apps/buying/management/commands/diagnose_manifest_retail.py`** — Read-only audit: per-auction `total_units`, `sum_retail`, `sum_ext`, `auction.total_retail_value`, ratio, and a flag (`UNIT_OK` / `EXTENDED_LIKELY` / `AMBIGUOUS` / `NO_LISTING`). Supports `--auction <id>`, `--database`, `--limit`, `--only`.
- **`apps/buying/management/commands/normalize_stored_manifest_retail.py`** — Per-auction backfill (gated by `--auction`): for rows with `quantity ≥ 2`, divides stored `retail_value` by `quantity`. Default-safe `--dry-run`; runs `recompute_auction_full` after writes (skip with `--skip-recompute`).

### Tests

- [`apps/buying/tests/test_normalize_manifest.py`](apps/buying/tests/test_normalize_manifest.py): API extRetail-only row with `qty=3, ext=$90` → `retail_value = $30`; `unitRetail` preferred over `extRetail` when both present; extRetail-only with no qty stored as-is.
- [`apps/buying/tests/test_manifest_upload.py`](apps/buying/tests/test_manifest_upload.py) `StandardizeRowRetailValueTests`: same matrix for CSV templates.
- [`apps/buying/tests/test_valuation.py`](apps/buying/tests/test_valuation.py) `ManifestDistributionTests.test_manifest_distribution_qty_weighted` and `test_manifest_retail_sum_qty_weighted`.

### Documentation

- **Inventory / `PurchaseOrder.retail_value`** — Some backfills store listing total incorrectly (e.g. **~100×** low vs **`notes`** JSON **`ext_retail`**). **`compute_item_cost`** divides by **`PO.retail_value × (1 − est_shrink)`**; a bad listing total inflates **`Item.cost`** and distorts **`CategoryStats`** good-data **`recovery_cost_amount`**, **`avg_cost`**, **`profit_margin`**, and panel **`n`** until corrected. Compare **`ecothrift.inventory_purchaseorder.retail_value`** to **`(regexp_replace(notes, '^[^{]*', ''))::jsonb ->> 'ext_retail'`** when **`notes`** contains **`BACKFILL:`** + JSON; fix **`retail_value`**, then **`python manage.py recompute_all_item_costs`** (optional **`--database production`**) and **`python manage.py compute_daily_category_stats`**.

### Operations (post-deploy — production)

- `python manage.py migrate` (no model changes; safety check).
- `python manage.py diagnose_manifest_retail --database production` — review flagged auctions; compare `sum_ext` vs `auction.total_retail_value`.
- For each affected auction (case by case):
  - **Re-upload** — CSV via the UI (the new `standardize_row` divides extended by qty), OR
  - **In-place fix** — `python manage.py normalize_stored_manifest_retail --auction <id> --dry-run` first, then drop `--dry-run`.
- `python manage.py compute_daily_category_stats --database production` — refresh **`CategoryStats`** + **`category_need_panel`** cache once any backfill completes.

---

## [2.17.0] — 2026-04-16

User-facing theme: **Good-data cohort for recovery and profitability** — **`CategoryStats.recovery_rate`** and dollar amounts now require **sold** rows where **`sold_for`**, **`retail_value`**, and **`cost`** are each between **0.01 and 9999** (all-time). **`avg_sold_price`** / **`avg_retail`** / **`avg_cost`** are means over that same cohort; **`recovery_cost_amount`** and **`good_data_sample_size`** are stored. Category-need API renames **`profit_per_item`** → **`avg_profit`**, **`profit_sales_ratio`** → **`profit_margin`** (dollar-weighted); drops **`return_on_cost`**. Auction list **category need** table: **Avg $** column → **Margin** (%); detail card adds a **Profitability** section (avg retail / sale / profit, recovery, margin, **n**).

### Changed

- **Buying / `CategoryStats`** — Migration **`0019_categorystats_good_data_cohort`**: **`recovery_cost_amount`**, **`good_data_sample_size`**; **`recovery_rate`** / **`avg_*`** help_text. SQL **`_profitability_aggregates()`** replaces **`_recovery_dollars`** + windowed **`_want_avg_rows`**.
- **Buying / category-need** — [`category_need.py`](apps/buying/services/category_need.py): payload fields above.
- **Frontend** — [`buying.types.ts`](frontend/src/types/buying.types.ts), [`CategoryNeedBars.tsx`](frontend/src/components/buying/CategoryNeedBars.tsx), [`CategoryNeedDetail.tsx`](frontend/src/components/buying/CategoryNeedDetail.tsx).

### Documentation

- **`.ai/`** — context, consultant, **`extended/backend.md`**, **`extended/frontend.md`** — good-data cohort and UI column list.

### Operations (post-deploy — production)

- After **`migrate`**, run **`python manage.py compute_daily_category_stats`** (or wait for the daily scheduler) so **`CategoryStats`** and **`category_need_panel`** cache reflect the stricter cohort before staff rely on recovery/margin. **`estimated_revenue`** may shift vs **v2.16.0** for categories where many sold rows lack cost in range.
- Still run once after deploy when shipping **v2.16.0+** cost work: **`python manage.py recompute_all_item_costs`** — see **[2.16.0]** Operations.

---

## [2.16.0] — 2026-04-16

User-facing theme: **Recovery rate replaces sell-through on CategoryStats** — daily SQL now stores **`recovery_rate`** = `SUM(sold_for) / SUM(retail_value)` (all-time qualifying sold rows per taxonomy bucket) and dollar numerators; auction **`estimated_revenue`** uses this ratio in the mix × retail formula. Category need API and UI rename **Thru** → **Recovery**; valuation mix table color bands adjusted for typical thrift recovery (green ≥35%, amber ≥20%).

### Changed

- **Buying / `CategoryStats`** — Migrations **`0017_categorystats_recovery_rename`**, **`0018_alter_categorystats_recovery_rate`**: `sell_through_rate` → **`recovery_rate`**, `sell_through_numerator` / `sell_through_denominator` → **`recovery_sold_amount`** / **`recovery_retail_amount`**. Legacy **`PricingRule.sell_through_rate`** unchanged (CSV seed only).
- **Buying / SQL** — [`category_stats_sql`](apps/buying/services/category_stats_sql.py): `_recovery_dollars()` replaces unit shelf/sold ratio.
- **Buying / valuation** — [`valuation.py`](apps/buying/services/valuation.py): `_recovery_rate_for_category`.
- **Buying / category-need API** — [`category_need.py`](apps/buying/services/category_need.py): `recovery_pct`, `recovery_rate` in row payload.
- **Frontend** — [`buying.types.ts`](frontend/src/types/buying.types.ts), [`CategoryNeedBars.tsx`](frontend/src/components/buying/CategoryNeedBars.tsx), [`CategoryNeedDetail.tsx`](frontend/src/components/buying/CategoryNeedDetail.tsx), [`AuctionValuationCard.tsx`](frontend/src/components/buying/AuctionValuationCard.tsx).

### Documentation

- **`.ai/extended/backend.md`**, **`.ai/extended/ux-spec.md`**, **`.ai/context.md`**, **`.ai/consultant_context.md`**, **`.ai/extended/frontend.md`**, **workspace** `buying-auctions-list-ux/CONTEXT.md` — recovery semantics and UI labels; root **`package.json`** `"version"` aligned with **`.version`** (review_bump).

### Operations (post-deploy — production)

- After **`migrate`** on Heroku (or any host), run **once**: `python manage.py recompute_all_item_costs` — backfills **`Item.cost`** from **`PurchaseOrder.compute_item_cost`** (listing retail × shrink × `total_cost` allocation) for every PO that has items. Idempotent if data already matches; use whenever deploy ships or data fixes require cost realignment. See **`apps/inventory/management/commands/recompute_all_item_costs.py`**.

---

## [2.15.4] — 2026-04-16

User-facing theme: **AI steering and repository hygiene** — consolidate `.ai/` docs, archive initiative files, remove obsolete scripts and env-template clutter; fix `2_push_github.bat` so `git commit -F` uses the full `commit_message.txt` and the batch file parses under `cmd.exe`.

### Documentation

- **Workspace** — Cleared **`workspace/data/`** (generated CSV/JSON; **`.gitkeep`** only). Removed notebook **`README.md`** files; Jupyter setup consolidated in **`.ai/extended/development.md`**. Pruned notebook temp artifacts (**`.csv`**, **`.pkl`**, caches, empty **`bstock-intelligence/`**). Dropped **`workspace/testing/`** gitignore exceptions (folder unused). Updated cross-links in **`README`**, **`databases.md`**, initiatives, **`CHANGELOG`** history where cited.

- **AI steering** — Added [`.ai/protocols/review.0.Bump.md`](.ai/protocols/review.0.Bump.md): docs-audit checklist (steering + extended TOC), semver bump matrix, `CHANGELOG` update rules, drift-check shell snippets; Part 5 documents **`commit_message.txt`** + **`2_push_github.bat`**. Cross-links from `.ai/context.md`, **`README`** AI steering table, and `startup` / `session_checkpoint` / `session_close` protocol relationship tables.
- **Consultant handoff** — Removed **`.ai/protocols/consult_retire_charlie.md`** and **`.ai/protocols/consult_retire_scout.md`**. Advisor bundle procedure is only [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md) (**`workspace/to_consultant/files-update/`**).
- **Personas** — Removed **`.ai/personas/`** (Scout / Christina role prompts). Updated [`.ai/context.md`](.ai/context.md), [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md), and [`.ai/protocols/code.1.Bearing.md`](.ai/protocols/code.1.Bearing.md) so docs do not reference those paths.
- **Workspace hygiene** — Removed **`workspace/notes/`** ignore whitelist for a non-existent tracked script; **`scripts/data/build_sell_through_rates.py`** reads **`workspace/data/historical_keys_mapped.csv`**. Session drop **`workspace/4-16-26 Collection/`** and temp **`workspace/file_cleanup.md`** deleted from disk when present.

- **Env templates** — Removed **`template.env`** and **`extract-env-vars.bat`** from repo root; use **`.env.example`** as the committed template (copy to **`.env`** locally).

- **Initiatives index** — [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) **Active initiatives** table cleared (no rows); initiative markdown may live under **`_archived/_completed/`** (e.g. buying / UI polish) with session history preserved.

- **AI steering (review_bump)** — Extended TOC parity (**`context.md`** ↔ **`consultant_context.md`**); **`<!-- Last updated -->`** on line 1 of every **`.ai/extended/*.md`** (including **`consultant_handoff.md`**).

### Changed

- **Deploy** — [`scripts/deploy/2_push_github.bat`](scripts/deploy/2_push_github.bat): `git commit -F` on the full [`commit_message.txt`](scripts/deploy/commit_message.txt); validate first line only; reset to `---` on success when not `--called`; avoid `(` in `set /p` prompt and unparenthesized `::` comments that broke **`cmd.exe`**.

---

## [2.15.3] — 2026-04-16

User-facing theme: **AI title category estimate yield and sweep ergonomics** — restored high save rate from **`estimate_batch`** by removing the redundant **`title_echo`** check (rows already match via **`auction_id`**); padded the cached system block past the Haiku **2048**-token minimum so repeated batches can use **`cache_read`** pricing; **`estimate_auction_categories --missing-both`** for robust backfills.

### Changed

- **Buying / AI title category estimate** — **`ai_title_category_estimate.estimate_batch`**: no **`title_echo`** field or verification; system prompt adds edge-case and worked-example sections. **`python manage.py estimate_auction_categories`**: **`--missing-both`** (open/closing, no AI mix and no manifest mix), default **500** cap when used (**`--limit`** overrides).

---

## [2.15.2] — 2026-04-16

User-facing theme: **Retail-weighted category mix and need score** — manifest **`manifest_category_distribution`** is built from **retail value** share per **`fast_cat_value`** (fallback to row counts when all retail is null/zero). While fast-cat mapping is partial, the **Mixed lots & uncategorized** bucket is **redistributed** using existing **`ai_category_estimates`** (same weights used for **`need_score`** SUMPRODUCT). Discovery sweep **no longer caps** AI title estimates at 25 auctions per run; auctions that **already have** **`ai_category_estimates`** are skipped to avoid repeat API calls.

### Changed

- **Buying / valuation** — **`compute_and_save_manifest_distribution`**: retail-weighted percentages; count-weight fallback; **`_mix_for_auction`**: blend Mixed lots with AI when both exist; **`run_ai_estimate_for_swept_auctions`**: no per-sweep cap; skip when AI estimates already present. **`recompute_auction_full`**: when **`has_manifest`**, refreshes manifest distribution from **`ManifestRow`** before recomputing revenue and **`need_score`** (so **`python manage.py recompute_buying_valuations`** backfills retail-weighted mixes for open/closing auctions).
- **Buying / AI title category estimate** — **`ai_title_category_estimate.estimate_batch`**: taxonomy + rules + JSON schema moved into the **cached system block** (Haiku `cache_control=ephemeral`); per-vendor **`_few_shot_block`** now drops rows where **`Mixed lots & uncategorized` ≥ 80%** (treated as incomplete **`fast_cat`** mapping, not a real distribution) and returns an empty block (no literal "no examples" string) when the vendor has none so the user message stays lean.

---

## [2.15.1] — 2026-04-16

User-facing theme: **Manifest pipeline optimizations** — 7 targeted changes to the B-Stock manifest download and post-processing path. Dev timing infrastructure (`manifest_dev_timelog`) for benchmarking pull speed. Benchmark baseline: **~38 s / 1010 rows / ~26 rows/s** via SOCKS5. B-Stock page-size hard cap confirmed at **10 items/page** (ignores `limit` above 10).

### Changed

- **Buying / scraper** — `_fetch_manifest_paginated` now uses a **lazy singleton `requests.Session`** (`_manifest_http_session()`) for TLS connection reuse across paginated manifest GETs (Opt 1). Each page no longer creates a fresh TCP+TLS handshake to `order-process.bstock.com`.
- **Buying / pipeline** — **`CategoryStats`** preloaded **once** before the auction loop in `run_manifest_pull` and passed via `stats=` to `recompute_auction_valuation`, eliminating repeated full-table loads (Opt 2). **`_has_manifest_rows`** `Exists` annotation added to `manifest_pull_queue_queryset` — per-auction `.exists()` DB call removed (Opt 3). **`bulk_create(batch_size=500)`** on `ManifestRow` inserts (Opt 6). **1-deep `ThreadPoolExecutor` prefetch** — fetches next auction's manifest (HTTP) while processing current auction's DB writes; controlled by `MANIFEST_PULL_PREFETCH` setting and `--no-prefetch` flag (Opt 5).
- **Buying / commands** — `pull_manifests_budget` and `pull_manifests_nightly` default `--delay` lowered from **3.0 s** to **1.0 s** (Opt 4).

### Added

- **Dev timing** — `apps/buying/services/manifest_dev_timelog.py`: writes per-pull JSONL to `workspace/…/B-Manifest API/.timelogs/` and appends to `time_summary.md` when `ENVIRONMENT=development`. Version string `MANIFEST_API_PULL_VERSION` bumped per code change.
- **Benchmark command** — `python manage.py benchmark_manifest_pull`: warm-up + AI mapping, N baseline runs, per-auction timing against the dev timelog. Flags `--auction-id`, `--baseline-runs`, `--skip-warmup`.
- **Probe script** — `workspace/…/B-Manifest API/probe_manifest_speed.py`: standalone HTTP timing comparison (shared session vs bare requests) for page-size ceiling validation. **Use with caution** — default args make ~600 API calls; always pass `--limits <single_value>`.

### Removed

- **Buying — staff category-want vote:** **`CategoryWantVote`** model and **`GET`/`POST` `/api/buying/category-want/`**; frontend **`useBuyingCategoryWant`** hook and API helpers; **`apps/buying/services/want_vote.py`** and **`get_want_vote_decay_per_day()`**; **`seed_pricing_rules`** no longer seeds **`buying_want_vote_decay_per_day`**. **Category need** detail card redesigned (raw need-score inputs, **sold-items window since** date). Migration **`0016_remove_categorywantvote`**.

---

## [2.15.0] — 2026-04-15

User-facing theme: **Auction detail UX v3** — restructure the page around the user's decision process instead of data categories. Urgency strip, decision summary, bid reference card, multi-tick gauge, costs input/output split, sell-through color coding, condition chips, compact manifest view. Driven by external UX consultant critique (49/100 → comprehensive overhaul). See **`.ai/extended/ux-spec.md`** for the design spec.

### Added

- **AuctionUrgencyStrip** — full-width `Paper` banner above the analysis grid: hero countdown (h4, pulsing animation under 1h), current price (h5), bid count with "No competition" signal, status chip. Background tints by urgency tier. Replaces the time/price/bids/status section of the old `AuctionEndDetailsCard`.
- **AuctionDecisionSummary** — synthesized deal-assessment banner with left color border (green/amber/red). Margin ratio text ("Current price is X% of breakeven"), inline chips for risk flags (low sell-through categories, low inventory demand) and opportunity signals (no competition + wide margin). Auto-hides when insufficient data.
- **AuctionBiddingCard** — new grid cell (1,2) for static bid-reference data: priority (editable), need score (color-coded), buy now, starting price (moved from AuctionDetailsInfoCard), est. profit (green/red), profitability ratio (green/amber/red thresholds).
- **UX design spec** — `.ai/extended/ux-spec.md`: full specification capturing design philosophy, component specs, color system, typography rules, interaction patterns, and implementation status. Applies project-wide.

### Changed

- **ValuationMaxBidCard** — replaced thin progress bar with a **multi-tick gauge** (10px track, tick marks at breakeven/moderate/target, current price dot marker, labeled positions). Tile boxes now have **color-differentiated left borders** (error.light / warning.light / success.light). Margin text shows computed ratio instead of "Strong margin" chip.
- **ValuationCostsCard** — restructured into **Inputs** (tinted `action.hover` background) and **Calculated** (default background) sections with a `Divider`. Inputs section groups: current price, fees, shipping, shrinkage, profit goal, revenue pre-shrink. Calculated section shows: total cost, expected revenue, **est. profit** (new, color-coded), **margin %** (new, derived).
- **AuctionDetailsInfoCard** — **condition** renders as a color-coded `Chip` (New/Like New → success, Used Good → primary, Used Fair → warning, Salvage → error). **Avg retail per item** shown next to lot size. **Starting price** removed (moved to AuctionBiddingCard).
- **ValuationCategoryTableCard** — **sell-through column** color-coded: >= 75% green, 50-75% amber, < 50% red.
- **AuctionDetailPage** — manifest card: when manifest loaded, shows **compact metadata** (row count, categorized, template, manifest retail) + single-line "Replace manifest" / "Remove" zone instead of a large drag area. Urgency strip + decision summary inserted above the 6-cell grid. Cell 1,2 swapped to `AuctionBiddingCard`.

### Removed

- **AuctionEndDetailsCard** — replaced by `AuctionUrgencyStrip` (real-time data) + `AuctionBiddingCard` (static reference).

---

## [2.14.1] — 2026-04-15

User-facing theme: **SOCKS5 proxy hardened for all B-Stock HTTP** — PIA `socks5://` (local DNS) as default; optional resolved-IP override; step-based diagnostic script; dev audit logging.

### Changed

- **Buying / scraper** — **All** `*.bstock.com` requests (not just search) route through SOCKS5 when `BUYING_SOCKS5_PROXY_ENABLED=True` via `_request_json`. New `BUYING_SOCKS5_PROXY_IP` (optional resolved IP override) and `BUYING_SOCKS5_LOCAL_DNS` (default recommendation **`True`** for PIA — `socks5://` local DNS; `socks5h://` remote DNS fails with PIA 0x04). `BUYING_SOCKS5_DEV_AUDIT` logs redacted proxy URLs and periodic egress IP probes to `logs/bstock_api.log`.
- **`.env.example`** — `BUYING_SOCKS5_LOCAL_DNS` documented with `True` as recommended default for PIA; `BUYING_SOCKS5_PROXY_IP` added.
- **`ecothrift/settings.py`** — reads `BUYING_SOCKS5_PROXY_IP` (optional).

### Added

- **Diagnostic** — `workspace/tests/socks5_egress_probe.py` rewritten as 6-step Grok-informed diagnostic: resolve proxy hostname, direct egress, `socks5://` + hostname, `socks5://` + IP, `socks5h://` + hostname, optional B-Stock search (`--bstock`). Clear PASS/FAIL per step; scraper-config verdict at bottom.
- **Extended docs** — `.ai/extended/vpn-socks5.md`: full reference for PIA SOCKS5 setup, `.env` keys, `socks5://` vs `socks5h://`, known PIA behavior, diagnostic usage, IP rotation.

---

## [2.14.0] — 2026-04-15

User-facing theme: **Simpler buying NEED scores + inventory item cost** — ratio-based **1–99** category need (daily SQL), auction **`need_score`** / auto **`priority`** as weighted mix of those scores; **PO `est_shrink`** drives **`Item.cost`** from listing retail and total cost (no legacy nightly vendor→PO→sold-only pipeline).

### Added

- **Buying / category need** — `CategoryStats.need_score_1to99` (1–99, min–max across taxonomy buckets from sold vs shelf ratios); auction `need_score` / auto `priority` are the manifest/AI **SUMPRODUCT** of those scores (no profit/time blend). **`compute_daily_category_stats`** drives SQL + open-auction full recompute.
- **Inventory / item cost** — `PurchaseOrder.est_shrink` (default **0.15**); `item_cost = (item.retail / (PO.retail × (1 − est_shrink))) × PO.total_cost` on intake and when `est_shrink` / PO cost / listing retail change. Management command **`recompute_all_item_costs`** for one-shot backfill.
- **Documentation** — **`.ai/context.md`**, **`.ai/consultant_context.md`**, **`.ai/extended/backend.md`**, **`.ai/extended/development.md`**, **`.ai/extended/bstock.md`** updated for the new behavior; deploy scripts use **`recompute_all_item_costs`** instead of **`recompute_cost_pipeline`**.

### Removed

- **Inventory — legacy cost pipeline** — `compute_vendor_metrics`, `compute_po_cost_analysis`, **`compute_item_cost`** (management command), **`recompute_cost_pipeline`**, and related `Vendor` / `PurchaseOrder` analytics fields (`shrinkage_rate`, `misfit_rate`, `avg_sell_through`, `avg_fulfillment`, `shrink_retail_est`, `mistracked_retail`, `misfit_sales_amt`). Nightly scheduler must **not** run the deleted wrapper; use **`recompute_all_item_costs`** only when backfilling costs after deploy.

---

## [2.13.1] — 2026-04-15

User-facing theme: **Buying desktop auction list — snappy interactions + inline row detail** ([`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md), Session 5 follow-up) — stable DataGrid columns, optimistic watch row patch, microtask-friendly query cancel.

### Changed

- **Frontend / buying — desktop list** — `AuctionListDesktop` (**`/buying/auctions`**, `md+`): expand/collapse **chevron** column moved to the **last** column (right of **Time left**); **inline detail** strip under the expanded row via DataGrid **`slots.row`** + **`getRowHeight`** (compact pipe-separated metrics; **Shift+click** row still toggles); theme trims perceived lag — **`MuiIconButton`** / **`MuiCheckbox`**: `disableRipple` + **`transition: none`**; bulk column sort affordance without opacity **transition**; header **`Tooltip`** **`enterDelay={200}`**.
- **Frontend / buying — performance** — Column definitions are **referentially stable**: frequently changing state (**`watchlistIds`**, **`rows`**, selection, sort model, expand id) held in a **`MutableRefObject`** read inside **`renderCell` / `renderHeader`** so optimistic toggles **do not** rebuild all **`GridColDef`** closures and **do not** force a full-grid re-render; **`TimeRemainingCell`** runs its own 1 s interval when under the live countdown threshold (parent **`countdownTick`** no longer invalidates columns every second); custom **row** slot reads expand state from the same ref (stable **`slots.row`**).
- **Frontend / mutations** — **`useBuyingWatchlistToggleMutation`**: optimistic **`patchAllBuyingAuctionLists`** sets **`watchlist_sort`** on the toggled auction so the grid row reference updates with star state; **`void queryClient.cancelQueries`** (non-blocking) instead of **`await`** — same for **`useBuyingThumbsUpMutation`** and **`archiveMutation`** in **`AuctionListPage`**.

---

## [2.13.0] — 2026-04-15

User-facing theme: **Fast auction sweep** + **optional SOCKS5 for search** ([`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md)) — parallel B-Stock search, raw SQL upsert, richer sweep API, single-request Refresh UX.

### Added

- **Buying / sweep** — Parallel **POST** `search.bstock.com` pagination per marketplace (`ThreadPoolExecutor`), default **`limit=200`**, configurable **`BUYING_REQUEST_DELAY_SECONDS`** (default **0**). Raw PostgreSQL **`INSERT … ON CONFLICT`** upsert ([`sweep_upsert`](apps/buying/services/sweep_upsert.py)) preserving **`first_seen_at`** and staff fields; shared **[`listing_mapping`](apps/buying/services/listing_mapping.py)** for listing JSON → auction fields.
- **API** — `POST /api/buying/sweep/` response extensions: **`total_seconds`**, **`total_listings`**, **`by_marketplace`** (per-MP HTTP timing, insert/update/skip/db error counts), **`inserted`**, **`updated`** (alongside **`upserted`**).
- **Frontend** — **Refresh auctions**: one **`POST`** for all active marketplaces (no per-MP loop); loading copy **“Sweeping all marketplaces…”**; [`BuyingSweepResponse`](frontend/src/types/buying.types.ts) types extended.
- **Ops / proxy** — Optional **SOCKS5** for search only (`socks5h`), env **`BUYING_SOCKS5_*`**, **`PySocks`**; URL-encoded credentials in **[`scraper._socks_proxies_for_search`](apps/buying/services/scraper.py)**. **[`workspace/sweep_fast.py`](workspace/sweep_fast.py)** documented as ops-only fallback (no Django).

### Changed

- **`sweep_auctions`** default **`--page-limit`** **200** (was 20).
- **`.env.example`** — buying delay, sweep workers, SOCKS placeholders (Bill: copy to local **`.env`** as needed; not committed).

### Added (dev tooling / workspace — folded in with v2.13.0 release)

- **Dev tooling** — **`scripts/dev/daily_scheduled_tasks.bat`** runs **`compute_daily_category_stats`**, **`scheduled_sweep`**, and **`watch_auctions`** for local parity with Heroku scheduled buying work; optional **`SKIP_BSTOCK=1`** for offline stats-only. Documented in **`.ai/extended/development.md`** and **`.ai/context.md`**.
- **Workspace (consultant):** B-Stock API research — [`.ai/reference/bstock_api_research.md`](.ai/reference/bstock_api_research.md) and probe script [`workspace/test_bstock_endpoints.py`](workspace/test_bstock_endpoints.py) (anonymous + optional JWT; samples under `workspace/data/bstock_api_samples/`).
- **Workspace:** [`workspace/sweep_fast.py`](workspace/sweep_fast.py) — standalone sweep (parallel GET search, `psycopg2` upsert, `workspace/logs/`).
- **Steering:** [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md); [`.ai/reference/handoff_prompt.md`](.ai/reference/handoff_prompt.md); [`.ai/reference/status_board.md`](.ai/reference/status_board.md) (consultant status board template).

### Documentation

- **Consultant handoff bundle** — **`workspace/to_consultant/files-update/`** is **flat** (no subfolders). Canonical procedure: [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md).
- **`.ai/consultant_context.md`**, **`.ai/extended/bstock.md`:** B-Stock search **GET or POST**, **max `limit` 200**; auction/manifest anonymous behavior cross-linked to **`bstock_api_research.md`**; **`_apply_auction_list_visibility`** (live default; **Completed** = last 24h ended).
- **`.ai/extended/backend.md`:** Django DB cache TTLs (**`item_stats_global`**, **`category_need_panel`**, **`item_list_total_count`**); **`suggest_item`** / **`ai_cleanup_rows`** → **`AI_MODEL_FAST`**; category retry + fallback.
- **`.ai/personas/Scout.md`**, **`.ai/personas/Christina.md`:** **Ask / Plan / Agent** rules; **present_files** for consultant `.md` prompts and `.txt` command scripts.

---

## [2.12.1] — 2026-04-14

User-facing theme: **Auction list & detail polish** (Phase 3A, [`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md)) — staff buying UI and buying API filters for active-auctions workflow, manifest truth from uploads, and detail recompute without B-Stock tokens.

### Changed

- **Auction list** — Column reorder (Watch, Thumbs, read-only Priority, raw Need, Vendor, Title, Price, Retail, Cost/retail %, time left); **`estimated_revenue`** / **`profitability_ratio`** removed from list; **manifest** Yes/No from **`ManifestRow`** (uploaded CSV), not B-Stock flag; **`q`** search (AND across title + marketplace); **Completed** chip + **`completed`** param (last-24h ended vs live default). **`_apply_auction_list_visibility`** for live vs completed.
- **Auction detail** — Manifest grid columns (**Ext Retail**, **% of Manifest**); action row under title (Watch → Update → B-Stock); **`POST …/recompute_valuation/`** for local recompute.

---

## [2.12.0] — 2026-04-13

User-facing theme: **Memory/performance**, **buying category need**, **inventory & POS UX** (Phase 1–2), and **faster item list** — ops tuning, caches, lean APIs, enter-to-commit search, Add Item taxonomy, AI fast defaults, plus **cached total count** for unfiltered item lists.

### Added

- **Inventory / POS — Phase 2 polish** ([`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md)) — Item list (`ItemListPanel`) and POS **transactions** receipt search commit on **Enter** / **Search** (draft text does not refetch lists). **Orders list API** — `PurchaseOrderListSerializer` with **`has_manifest`**; list queryset skips heavy PO stats annotations; no `processing_stats` or nested `manifest_file` on list. **Add Item** — category **taxonomy `Autocomplete`**, **retail (MSRP)** + validation, brand default **Generic**; **`PurchaseOrderListRow`** type for list responses. **AI** — `suggest_item` and `ai_cleanup_rows` default **`AI_MODEL_FAST`**; suggest-item includes canonical category list, **one retry** if category invalid, fallback to **Mixed lots & uncategorized**.
- **Item list API — cached total count** — For **unfiltered** list requests (no `q`, `search`, status/condition/source, filterset fields, or `updated_after`), DRF pagination **`count`** uses **`cache.get_or_set('item_list_total_count', …, 300)`** so large-table **`COUNT(*)`** is not repeated every request (`ItemListPagination` + `CachedTotalCountPaginator`). Filtered lists still run a normal count.
- **Heroku memory ops** — [`docs/operations/heroku-memory.md`](docs/operations/heroku-memory.md): `log-runtime-metrics`, tail web dyno, rollback note (pairs Procfile/Gunicorn + cache deploy).
- **Consignment agreements** — `SearchFilter` on list API so Add Item agreement autocomplete can search by number / consignee fields.

### Changed

- **Pagination** — DRF `max_page_size` **200** (was 1000); **Gunicorn** explicit `--workers 2`, `--max-requests` + jitter (Procfile).
- **Cache** — Django **database** cache backend (`django_cache_table`; tests use LocMem); **TTL-only** cache for item **global** stats block and **category-need** API response (no signal invalidation).
- **Purchase orders (list)** — Annotated item/batch counts for `processing_stats`; **list** no longer prefetches all `manifest_rows` / `batch_groups` (detail still prefetches manifest rows).
- **Item stats API** — `_item_stats_payload` uses a **single aggregate** query where applicable.
- **Buying / category need** — Metric windowing: all-time financials and `sell_through_pct` denominator; 90-day **`sold_count`** / **`sold_pct`** unchanged semantically; [`CategoryNeedBars`](frontend/src/components/buying/CategoryNeedBars.tsx) layered bars (see [`.ai/initiatives/_archived/_completed/ui_ux_polish.md`](.ai/initiatives/_archived/_completed/ui_ux_polish.md)).
- **Frontend lists** — **Server-side** DataGrid pagination for orders, items (`ItemListPanel`), POS transactions; **`useItemsAllPages`** for Processing page when a PO has many items; item list **`q`** and POS receipt filter use **committed** search (Enter/Search/Clear), not live-typing refetch.
- **Add Item form** — Purchase order and agreement pickers: **async** search (small page size) instead of loading hundreds of rows.

---

## [2.11.1] — 2026-04-12

User-facing theme: **Production deployment patch** — backfill data live on Heroku, cost pipeline and inventory ID generation hardened for remote DB.

### Added

- **Optional `DATABASES['production']`** — configure via **`PROD_DATABASE_*`** (see **`ecothrift/settings.py`**). Inventory management commands accept **`--database default|production`** and **`--no-input`** for scripted runs (e.g. **`scripts/deploy/run_production_backfill.bat`**).

### Changed

- **`Product.generate_product_number`** / **`Item.generate_sku`** — when saving with **`using=`**, sequence queries target that database (avoids **`PRD-*` / `ITM*` collisions** when backfilling to a non-default alias).
- **`backfill_phase2_products_manifests`** — **`IntegrityError`** around product saves; **bulk_create** with **`ignore_conflicts`** and smaller batches for remote; **`ManifestRow`** / **`Item`** **`bulk_create`** use **`.using(db)`** (not invalid **`using=`** kwarg).
- **`backfill_phase5_categories`** **`--map-v1`** — progress logging + **`stdout.flush()`**; batch size **500** on **`production`**; **`.only()`** on item querysets to reduce payload over the wire.
- **`classify_v2_iterate`**, **`classify_v2_status`**, **`classify_v2_validate`** — **`--database`** / **`--no-input`** ( **`command_db`** pattern).

### Fixed

- **Data migrations:** PO retail/cost corrections (**WAL135287**, **TGT126675**, **WFR10979**, **CST423585**, **AMZ24714**); **retag category inheritance** for **`RETAGGED_FROM_DB2:`** notes.
- **Pink-tag loads** — **`compute_item_cost`** uses alternate allocation when PO fulfillment rate is below **0.15**.
- **Production hygiene:** legacy **HISTORICAL** rows removed; **`Item.retail_value`** populated; **cost pipeline** (**vendor metrics**, **PO analysis**, **item cost**) run on production.

---

## [2.11.0] — 2026-04-11

User-facing theme: **Acquisition cost pipeline hardened** — vendor merge, shrink vs misfit decomposition, nightly recompute on Heroku.

### Added

- **`Vendor.misfit_rate`** — Estimated share of PO retail gap from untracked/misfit sales (marketplace vendors only); **`shrinkage_rate`** now means **true** shrink after that share is removed. **`compute_vendor_metrics`** uses global decomposition (orphan POS lines vs missing retail) for codes `AMZ`, `CST`, `ESS`, `HMD`, `TRGET`, `WAL`, `WFR`; other vendors keep legacy composite shrinkage with `misfit_rate` null.
- **Data migration** [`0018_merge_tgt_into_trget`](apps/inventory/migrations/0018_merge_tgt_into_trget.py) — Reassigns `PurchaseOrder`, `CSVTemplate`, and `VendorProductRef` from duplicate Target vendor **TGT** to canonical **TRGET**; **`TGT`** row retained with **`is_active=False`**.

### Changed

- **v2.10.0 cleanup (themes in this release notes bundle):** SKU / product number sequencing fix, retag scaffolding removal, historical transaction HT filter, AI cleanup cancel race, vendor prefix investigation.
- **`Item.retail_value`** field (populated from legacy DBs via **`populate_item_retail_value`**); **`Item.cost`** repurposed as **allocated acquisition cost** (was incorrectly used for retail in older flows).
- **Cost pipeline:** **`compute_vendor_metrics`**, **`compute_po_cost_analysis`**, **`compute_item_cost`**, wrapper **`recompute_cost_pipeline`**; Heroku Scheduler runs **`python manage.py recompute_cost_pipeline`** nightly.

---

## [2.10.0] — 2026-04-11

User-facing theme: **Buying dashboards and category need reflect ~3 years of real historical inventory and sales** after the V1/V2 backfill and taxonomy pipeline (local database where the backfill was run).

### Added

- **Data backfill — Phase 5 (V2 classification + pricing):** [`backfill_phase5_categories`](apps/inventory/management/commands/backfill_phase5_categories.py) — V1 `--map-v1`; V2 CSV export/import; conservative **`--preclassify-v2`**; **[`classify_v2_iterate`](apps/inventory/management/commands/classify_v2_iterate.py)** (`--sample`, `--apply`, `--status`, `--apply-manual`) for iterative regex rules + manual `product_id` overrides; **`PricingRule`** recomputation from sold BACKFILL items. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 6.
- **Phase 5 (continued):** All **19** `PricingRule` categories with data-backed sell-through; `recompute_buying_valuations` over backfilled auctions.
- **Phase 6 (verification):** Category-need API and admin counts verified against loaded data; release gate `manage.py check` + `tsc --noEmit`.

### Added (Phases 0–4, same release)

- **Data backfill (Phase 4):** [`backfill_phase4_sales`](apps/inventory/management/commands/backfill_phase4_sales.py) — load V1/V2 `cart` / `cart_line` and V2 `pos_cart` / `pos_cart_line` into V3 **`Cart`** / **`CartLine`**; `WorkLocation` "Eco-Thrift Main", Register **`BACKFILL`**, system user `backfill@system.local`, one **`Drawer`** per Chicago sale date; payment aggregation; V2 cashier map via legacy `core_user.email`; update BACKFILL **`Item`** `sold_at` / `sold_for` / `status=sold` from lines; flags `--clean`, `--reset-item-sales`, `--delete-historical-transactions`, `--dry-run`, `--limit`, `--skip-v1` / `--skip-v2`, `--skip-item-updates`. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 5.
- **Data backfill (Phase 3):** [`backfill_phase3_items`](apps/inventory/management/commands/backfill_phase3_items.py) — load V1/V2 historical `Item` rows from **`ecothrift_v1`** / **`ecothrift_v2`** (`psycopg2`); lookup maps from Phase 1–2 `Product` / `PurchaseOrder`; `bulk_create` with precomputed `search_text`; idempotent `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` notes; Misfit PO fallbacks; V2 numeric `ITM…` SKUs prefixed `V2-`; `--dry-run`, `--limit`, `--skip-v1` / `--skip-v2`. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 4.
- **Data backfill (Phase 2):** [`backfill_phase2_products_manifests`](apps/inventory/management/commands/backfill_phase2_products_manifests.py) — load V1/V2 `Product` and `ManifestRow` from **`ecothrift_v1`** / **`ecothrift_v2`**; products via `save()` for `PRD-*`; manifest rows `bulk_create`; PO linkage; `category` + `specifications` legacy fields; idempotent on `BACKFILL:` tags. See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 3.
- **Data backfill (Phase 1):** [`backfill_phase1_vendors_pos`](apps/inventory/management/commands/backfill_phase1_vendors_pos.py) — load V1/V2 vendors and purchase orders from legacy PostgreSQL databases **`ecothrift_v1`** / **`ecothrift_v2`** (raw `psycopg2`, same `DATABASE_*` as V3); idempotent `get_or_create`; inline description metadata as JSON on the last line of `notes` (after optional legacy V2 plain-text lines). See [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 2.
- **Data backfill (Phase 0):** [`setup_misfit_backfill_pos`](apps/inventory/management/commands/setup_misfit_backfill_pos.py) — vendor **MIS** (“The Island of Misfit Items”) and placeholder POs **MISFIT-V1-2024** / **MISFIT-V2-2025** for orphan items. [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) — removed ~146.9k `HISTORICAL:db1:`/`HISTORICAL:db2:` `inventory_item` rows; preserved 9,009 real V3 items; `pos_cart` / `pos_cartline` counts unchanged.

### Changed

- **POS reporting:** [`historical_revenue`](apps/pos/views.py) excludes carts on register **`BACKFILL`** from db3 aggregates while **`HistoricalTransaction`** rows exist for db1/db2 (avoids double-counting legacy totals vs `import_historical_transactions`). After deleting db1/db2 historical rows or loading only via Phase 4, totals reflect Carts.
- **Data backfill initiative (Phase 0 close / consultant pass):** Production deployment strategy (export CSVs + `import_backfill`); Phase 1–5 text corrections (inline PO enrichment, verify `PurchaseOrder` mappings before code, product dedup evaluation, backfilled items never `on_shelf`, taxonomy label count unverified). [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md). Added [`workspace/scripts/convert_pickles_to_csv.py`](workspace/scripts/convert_pickles_to_csv.py) — pickle→CSV using `pickle/manifest.json` (run in notebook venv if `read_pickle` fails).
- **AI steering / protocols:** Replaced **`review.0.Bump.md`** with **`session.9.Close.md`**; rewrote **`code.0.Startup.md`** (session entry step) and **`code.1.Bearing.md`** (progress vs written session). Generalized consultant bundle workflow (today: **`extended/consultant_handoff.md`**). [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md) uses **Phase** + **Notes** columns; session detail lives in initiative files only. [`.ai/context.md`](.ai/context.md) **Working** section is short capability pointers (detail in **`.ai/extended/`**). Cross-links updated (README, lifecycle protocols, CHANGELOG history where cited). Django admin vs React **`/admin/*`** and retag history serializer guardrails moved to [`.ai/extended/frontend.md`](.ai/extended/frontend.md) and [`.ai/extended/retag-operations.md`](.ai/extended/retag-operations.md).
- **Initiative archiving:** [docs_restructure](.ai/initiatives/_archived/_completed/docs_restructure.md) archived as **completed**; [historical_sell_through_analysis](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md) moved to **pending** (initial rates seeded manually v2.8.0; data-backed refinement deferred). Session history seeded in initiative files.
- **AI steering / protocols (follow-up):** Added [`.ai/protocols/session.1.Checkpoint.md`](.ai/protocols/session.1.Checkpoint.md) for **mid-session** pulses (session updates, **`[Unreleased]`**, light extended-doc sync). **`code.0.Startup.md`** now includes **framing questions** (success, intent, time, owner, out-of-scope, ship expectation) and points to checkpoints vs **`session_close`**. **`README`**, **`context`**, **`get_bearing`**, **`session_close`** cross-links updated.

### Fixed

- **Data backfill (Phase 3):** [`backfill_phase3_items`](apps/inventory/management/commands/backfill_phase3_items.py) — V1 `SELECT` no longer `JOIN`s `product` on `code` when multiple legacy `product` rows share a code (use `LATERAL … LIMIT 1`); avoids duplicate result rows and bogus `skipped_exists`. Dry-run reports **`would_create`** instead of inflating **`created`**; **`bulk_create`** errors are logged and re-raised. [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) Session 4 close.

### Initiative

- [`.ai/initiatives/data_backfill_initiative.md`](.ai/initiatives/data_backfill_initiative.md) — Phases **0–6** complete on loaded DB (**v2.10.0**); production CSV export / `import_backfill` deployment still deferred.

---

## [2.9.0] — 2026-04-09

### Added

- **Buying — Phase 5 (React UI):** [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — **Auction list** (`/buying/auctions`): valuation **DataGrid** columns — **Profitability** / **Need** pills, **Est. revenue**, **Retail** (manifest vs listing tooltip), **Priority** with Admin **steppers**, **Thumbs up** toggle (Admin), **Time left** with color bands; default server sort **`-priority,end_time`**. **Filter chips** (server-side **`AuctionFilter`** / **`WatchlistAuctionFilter`**): **Profitable**, **Needed**, **Thumbs up**, **Watched**, **Has manifest** — multi-select with Ctrl/⌘ (plain click isolates / clears per row semantics); **marketplace** chips: **All** first, Ctrl/⌘ multi-vendor; layout: **Filters** + **Clear all**, then marketplace row, then filter row; mobile-scaled chips. **Category need panel** (desktop **`md+`**): **Min** / **Window** / **Full** sizing, bar charts, category detail, staff **want vote** slider (debounced). **Auction detail:** **AuctionValuationCard** (full computation breakdown, revenue/fees/shipping/shrinkage/profit-target/priority overrides, **max bid** line), **AiManifestComparisonStrip** when both AI and manifest mix exist. **Watchlist** row tint on main list (≤**100** watchlist IDs for tint query). **Mobile** list: scaled chips, time formatting, infinite scroll. **React Query:** `placeholderData: keepPreviousData` on auction + watchlist list queries so **server pagination** stays stable when the page param changes. **API:** **`GET /api/buying/category-need/`** category rows include **`sell_through_rate`**; list params **`profitable`**, **`needed`**; **`GET /api/buying/watchlist/`** accepts **`marketplace`**, **`status`**, **`has_manifest`**, **`profitable`**, **`needed`**, **`thumbs_up`** (watchlist filter parity with main list). **Backend:** `WatchlistAuctionFilter` extended for **`profitable`**, **`needed`**, **`thumbs_up`**; manifest-based **`has_manifest`** filtering aligned with list queryset.

### Fixed

- **Buying:** Pagination **snap-back** on alternate “next page” clicks (grid saw **`rowCount: 0`** while the next page was loading); **has_manifest** filter uses manifest-row existence consistently; **category distribution** mix math; want-vote slider **debouncing**.

### Changed

- **Buying — B-Stock JWT calls:** Token-backed **HTTP from the REST API** is **disabled** (`501` / `token_backed_bstock_disabled` on **`pull_manifest`**, **`poll`**, etc.) — **CSV upload** and soft-touch sweep remain; ban-risk mitigation (see [`apps/buying/api_views.py`](apps/buying/api_views.py)). **Management commands** may still be run manually where applicable.

### Notes (documentation)

- **Parking lot** entries in the initiative file (data backfill, **Groq** cost idea, **`ai_key_mapping.py`** → **`AI_MODEL_FAST`** one-liner, **`ai_key_mapping.py`** model-discussion follow-up). **AI steering:** tooltips on multi-select chips are one short platform-aware line (**`multiSelectChipTooltip`**).

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **5** **React UI** shipped (**v2.9.0**); **Phase 6** (outcomes) next.

---

## [2.8.0] — 2026-04-09

### Added

- **Buying — Phase 5 (auction valuation):** **`PricingRule`** (flat **`sell_through_rate`** per taxonomy_v1 category — **19** categories; **no** vendor × category matrix; model shape unchanged) and **`CategoryWantVote`** (staff **`value`** 1–10 per category, **`voted_at`**). **`Auction`** valuation fields: **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`**, **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`**, **`thumbs_up`**. **`Marketplace`** defaults: **`default_fee_rate`**, **`default_shipping_rate`**. Migrations **`0009_phase5_auction_valuation`**, **`0010_auction_fee_shipping_overrides`**.
- **Valuation engine:** **`apps/buying/services/valuation.py`** — **`recompute_auction_valuation`**, **`recompute_all_open_auctions`**, **`compute_and_save_manifest_distribution`**, **`get_valuation_source`**, **`run_ai_estimate_for_swept_auctions`**; retail base from manifest sum or **`total_retail_value`**; **`estimated_revenue`** stored **pre-shrinkage**; **`profitability_ratio`** uses **effective revenue after shrinkage** vs **`estimated_total_cost`**; **`revenue_override`** / **`fees_override`** / **`shipping_override`** semantics per initiative (**`coalesce`** for revenue; fee/shipping overrides **USD** only when set).
- **AI title category estimation:** **`apps/buying/services/ai_title_category_estimate.py`** — **`estimate_batch`** with **`AI_MODEL_FAST`**, few-shot from marketplace, batch rows keyed by **`auction_id`** (historical **`title_echo`** check removed in v2.15.3).
- **Category need / want:** **`GET /api/buying/category-need/`**; **`GET`/`POST /api/buying/category-want/`** with **`effective_value`** (step decay toward **5** per **`buying_want_vote_decay_per_day`**). **`apps/buying/services/category_need.py`**, **`want_vote.py`**, **`buying_settings.py`**.
- **Staff controls & serializers:** **`POST`/`DELETE /api/buying/auctions/{id}/thumbs-up/`** (Admin); **`PATCH /api/buying/auctions/{id}/valuation-inputs/`** (Admin) — **recompute** on change. **`AuctionFilter`** **`thumbs_up`**; list **`ordering`** includes **`priority`**, **`estimated_revenue`**, **`profitability_ratio`**, **`need_score`**; list/detail serializers expose **`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**, etc.
- **Seeds & management commands:** **`python manage.py seed_pricing_rules`** (CSV + **`AppSetting`** keys); **`python manage.py seed_marketplace_pricing_defaults`**; **`python manage.py estimate_auction_categories`**; **`python manage.py recompute_buying_valuations`**.
- **Manifest upload hooks:** **`manifest_upload`** computes **`manifest_category_distribution`** and triggers valuation **recompute** when mapping completes (**`upload_manifest`**, **`map_fast_cat_batch`** when queue clears, **`DELETE …/manifest/`**); **`pipeline`** sweep runs limited AI estimate batch + **`recompute_all_open_auctions`**.
- **Tests:** **`apps/buying/tests/test_valuation.py`**, **`apps/buying/tests/test_phase5_category_need.py`**.
- **Documentation & AI steering:** New protocol [`.ai/protocols/code.1.Bearing.md`](.ai/protocols/code.1.Bearing.md); consultant bundle procedure now [`.ai/extended/consultant_handoff.md`](.ai/extended/consultant_handoff.md); personas [`.ai/personas/Scout.md`](.ai/personas/Scout.md), [`.ai/personas/Christina.md`](.ai/personas/Christina.md); updates to **`.ai/context.md`**, **`.ai/extended/backend.md`**, **`.ai/extended/bstock.md`**, **`.ai/extended/frontend.md`**, **`.ai/consultant_context.md`**, **`.ai/initiatives/_index.md`**, **`bstock_auction_intelligence.md`**.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **5** backend/API shipped; **next:** Phase **5** React valuation columns (optional) or **Phase 6** outcomes.

---

## [2.7.1] — 2026-04-09

### Added

- **Historical sell-through — consultant PO export:** `python workspace/notes/to_consultant/extract_po_descriptions.py` reads Purchase Orders from local **V1** (`ecothrift_v1`), **V2** (`ecothrift_v2`), and **V3** when `public.inventory_purchaseorder` exists; writes **`workspace/notes/to_consultant/purchase_orders_all_details.csv`** (full PO-level rows, same columns as **`workspace/data/po_descriptions_all.csv`**), plus category distribution / sell-through join outputs and **`po_description_analysis.md`**. Requires root **`.env`** `DATABASE_*`; V3 yields zero rows until inventory migrations / correct DB. Script is tracked in git (see **`.gitignore`** whitelist under **`workspace/notes/to_consultant/`**).

### Changed

- **`.gitignore`:** Whitelist **`workspace/notes/to_consultant/extract_po_descriptions.py`** so the consultant extract is versioned; generated CSV/Markdown under that folder remain ignored.

### Initiative

- [`.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md`](.ai/initiatives/_archived/_pending/historical_sell_through_analysis.md) — tooling toward Phase **3** (sales join); consultant deliverable path documented.

**Note (2026-04-16):** The **`workspace/notes/to_consultant/`** layout and **`.gitignore`** whitelist in the bullets above matched **v2.7.1** at release; later cleanup moved consultant procedures to **`extended/consultant_handoff.md`** and dropped **`workspace/notes/`** tracking. CSV outputs are **`workspace/data/`**.

---

## [2.7.0] — 2026-04-08

### Added

- **Buying — Phase 4.1B (AI template creation, AI key mapping, upload progress):** Unknown CSV headers → Claude proposes **`column_map`** and **`category_fields`**; new or matched **`ManifestTemplate`** saved with **`is_reviewed=True`**; upload continues in one flow. **`POST /api/buying/auctions/{id}/map_fast_cat_batch/`** processes up to **10** unmapped **`fast_cat_key`** values per request; persists **`CategoryMapping`** with **`rule_origin='ai'`** and updates **`ManifestRow.fast_cat_value`**. **`POST …/upload_manifest/`** Stage **1** (template + rows, synchronous) returns **`unmapped_key_count`** and **`total_batches`**. **`DELETE /api/buying/auctions/{id}/manifest/`** deletes manifest rows only (**`ManifestTemplate`** and **`CategoryMapping`** retained). **`fast_cat_key`** values containing **`__no_key__`** (no category fields on the row) are excluded from AI batches and from unmapped counts. See initiative.
- **AI usage logging:** Append-only **`workspace/logs/ai_usage.jsonl`** with **input** / **output** / **cache_creation** / **cache_read** token fields, **Decimal** cost from **`AI_PRICING`** in **`ecothrift/settings.py`**; **`log_ai_usage`** and **`log_ai_usage_from_response`** in **`apps/core/services/ai_usage_log.py`**; retrofitted across AI call sites (chat proxy, inventory AI, buying **`category_ai`**, management commands, 4.1B services). **`scripts/ai/summarize_ai_usage.py`** and **`scripts/ai/summarize_ai_usage.bat`** — totals, by source, by marketplace, by date, last **10** calls, cache stats, interactive clear.
- **Frontend — Buying:** **`ManifestUploadProgress`** and Stage **2** driver (**four** concurrent **`map_fast_cat_batch`** workers); progress bar, running estimated cost, latest mapping label, cancel; **debounced** React Query invalidation (~**1** s) for live **Manifest Rows** and category mix; **Remove manifest** inside manifest card with confirmation; drop/replace controls hidden while **`mapping`**; two-column layout aligned with flex (**`flex: 1`** manifest content card). **`frontend/src/components/buying/ManifestUploadProgress.tsx`**, **`AuctionDetailPage`**.

### Changed

- **Settings / pricing:** **`AI_MODEL`**, **`AI_MODEL_FAST`** (from **`.env`** with defaults in **`ecothrift/settings.py`**); **`AI_PRICING`** per-model rates (Sonnet, Opus, Haiku — input, output, cache write, cache read per million tokens); **`BUYING_CATEGORY_AI_MODEL`** unified as alias to **`AI_MODEL`**. Prompt caching via **`cache_control: {"type": "ephemeral"}`** on system content blocks. **`.env.example`** updated.

### Notes (documented, non-blocking)

- **`DELETE manifest`:** TODO on wrong-marketplace CSV leaving stale AI **`CategoryMapping`** prefixes after row removal — future admin tooling or **`purge_ai_mappings`** option ([`apps/buying/api_views.py`](apps/buying/api_views.py)).
- **Cache hit rate ~0** on fast-cat key batches: prompts under Sonnet **2048**-token minimum cache threshold; no action required.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **4.1B** shipped; **next: Phase 5** (auction valuation).

---

## [2.6.1] — 2026-04-10

### Added

- **Buying — Phase 4.1A (manifest templates, `fast_cat_key`, static seed):** `ManifestTemplate` model; **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart CSV); template detection + **`python manage.py seed_fast_cat_mappings`** (343 vendor `fast_cat_key` → taxonomy_v1 rows, fully inlined — no workspace file dependency). See initiative.

### Changed

- **Buying — auction list UI:** All DataGrid columns sortable (including marketplace, title, condition, status, manifest); **Total retail** shows whole dollars with **manifest sum vs listing sweep** via API fields **`total_retail_display`** / **`retail_source`** (tooltip); **Manifest** column shows row count when present; marketplace chip UX: single-click isolates one vendor, **Ctrl/⌘+click** multi-select, helper copy + info tooltip; React Query **refetchOnMount** for auction list and summary so returning from detail shows fresh manifest flags.
- **Buying — auction detail UI:** Two-column layout (metadata card | manifest card); **Open on B-Stock** link lives under manifest drop zone; **Has manifest** badge driven by row count; category mix bar shows **all** canonical categories (no rolled-up “Other”); manifest table **search** + **fast category** filter (server-side **`search`** / **`category`** on **`GET …/manifest_rows/`**).
- **Buying — API:** List queryset annotates manifest retail sum and **`retail_sort`** for ordering; auction detail **`category_distribution`** returns full category list; successful CSV upload sets **`Auction.has_manifest`**.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase **4.1A** manifest upload + fast-cat seed shipped; Phase **5** (valuation) still next.

---

## [2.6.0] — 2026-04-10

### Added

- **Buying — Phase 3 (watchlist polling, snapshots, price history):** **`python manage.py watch_auctions`**; **`GET /api/buying/auctions/{id}/snapshots/`**; **`POST /api/buying/auctions/{id}/poll/`**; auction detail price chart (Recharts) / table on small screens; **`AuctionSnapshot`** time series.

- **Buying — Phase 4 (fast categorization):** **`CategoryMapping`** model; **`ManifestRow.canonical_category`** / **`category_confidence`**; **`apps/buying/taxonomy_v1.py`**; **`seed_category_mappings`**, **`categorize_manifests`** (tier 1 + 3; **`--ai`** / **`--ai-limit`** for Claude tier 2); **`categorize_manifest_rows`** after manifest pull; API **`category_distribution`**; auction detail **category bar** + **chips**.

### Fixed

- **Buying — manifest retail:** **`normalize.py`** converts B-Stock minor-unit integers to dollars where applicable (**`_manifest_retail_to_dollars`**); **`renormalize_manifest_rows`** reapplies to existing rows.

### Changed

- **Initiative** [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md): Phases **3–4** acceptance complete; **Phase 7** removed from phased plan; **Operational notes** (soft-touch vs invasive sweep, manual manifest path, ban mitigation); **Open questions** updated (ban risk, retrospective deferred). **Consultant:** [`.ai/consultant_context.md`](.ai/consultant_context.md) aligned.

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — **Phases 3–4 complete.** **Next: Phase 5** (auction valuation).

---

## [2.5.0] — 2026-04-08

### Added

- **Buying — Phase 2 close-out (2B auction detail, 2C watchlist page, manifest normalization):** Staff React routes **`/buying/auctions/:id`** (`AuctionDetailPage`) and **`/buying/watchlist`** (`WatchlistPage`); sidebar **Buying** links **Auctions** + **Watchlist**. Detail: metadata, pull manifest, star watchlist toggle, manifest **DataGrid** (server pagination, 50/page) or mobile cards + load more. **Watchlist:** **`GET /api/buying/watchlist/`** (auction list shape + nested **`watchlist_entry`**, filters **`priority`** / **`watchlist_status`**, ordering **`end_time`**, **`current_price`**, **`total_retail_value`**, **`added_at`**; default **`end_time`** ascending); remove via existing **`DELETE /api/buying/auctions/:id/watchlist/`** with list invalidation. **Manifest normalization:** **`apps/buying/services/normalize.py`** maps B-Stock order-process JSON (nested **`attributes`**, **`attributes.ids`**, **`uniqueIds`**, **`categories`**, **`itemCondition`**, etc.); optional unmapped-key warnings; **`python manage.py renormalize_manifest_rows`** (no JWT). Unit tests: **`apps/buying/tests/test_normalize_manifest.py`**.

### Changed

- **Phase 2A** (auction list UI) shipped in **v2.4.1**; this minor release completes **Phase 2** under [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md).

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — **Phase 2 (2A–2C) complete.** Next: **Phase 3** (watchlist polling, **`AuctionSnapshot`**, price history).

---

## [2.4.1] — 2026-04-08

### Added

- **Buying — auction list API (staff):** **`GET /api/buying/auctions/`** (paginated, filters, ordering), **`GET /api/buying/auctions/:id/`**, **`GET /api/buying/marketplaces/`**, **`GET /api/buying/auctions/summary/`** (global `last_refreshed_at` + per-marketplace counts), **`POST /api/buying/sweep/`** (runs `pipeline.run_discovery`). **`AuctionFilter`:** `marketplace` accepts comma-separated slugs (`__in`). Contract listings (`listingType` **CONTRACT**) excluded from default list queryset; detail by id still allowed. Model fields **`listing_type`**, **`total_retail_value`** (from B-Stock search `listingType` / `retailPrice`); migration **`0004_auction_listing_type_total_retail`**.

### Changed

- **Frontend — Buying:** Staff routes **`/buying/auctions`** — DataGrid (desktop) + card list with infinite scroll (below **`md`**); marketplace chips as toggle filters with **All** reset (tap last-only chip resets all); global summary counts; last-refreshed label; sequential **Refresh auctions** per marketplace with progress text, spinner, snackbar (partial failures listed); **Load more (N remaining)** on mobile. Shared helpers **`frontend/src/utils/buyingAuctionList.ts`**; split **`AuctionListDesktop`**, **`AuctionListMobile`**, **`AuctionMarketplaceChips`**; **`useBuyingAuctionsInfinite`**. Removed unused **`useBuyingSweep`** hook (sweep calls **`postBuyingSweep`** directly).

### Initiative

- [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md) — Phase 2A auction list shipped; Phase 2B detail / manifests / watchlist next.

---

## [2.4.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1 complete):** Django app **`apps/buying/`** with models, services (**`scraper`**, **`pipeline`**, **`normalize`**), management commands **`sweep_auctions`**, **`pull_manifests`**, **`bstock_token`**; **`POST /api/buying/token/`** (DEBUG or localhost) writes **`workspace/.bstock_token`**; rejects JWE cookie tokens (`eyJhbGciOiJSU0EtT0FF`). **`scripts/refresh_bstock.bat`**. Bookmarklet and docs: **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`**. Notebook workbench: **`.ai/extended/development.md (Jupyter)`**. Initiative: [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md).

### Changed

- **Buying / B-Stock scraper:** Microservice URLs (`search.bstock.com`, `auction.bstock.com`, `listing.bstock.com`, `order-process.bstock.com`, `shipment.bstock.com`). Settings: **`BSTOCK_AUTH_TOKEN`**, **`BUYING_REQUEST_DELAY_SECONDS`**, **`BSTOCK_MAX_RETRIES`**, **`BSTOCK_SEARCH_MAX_PAGES`**. **`DEBUG`** CORS adds **`https://bstock.com`** / **`https://www.bstock.com`** for bookmarklet **`fetch`**. **`get_manifest`**: **`limit`** capped at **1000** per request; paginates with **`offset`** until **`total`** rows. Search listing mapping: **`categories`**, **`winningBidAmount`**, **`numberOfBids`**, **`auctionUrl`**, **`has_manifest`** when **`lotId`** is set; **`merge_auction_state_into_fields`** fills **`startPrice`**, **`buyNow.price`**, **`winningBidAmount`**; money helper treats integers **>= 10000** as cents.

- **Docs / env:** **`.env.example`**, **`.ai/extended/backend.md`**, **`.ai/extended/development.md`**, **`.ai/context.md`**, **`README.md`**, **`.ai/extended/development.md`** (Jupyter), **`.ai/initiatives/_index.md`** (B-Stock row).

### Baseline (release verification)

- **`python manage.py sweep_auctions`:** **97** listing rows upserted across **6** active marketplaces (full pagination run).
- **`python manage.py pull_manifests`:** ran; **0** new manifest rows written in this run (existing rows already present for eligible auctions).
- **Postgres snapshot after sweep:** **98** `Auction` rows, **67,276** `ManifestRow` rows (cumulative across this and prior sessions).

---

## [2.3.0] — 2026-04-07

### Added

- **Buying / B-Stock (Phase 1):** New Django app **`apps/buying/`** for auction intelligence: models `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`; server-side services **`discover_auctions`**, **`get_auction_detail`**, **`get_manifest`** (manifest URL optional until DevTools capture); **`python manage.py sweep_auctions`** and **`python manage.py pull_manifests`**; Postgres-backed persistence; Django admin registration. Configuration via **`BSTOCK_*`** and **`BUYING_REQUEST_DELAY_SECONDS`** in `.env` (see **`.env.example`**). Explicit **`requests`** dependency in **`requirements.txt`**. Notebook workbench: **`.ai/extended/development.md (Jupyter)`**. Initiative: [`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`](.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md).

---

## [2.2.10] — 2026-04-07

### Changed

- **Category research — single-database exports:** **`export_category_bins`** uses Django’s **`default`** connection only. Bins 1–2 run schema-qualified SQL against **`public.*`** (V2-era inventory/POS); Bin 3 uses **`ecothrift.*`**. Removed optional **`DATABASES['legacy']`** / **`CATEGORY_LEGACY_DATABASE_NAME`** from settings — one Postgres database can hold both schemas. SQL script headers and **`workspace/testing/Category Research/`** docs updated accordingly. Initiative (now archived): [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## [2.2.9] — 2026-04-06

### Added

- **POS — unscannable (pink tag) line:** **`POST /api/pos/carts/{id}/add-manual-line/`** adds a cart line **without** an inventory item (`item` null): `description` (required), optional `unit_price` (default **0.50**), optional `quantity` (default 1). Rejects non-open carts. No `ItemScanHistory` row. Terminal: **Unscannable item** button, dialog (defaults **Pink Tag Item** / **0.50**), description field selected on open, **OK** / Enter submits; cart lines show a **Pink tag** chip when `item` is null. Tests: `apps/pos/tests/test_cart_manual_line.py`. Initiative: [`.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md`](.ai/initiatives/_archived/_completed/pos_unscannable_manual_line.md).

---

## [2.2.8] — 2026-04-06

### Added

- **POS — sold SKU and resale copy:** Scanning a sold unit returns structured errors (`ITEM_ALREADY_SOLD`, `sku`, `title`). **`ItemScanHistory`** extended with `outcome`, optional `cart` and `created_by`; blocked scans log `pos_blocked_sold`. **`POST /api/pos/carts/{id}/add-resale-copy/`** atomically duplicates a sold item for resale ([`apps/inventory/services/resale_duplicate.py`](apps/inventory/services/resale_duplicate.py)) and adds a line with **`resale_source_sku`** / **`resale_source_item_id`** for staff reporting. Terminal: modal (**Cancel** vs **Create copy and add to cart**). Transactions detail (`/pos/transactions`) shows a staff-only resale caption; printed receipts use normal line **description** only (no internal provenance on the customer copy). Tests: `apps/pos/tests/test_cart_add_item_audit.py`, `test_cart_add_resale_copy.py`. Initiative: [`.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md`](.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md).

### Deployment

- **Migrations:** apply `inventory` (ItemScanHistory) and `pos` (CartLine resale columns): `python manage.py migrate`.

---

## [2.2.7] — 2026-04-06

### Fixed

- **POS — cart totals:** `Cart.recalculate()` now sums line totals from the database instead of `cart.lines.all()`, which could reuse a stale `prefetch_related` cache after `add-item` or line edits so header/footer totals lagged line rows. Regression tests: `apps/pos/tests/test_cart_totals.py`. Initiative: [`.ai/initiatives/pos_cart_total_stale_prefetch_bug.md`](.ai/initiatives/pos_cart_total_stale_prefetch_bug.md). For local runs without a PostgreSQL test database, use `python manage.py test apps.pos.tests --settings=ecothrift.test_settings` (SQLite in-memory via [`ecothrift/test_settings.py`](ecothrift/test_settings.py)).

- **Routing — Django admin vs React `/admin/*`:** Django **`contrib.admin`** moved from **`/admin/`** to **`/db-admin/`** so hard refresh and direct URLs to in-app pages (e.g. **`/admin/settings`**, **`/admin/users`**) load the React SPA instead of Django’s admin login. Production SPA fallback no longer excludes **`admin/`**; Vite dev proxy targets **`/db-admin`** only. Exact **`/admin`** / **`/admin/`** redirects to **`/db-admin/`** for bookmarks to the old Django admin root. Superusers who used Django Admin at **`/admin/`** should open **`/db-admin/`**. Initiative (archived completed): [`.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md`](.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md).

---

## [2.2.6] — 2026-03-31

### Changed

- **Inventory — Retag:** After a successful multi-unit tag (**Labels / qty** > 1), the qty control resets to **1** for the next scan. **Outside initiative** — UX polish (`RetagPage.tsx`).

---

## [2.2.5] — 2026-03-31

### Added

- **Inventory — Retag:** **Labels / qty** (1–50) on **`/inventory/retag`** creates that many new DB3 items (unique SKUs, one `RetagLog` per unit) per scan or manual confirm. **`POST /api/inventory/retag/v2/create/`** accepts optional **`quantity`** (default 1) and returns **`created`** (per-item `new_sku` + `print_payload`). The browser prints each label with the existing local print server **`POST /print/label`** only, staggered **200 ms** between jobs (no new print-server routes).

---

## [2.2.4] — 2026-03-28

### Fixed

- **Layout — sidebar:** Prevent horizontal scrollbars in the left nav: drawer paper and scroll region use **`overflow-x: hidden`**; nav list is full-width with **`minWidth: 0`**; long labels **ellipsis**; section chevrons and icons **`flexShrink: 0`**. **Outside initiative** — UI polish only (`MainLayout.tsx`, `Sidebar.tsx`).

---

## [2.2.3] — 2026-03-28

### Added

- **Inventory — Item detail:** After **Save**, if **price**, **title**, or **brand** changed, a **non-blocking warning banner** (fade + auto-dismiss) recommends **reprinting the label**, with a **Reprint label** action. Initiative closure: [`.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Changed

- **Inventory — Quick Reprice:** **Default 10%** off current price; radio/helper copy updated; **Discount Settings** remains **above** the scan row. **“This Session”** still titled that way; list + totals persist **this browser · local calendar day** (`localStorage`, new list after **local midnight**). Subtle caption under the card explains scope.

---

## [2.2.2] — 2026-03-27

### Added

- **Steering:** Initiative **archiving** requires **explicit user approval** (documented in [`.ai/initiatives/_index.md`](.ai/initiatives/_index.md), [`_archived/ARCHIVE.md`](.ai/initiatives/_archived/ARCHIVE.md), [`.ai/protocols/code.0.Startup.md`](.ai/protocols/code.0.Startup.md), [`.ai/protocols/session.9.Close.md`](.ai/protocols/session.9.Close.md), [`.ai/context.md`](.ai/context.md)). Initiative [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/e2e_retag_quick_reprice_fixes.md) **restored** to the active index with expanded scope *(now archived as [completed](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md)).*
- **Inventory — Quick reprice (sold units):** **`POST /api/inventory/items/:id/duplicate-for-resale/`** (staff) creates a new **on-shelf** item from a **sold** row; **`POST /api/inventory/items/:id/mark-on-shelf/`** (Manager/Admin) when no completed POS sale exists. **Quick Reprice** dialog: **Create unsold copy & reprice**, **Mark on shelf again**, **Cancel**.
- **Inventory — Quick reprice UX:** **This Session** card with **expand/collapse** (chevron) listing all repriced items with links to **`/inventory/items/:id`**. **`?sku=`** query prefill when opening Quick Reprice from item detail.
- **Inventory — Item detail:** **Print tag** and **Reprice** (deep-link to Quick Reprice with `?sku=`). Initiative: [`e2e_retag_quick_reprice_fixes.md`](.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md).

### Fixed

- **Inventory — Quick reprice:** Item list ignored `?sku=` (DRF search uses `search`, not `sku`). Added exact **`sku`** to `ItemViewSet` filterset fields so scans resolve the correct row. **Quick Reprice** uses the shared API client, normalizes SKU, shows **status**, blocks non-sellable statuses; **`POST .../quick-reprice/`** rejects disallowed statuses with HTTP 400.
- **Inventory — Retag history:** History fetch failures show an error alert; summary tiles distinguish **all-time totals** vs **tags this visit** vs **this session only** (server log count).

### Changed

- **Initiatives layout:** Replaced `.ai/plans/` with `.ai/initiatives/` (main `_index`, `_archived/` buckets). Updated `.ai/context.md`, protocols, extended docs, notebook links.
- **Documentation layout:** Setup in `.ai/extended/development.md`; removed standalone `docs/` tree from prior layout; E2E checklist under `workspace/testing/`.

---

## [2.2.1] — 2026-03-25

### Added
- **Print server Windows installer:** `cleanup_legacy_prior()` in `printserver/installer/setup.py` removes legacy V2 stack (Startup `Eco-Thrift Print Server.vbs`, `C:\DashPrintServer` / `C:\PrintServer` when `print_server.py` + `venv\` exist) and frees port 8888 before installing V3; same cleanup runs at start of uninstall. Optional IT batch: `printserver/installer/uninstall_legacy_prior.bat`.
- **Print server** bumped to **1.0.7** (`printserver/config.py`, `CHANGELOG`) for the installer change.

### Changed
- **AI / steering docs:** `.ai/extended/print-server.md`, `.ai/plans/print_server_v3_testing_and_migration.md`, `.ai/reference/PrintServer (V2)/LEGACY_UNINSTALL.md` aligned with in-installer migration (no standalone `scripts/printserver_uninstall_all`); `.ai/context.md` and `README.md` updated.
- **`docs/development.md`:** Print server notes and layout table; this repo’s `docs/` tree may only contain this file plus any other paths you keep locally.

---

## [2.2.0] — 2026-03-25

### Added
- **B-Stock notebook scraper package:** `workspace/notebooks/Scraper/` with `BStockScraper` (`get_auctions`, `update`, `save_to_disk`), HTTP client + config loader, optional Playwright module (`python -m Scraper.browser`), experimental `refresh_token` helper, `examples/bstock_quickstart.ipynb`, CLI `python -m Scraper` when run from `workspace/notebooks`. Secrets in gitignored `Scraper/bstock_config_local.py` (template: `Scraper/config.example.py`).

### Changed
- **Notebooks docs:** `workspace/notebooks/` layout + `docs/development.md` updated for `Scraper/` layout; `.ai/plans/bstock_scraper.md` and plans index refreshed.

### Removed
- Flat B-Stock scripts at `workspace/notebooks/` root (`bstock_scraper.py`, `bstock_scraper_browser.py`, `bstock_refresh_token.py`, `bstock_config.example.py`) — replaced by the `Scraper` package.

---

## [2.1.0] — 2026-03-24

### Added
- **Purchase order reset safety:** `GET /api/inventory/orders/:id/delete-preview/` and `POST /api/inventory/orders/:id/purge-delete/` (order-number confirmation).
- **Preprocessing preview search:** Server-side search over full raw manifest and full standardized output (top-100 preview window per endpoint).
- **Project / AI layout (BEST-spec alignment):** Repo root `.version` and `CHANGELOG.md`; `.ai/protocols/` (`code.0.Startup.md`, `session.9.Close.md`, `code.1.Bearing.md`); `.ai/plans/_index.md` and `plans/archive/`; `.ai/reference/`; committed `scripts/dev/` (`start_servers.bat`, `kill_servers.bat`) and `scripts/deploy/commit_message.txt`.
- **Root spec:** `2.EcoThrift.project_build_spec.md` describing layout, versioning, and protocols.
- **Multi-DB Jupyter:** Tracked `workspace/notebooks/` (selective gitignore): `config.example.py`, `db_explorer.ipynb` — SQLAlchemy + pandas helpers, pickles dir ignored; optional `requirements-notebooks.txt` (includes former ML deps).
- **`.ai/extended/databases.md`:** DB1 / DB2 / DB3 overview; credentials stay out of repo; points to `docs/Database Audits/`.

### Changed
- **App version API:** `GET /api/core/system/version/` reads repo root `.version` only; response still includes `build_date` / `description` as null/empty (reserved).
- **Dependencies:** Merged `requirements-ml.txt` into `requirements-notebooks.txt`; updated `train_price_model`, `categorizer`, `docs/retag/after_retag.md`, and related docs.
- **Notebooks:** `db_explorer.ipynb` resolves notebook dir when Jupyter cwd is repo root; optional `NOTEBOOK_DIR` env; `config_local.py` (gitignored) can load `DATABASE_*` from project `.env`.
- **Preprocessing UI:** Multi-open 3-step accordion (upload → raw sample → standardize); taller default viewports for raw/standardized tables; Inventory and POS sidebar sections collapsible like HR.
- **Docs:** `README.md`, `docs/architecture.md`, `docs/development.md`, `docs/api-reference.md`, `.ai/context.md` updated for new paths and versioning.

### Removed
- `.ai/version.json` and `.ai/changelog.md` (superseded by root `.version` + `CHANGELOG.md`).
- `.ai/procedures/` (replaced by `.ai/protocols/` with merged content).
- `.ai/extended/TOC.md` (extended docs indexed by filename).
- `requirements-ml.txt` (merged into `requirements-notebooks.txt`).

---

## [2.0.0] — 2026-03-04

### Added
- **Retag v2 — DB2→DB3 Migration System**: Full on-site retag workflow. `TempLegacyItem` model (staging table of active DB2 items, populated by `import_db2_staging`). `RetagLog` model (per-event log for retag day). Three `retag_v2_*` API endpoints (`lookup`, `create`, `history`). `RetagPage.tsx` at `/inventory/retag`. Supports 4 price strategies (keep current / % of current / AI estimate / % of retail), auto-print on scan, non-blocking "already retagged" snackbar warnings, always creates a new DB3 item per scan. Paginated history panel with summary tiles (total tagged, sum retail, sum price), search, and session filter. **Both `TempLegacyItem` and `RetagLog` are temporary scaffolding — drop after retag day.**
- **Pricing Model Foundation**: Management commands scaffolded: `import_historical_sold` (~145K sold items from DB1+DB2 for ML training data), `import_historical_transactions` (~68K transactions into `HistoricalTransaction` for multi-generation revenue reporting), `train_price_model` (gradient-boosted price estimator, output to `workspace/models/price_model.joblib`), `backfill_categories` (retroactive category classifier). Ready to run after retag day.
- **`very_good` condition**: Added `('very_good', 'Very Good')` to `CONDITION_CHOICES` on `Item`, `ManifestRow`, and `BatchGroup` models (migration `0010_add_very_good_condition`).
- **Database audits**: Full schema and row-count audits in `docs/Database Audits/` for DB1 (`ecothrift_v1` archive), DB2 local snapshot (`ecothrift_v2`), DB3 / Django dev (`ecothrift_v3`).
- **Retag day ops docs**: `docs/retag/before_retag.md` (prep checklist, data clearing, end-to-end test plan, price strategy guide) and `docs/retag/after_retag.md` (cleanup, historical import, model training, deployment checklist).

---

## [1.9.1] — 2026-02-26

### Fixed
- **POS `CartFilter` `status=open` fallthrough**: `filter_status` only handled `all`, `completed`, `voided` — `open` fell through returning all carts (including voided ones), causing voided carts to be restored on mount. Added `open` to the handled values.
- **Prefetch cache staleness after cart mutations**: `CartViewSet` uses `prefetch_related('lines')` which caches lines on the object. After `add_item` and `manage_line` mutations the serializer read stale prefetch cache, returning data one step behind. Fixed by re-fetching cart via `self.get_queryset().get(pk=cart.pk)` after `recalculate()`.
- **Cart restore stale React Query cache on navigation**: `useCarts` React Query hook served stale cached data instantly on `TerminalPage` remount, restoring an outdated cart before the fresh network response arrived. Replaced with direct `getCarts()` API call in a `useEffect` that always makes a fresh network request.
- **Duplicate CartLines on repeated item scan**: `add_item` was creating a new `CartLine` every time the same SKU was scanned. Now increments `quantity` on the existing line instead.

### Added
- **Inline cart line editing**: Edit icon per line opens in-place `TextField`s for `quantity`, `description`, and `unit_price`. Backend `manage_line` action serves both `PATCH` (update) and `DELETE` (remove) on `lines/{line_id}/`.
- **Void Sale button**: Red "Void" button + `ConfirmDialog` on terminal. Calls `POST /pos/carts/{id}/void/`. Voided carts visible in Transactions by default (status filter defaults to `all`).
- **Drawer reopen**: `POST /pos/drawers/{id}/reopen/` (Manager+) reopens a closed drawer. UI button on closed-drawer cards in `DrawerListPage`.
- **Terminal state machine**: `TerminalState` union + `deriveTerminalState()` drives full-page UI branching (unconfigured / loading / no_drawer / drawer_open_other / ready+active_sale / drawer_closed / manager_mode).
- **Lazy cart creation**: Cart is created on first item scan rather than on an explicit "Start Sale" button. Sale interface shown immediately when drawer is open/ready.

---

## [1.9.0] — 2026-02-25

### Added
- **Processing Page Overhaul** (`ProcessingPage.tsx`): full "Command Center + Side Drawer" redesign
- `useLocalPrintStatus` hook: polls `/health` every 30s, exposes `online`/`version`/`printersAvailable`; persistent green/gray status chip in PageHeader
- Print server graceful degradation: check-in succeeds even when print server offline; warning snackbar + reprint recovery on Checked In tab
- Staggered batch label printing via `Promise.allSettled` with 200ms stagger and inline "Printing X/Y labels..." progress alert
- **MUI Autocomplete order selector** with search, status chips, and per-order progress indicators replacing basic dropdown
- **Circular progress ring** (% complete) + stats chips (on-shelf, pending, batches) in order context bar
- **Always-visible SKU scanner input** with F2 hotkey focus; Enter searches items by SKU and auto-opens side drawer
- **Three-tab queue** (Batches / Items / Checked In) with badge counts; tab selection persists across interactions
- **Right-side MUI Drawer** (`ProcessingDrawer.tsx`) replaces center dialog; shows form + collapsible source data context (product, brand, cost, batch info)
- **Checked In tab**: DataGrid of completed items sorted by check-in time with per-row reprint button
- **Bulk check-in**: checkbox column on Items tab, floating "Bulk Check-In" dialog with shared condition/location/price/cost overrides; calls existing `check-in-items` endpoint; prints staggered labels
- **Detach confirmation popover**: replaces immediate action; shows warning before detaching item from batch
- **Keyboard shortcuts**: F2 (scanner focus), Ctrl+Enter (check-in), Escape (close drawer), Ctrl+P (reprint), N (next item)
- **Auto-advance**: after check-in automatically opens next pending item; toggle switch in stats bar (default ON)
- **Sticky defaults**: condition + location persist in `localStorage` under `processing_sticky_defaults`; pre-fill empty fields on open
- **Copy from Last**: button in drawer copies condition/location/notes from most recently checked-in item
- **Session stats bar** (`ProcessingStatsBar.tsx`): elapsed time, items/hour rate, ETA, session item count, auto-advance toggle
- **Back to Preprocessing** navigation button in PageHeader when an order is selected
- `useItems` and `useBatchGroups` hooks accept `enabled` parameter to prevent fetching all items when no order selected

### Changed
- `queueNotBuilt` logic broadened: triggers for both `delivered` and `processing` status with zero items (was `delivered` only)
- Items query limit raised from 500 to 1000 for large orders
- Replaced local `formatCurrency` in ProcessingPage with shared `formatCurrency` from `utils/format.ts`
- DataGrid density set to `compact` across all three tabs for higher information density

---

## [1.8.0] — 2026-02-25

### Added
- **Local Print Server** (`printserver/`): standalone FastAPI server on `127.0.0.1:8888` for label, receipt, and cash drawer printing via Windows GDI/ESC-POS
- Built-in browser UI at `/` (printer assignment dropdowns, test buttons) and `/manage` (status, auto-start toggle with Enabled/Disabled label, version check, changelog, uninstall)
- Windows self-contained installer (`ecothrift-printserver-setup.exe`) with Tkinter GUI, registry auto-start, port-kill on reinstall
- `distribute.bat` / `distribute.py`: builds both exes, uploads setup exe to S3, registers release in Django DB using management commands — no credentials required
- Django `publish_printserver` management command for credential-less release registration
- Public (no-auth) `print-server-version-public` endpoint for version checks from the print server management page
- Admin SettingsPage redesigned: printer assignment dropdowns, test label/receipt/drawer buttons, Client Download section, Online chip links to `/manage`
- Server-side update-check proxy (`/manage/check-update`) to avoid browser CORS restrictions
- `CORS_ALLOWED_ORIGINS` updated to include `127.0.0.1:8888`

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
