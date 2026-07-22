<!-- initiative: slug=delivery_mobile_operations_completion status=active updated=2026-07-22 -->
<!-- Last updated: 2026-07-22 (Phase 2 implemented — v2.56.0) -->
# Initiative: Delivery Mobile Operations Completion

**Status:** Active — Phase 2 shipped in **v2.56.0** (full-day Field workflow + Desk live monitor); Phase 3 (routing/ETA/signature/SMS polish) is next.

**Purpose:** Turn the existing `/pos/deliveries` feature into two deliberate products sharing one delivery domain:

1. a **desktop planning and review workspace** for office staff; and
2. a **mobile field app** for the driver and crew.

The initiative also establishes a safe production dummy-data lifecycle, dependable photo/signature evidence, verified route optimization and ETAs, dynamic re-routing, and one-tap handoff to the phone's native SMS app.

**Predecessor:** [`pos_discount_and_delivery`](./_archived/_completed/pos_discount_and_delivery.md) shipped terminal booking, schedule-later, and the first unified Day Board in **v2.50.0–v2.52.0**. This initiative is a completion/hardening pass, not a rewrite of the underlying delivery records.

---

## Owner intent — 2026-07-22

1. **Production phone iteration is required.** Local desktop testing is not enough. We need realistic, unmistakably fake delivery days that can be seeded, inspected, reset, and reseeded safely in production.
2. **Mobile and desktop must be different experiences.** Mobile is an in-field operational app used while calling, loading, driving, delivering, collecting proof, and returning. Desktop is for scheduling, planning, monitoring, review, and corrections. This is not one responsive layout rearranged at a breakpoint.
3. **Delivery media must be first-class.** Reuse the strong Receiving photo capture/view/replace patterns rather than maintaining a second weaker implementation.
4. **Signature capture must be basic and reliable.** A customer draws with a finger on a plain pad; the drawing must line up exactly with the finger and save as a small PNG. Document compositing is not required now.
5. **Optimization and ETAs must be real and explainable.** Route order and leg travel times must come from an actual routing provider when configured. ETA math includes a configurable delivery/service duration, default **20 minutes per stop**.
6. **The route is dynamic.** A no-answer stop remains tracked outside the active route. If the customer later confirms, staff can add the stop, re-optimize, and publish new ETAs.
7. **Customer texting remains human-controlled.** One tap opens the native iPhone or Android Messages composer with the customer's number and an encoded template. The driver reviews and taps Send; the dashboard does not silently send SMS.

---

## Current baseline and known gaps

### What already exists

- `DeliveryAvailability`, `DeliveryJob`, `DeliveryRun`, and `DeliveryRunStop`.
- Day stages for calls → route → load → drive → return.
- Google route planning with a fallback Maps URL.
- Truck, proof, issue, and signature attachments.
- IndexedDB delivery-media outbox.
- Address correction history, notes, call attempts, route events, load checks, return reconciliation, and completion overrides.
- Manager Add delivery from a past sale, inventory search, or description.
- Focused backend and frontend utility/card tests.

### Verified completion gaps to absorb

- A successful direct media upload can remain in the local outbox and leave **pending uploads** stuck.
- Board-created past-sale jobs do not retain structured source cart-line IDs for later SKU/line-item resolution.
- Pre-run item counts and availability `items_booked` can disagree with resolved cart-line quantities.
- Several run mutations trust the UI phase instead of enforcing the phase/state transition on the server.
- Managers can mark a job Done outside a run when no run exists, bypassing field proof.
- There are no page-level tests for `DeliveriesPage`, `DeliveryDayBoard`, Add delivery, or delivery details.
- The current page shares one component hierarchy across desktop and mobile.
- The current signature canvas is vulnerable to CSS/device-pixel-ratio/resize coordinate drift.
- Route fallback can look operationally similar to true optimization even when provider ETAs are unavailable.

These are Phase 1 inputs, not a separate initiative.

---

## Product contract

### One domain, two explicit applications

The desktop and mobile experiences share APIs, delivery records, state-machine rules, and small domain utilities. They do **not** share one page shell or card workflow.

| Experience | Primary user/context | Owns |
|------------|----------------------|------|
| **Delivery Desk** (desktop) | Office manager at a keyboard | Available dates, unscheduled queue, add/edit delivery, day planning, route preview, staffing, exceptions, live status, completed-run/evidence review, test datasets |
| **Delivery Field** (mobile) | Driver/crew using one hand in the field | Start/resume day, calls, confirmed/no-answer split, load, route/next stop, native call/text/maps actions, photos, signature, completion, issue/return flow |

Device detection may choose the default entry, but each experience has an explicit route and an explicit switch. A narrow desktop window must not silently turn the office workspace into the driver workflow, and a driver must be able to reopen the same field route after refresh.

### Two top-level destinations

There are only two delivery destinations in navigation. A Day Board is a drill-down from **Days**, not a third top-level page.

| Destination | Job to be done | Required find/read behavior |
|-------------|----------------|-----------------------------|
| **Days** | Find a delivery day quickly, understand who is assigned and its delivery/item workload, then drill into that day's board. | Past / Today / Future, date and driver search, status/exception chips, delivery and item counts, active timer, fast open. |
| **Total Deliveries** | Find any delivery across past, present, future, and unscheduled work; understand its complete state; perform safe full CRUD. | Server search across customer, phone, address, receipt/cart, SKU/item, notes, date/day, and status; filters; open one delivery; create/edit/reschedule/cancel/restore and item changes with audit. |

Working route families:

- **Desk:** `/pos/deliveries/desk/days`, `/pos/deliveries/desk/total`, and drill-down `/pos/deliveries/desk/days/:dayId`.
- **Field:** `/pos/deliveries/field/days`, `/pos/deliveries/field/total`, and drill-down `/pos/deliveries/field/days/:dayId`.
- `/pos/deliveries` becomes an entry redirect using the saved experience preference/device default. A visible **Desk / Field** switch is always available.

The route families deliberately render different page/component trees. They share query/service/domain code, not a single responsive page.

### Canonical Delivery Day

A planned day must exist before a run starts and remain readable after it ends. The product therefore needs a canonical **Delivery Day** record rather than treating an availability slot, a date string, and an optional run as three competing definitions of a day.

Working contract:

- One Delivery Day per store/location and calendar date for this initiative.
- Day owns date, delivery window, assigned driver/crew, notes, planning disposition, test-dataset marker, and its jobs.
- A Day may have no run yet. Starting Today creates/resumes the one open operational run and starts its visible timer.
- Existing completed run history remains attached and immutable; a second empty run cannot silently replace a completed day.
- Day display state is derived without duplicating run truth: planning disposition is **planned / cancelled / not run**; an attached canonical run supplies **active / completed**. A past planned day is not auto-completed.
- `DeliveryJob.day` becomes scheduling truth. Legacy availability/date fields remain compatibility inputs only during migration.
- Driver assignment uses users/roles where possible (lead/helper), with legacy free text preserved for migrated rows.

### Day Board modes

The Day Board has two materially different modes:

1. **Inactive review/correction**
   - Used for future days, past/completed days, and Today before the timer starts.
   - Today offers **Start Today**; declining leaves the board inactive.
   - Fast read plus permissioned corrections: notes, contact, append-only address correction, add/remove delivery, reschedule, add/remove delivery item, and resolve cancellation requests.
   - “Remove” is an audited cancel/unassign/reschedule action, not destructive erasure of sale or field evidence.
   - Completed-day evidence/history is read-only except an explicit manager correction with reason.
2. **Active field workflow**
   - Available only for Today after **Start Today** starts/resumes the run timer.
   - Uses ordered operational stages, mobile-first controls, server-enforced gates, and persistent progress.
   - Desktop may monitor and perform manager interventions, but it does not render the driver's wizard.

### Mobile Days landing

- Today's summary card is first and visually dominant: assigned crew, window, delivery/item counts, confirmation/load/complete progress, exceptions, and timer state.
- Tapping Today opens its Day Board immediately.
- Before start, the board asks **Start Today?**; **Not now** opens inactive review.
- Clear **Past days** and **Future days** actions open fast mobile lists. Manager-capable users may add a day without entering the desktop workspace.
- Opening a past/future day always starts in inactive review/correction mode.
- Mobile **Total Deliveries** remains available for a fast customer/phone/address/SKU lookup, but does not copy the desktop DataGrid.

### Active Today workflow

The field sequence is:

1. **Review and contact**
   - Review all deliveries/items before loading.
   - Work a compact confirmation queue: open native Text composer or Call, then record what actually happened.
   - Contact method and response are separate truths:
     - attempts: text composer opened, text marked sent, call placed;
     - disposition: awaiting reply, confirmed, reschedule requested, cancel requested, no answer/voicemail, wrong number, other.
   - Opening a composer does not falsely mark a text sent. After returning, the user explicitly marks **Sent** or leaves it pending.
   - Reschedule/cancel responses open the corresponding guided action; they do not remain ambiguous labels.
   - Drivers may begin loading **all day candidates** while replies are pending. This is required so a late-confirmed stop can join the route without returning to the store. Route start still requires every job to be confirmed, removed/rescheduled/cancelled, or explicitly left unconfirmed.
2. **Load each delivery item**
   - Present one delivery item/line at a time with customer/stop context.
   - Verify by QR/SKU scan or manual SKU entry. **Skip verification** is allowed but is explicit and audited.
   - Capture an in-truck photo for that item using the shared Receiving-grade media flow.
   - Quantities are accounted for; an item cannot be considered loaded only because its parent delivery was checked.
3. **Close truck**
   - After all remaining same-day candidate items are loaded, capture the final truck/closed-door evidence photo. Unconfirmed items stay accounted for on the truck and return/reconcile if the customer never confirms.
   - Server gate blocks departure while required load/evidence tasks are incomplete unless a manager override with reason is used.
4. **Optimize and review route**
   - Commit an optimized route for confirmed stops only.
   - For each unconfirmed stop, calculate a non-committing insertion preview: best before/after neighbors, incremental drive/service time, and provisional ETA.
   - If a customer later confirms, **Confirm and add to route** shows the proposed change, re-optimizes, commits a route revision, and updates ETAs.
5. **Drive, deliver, and return**
   - Current stop is dominant: Call, Text, Navigate, items, ETA, proof photo, basic signature, complete/issue.
   - Completion advances to the next stop and refreshes remaining ETAs from the current time/location basis available to the provider.
   - Held/failed items remain visible for return-to-store reconciliation; ending the day requires reconciliation or a manager force-finish reason.

### Persistent mobile chrome

- A compact safe-area bottom bar remains available without covering content.
- Contextual shortcuts: **Unconfirmed**, **Route**, **Navigate**, and **Top/Current stop**; hide/disable actions that do not apply.
- The active timer is always obvious in the sticky header and remains visible while bottom actions are used.
- The bar is not a second workflow: the stage's one primary CTA remains visually dominant.

### Mobile interaction rules

- One primary task/CTA at a time; current stop is visually dominant.
- Minimum 44–48px controls, sticky bottom action area, safe-area support, and no dense DataGrid/table.
- Call, text, maps, camera, signature, and issue actions are reachable without opening a deep desktop-style editor.
- Network loss must not discard captured media or entered evidence.
- Do not encourage interaction while the vehicle is moving; navigation hands off to the native maps app.

### Desktop interaction rules

- Optimize for comparison, scheduling, batch review, route planning, and historical evidence.
- **Days** is a fast operational index, not a calendar gimmick: date/status/driver search, high-signal counts, exceptions, timer/live state, and one-click drill-down.
- Desktop Day detail supports inactive planning/corrections, route simulation, live monitoring, and completed evidence/history without impersonating the mobile field wizard.
- **Total Deliveries** is the complete searchable CRUD surface. Changes to contact/address/day/items/status are audited; linked sale and completed evidence are never hard-deleted through routine UI.
- Show provider/fallback status, route legs, service-time assumption, ETA revision time, and exceptions.
- Completed days are reviewable and cannot accidentally become a new empty run.
- Destructive or bypass actions are explicit, permission-gated, reasoned, and audited.

### Test-data safety rules

- Test records carry a **durable dataset identity**. Cleanup must never infer test data from customer name, phone, notes, date, or an ID range alone.
- Every seeded name and visible label begins with **`[TEST]`**.
- Default numbers use reserved fictional **555-01xx** values. A real test phone number is accepted only through an explicit operator option and is never committed.
- Seed addresses are intentionally selected routable Omaha-area public/business addresses so route optimization is exercised without impersonating customers.
- Production seed/reset requires an explicit production flag and typed dataset confirmation.
- Reset is dataset-scoped, defaults to dry-run, reports exact counts/storage objects, and removes owned attachments from storage as well as database rows.
- Seeding the same dataset is idempotent or fails with a clear “already exists”; it never creates silent duplicates.
- Test data is excluded from ordinary operational counts by default and has an obvious Show test data control.
- Test mode never auto-sends a message or changes real inventory status.

---

## Finish line

The initiative is complete when:

1. Bill can deploy, seed a named dummy delivery day in production, test the full field workflow on iPhone/Android, reset only that dataset, and repeat without touching real records.
2. Desktop opens a purpose-built **Delivery Desk** and mobile opens a purpose-built **Delivery Field** experience; they are distinct component trees and task models, not responsive rearrangements.
3. Truck/proof/issue photos use the shared Receiving-grade capture, thumbnail, viewer, replace, and retry behavior.
4. Finger position and signature ink remain aligned on supported phones; save produces a compact PNG that reloads correctly as delivery evidence.
5. A configured routing provider returns the optimized stop order and per-leg travel durations; the UI shows provider status and never calls a fallback route “optimized.”
6. ETA for every stop is reproducible from departure time + travel legs + configurable service minutes (default 20).
7. A previously unconfirmed customer can be confirmed, inserted into the route, re-optimized, and given a revised ETA.
8. One tap opens the native iOS/Android text composer with the correct phone number and encoded ETA message; sending remains a human action.
9. Server-side transition guards, page/integration tests, and a real production smoke checklist cover the critical workflow.

---

## Phase 1 — Canonical Days, Total Deliveries CRUD, and production test loop

**Goal:** Establish one trustworthy delivery domain and ship the inactive planning/review foundation for the two-page product before replacing the active field workflow.

**Estimated size:** 3–6 engineering days in small migration/API/UI slices. This phase is intentionally substantial: it includes a production-safe data migration, two new page families, full CRUD/search, test tooling, and hardening. More than one production push is allowed because physical-phone iteration is part of acceptance.

**Scope boundary:** Phase 1 creates canonical Day/Item/Test Dataset records, safe full CRUD, fast Days/Total Deliveries pages, inactive Day Board modes, the production seed/reset loop, and known correctness fixes. It does **not** replace the active calls/load/drive wizard, finalize signature UX, or claim optimization/ETAs are production-proven. The existing board remains on a temporary compatibility route for regression/seeded QA; the new Field shell does not offer Start Today until Phase 2 is complete.

### 1A. Canonical data model and additive migration

Use a staged expand/backfill/constrain migration. `DeliveryAvailability` already is the planned-day record, so rename it **in Django state** to `DeliveryDay` while preserving its physical table, primary keys, and initial FK columns. This avoids copying production rows into a competing day table or making a physical table rename the rollback boundary.

- [ ] Rename `DeliveryAvailability` in place to **`DeliveryDay`** with compatibility `db_table`/`db_column` state:
  - add location + date identity (one non-archived Day per location/date after verification);
  - retain delivery window and legacy assignment text;
  - planning disposition (`planned`, `cancelled`, `not_run`) plus bookable/archive fields;
  - notes/timestamps and optional test dataset;
  - derive active/completed from the canonical run;
  - derive delivery/item/progress totals rather than storing mutable counter truth.
- [ ] Add **`DeliveryDayAssignment`** with day, user, role (`lead` / `helper`), and display order. Preserve unmappable `assigned_to` legacy text visibly instead of guessing users.
- [ ] Rename `DeliveryJob.availability` to `day` in state while retaining the physical `availability_id` column initially. Keep `scheduled_date` as a synchronized read-only mirror for one compatibility release.
- [ ] Attach every `DeliveryRun` to its Day. Preserve duplicate/legacy completed runs as explicitly superseded history; enforce one canonical non-superseded run per Day only after conflict verification.
- [ ] Snapshot operational customer/address/item facts onto run stops or append-only revisions so later office corrections do not rewrite what the crew actually saw/delivered on a completed run.
- [ ] Add **`DeliveryJobItem`** as delivery-content truth:
  - optional source CartLine and inventory Item;
  - description/SKU/quantity snapshots;
  - sort order and active/removed state;
  - created/removed actor, time, and reason.
- [ ] Backfill Job Items from structured cart-line metadata first; text-only contents become explicitly non-scannable snapshots.
- [ ] Add **`DeliveryRunStopItem`** immutable execution snapshots and quantity-aware **`DeliveryItemScan`** records with actor/time and client UUID idempotency. Repeated SKU scans may satisfy quantity >1; one JSON/SKU flag may not.
- [ ] Allow delivery attachments to target a Stop Item so in-truck photos are distinguishable from final truck-door, delivery-proof, and issue photos.
- [ ] Add append-only **`DeliveryChangeEvent`** records that work before a run exists. Day/job/item create, edit, assign, reschedule, cancel/remove, restore, and override actions record actor, reason, and before/after payload.
- [ ] Add **`DeliveryTestDataset`** with stable identity, generation/scenario version, target date, status, creator, reset status/timestamps, and summary. Days and unscheduled Jobs link to it.
- [ ] Add a **`DeliveryTestArtifact`** ledger for any synthetic Cart/Receipt/CartLine rows and exact storage keys. Keep the dataset tombstone after reset so cleanup is auditable/retryable.
- [ ] Prepare Phase 2 contact truth:
  - generalize the call-only attempt concept for text/call attempts;
  - keep attempt channel/action separate from customer disposition;
  - never migrate `text_sent` into customer confirmation.
- [ ] Add a verification report for orphan jobs, duplicate date/location Days, duplicate open runs, count mismatches, unresolved item text, and legacy assignment strings.

**Migration rules:**

- Existing production jobs/runs remain addressable throughout deployment.
- Duplicate Day dates/runs are preflight conflicts. Never silently choose between evidence-bearing rows; resolve or mark superseded before uniqueness constraints.
- Sale/cart records and completed evidence are never deleted during backfill.
- New APIs may expose compatibility fields; new UI writes only canonical Day/Job Item data.

### 1B. Day and Total Deliveries API/services

- [ ] Add server-paginated `/api/pos/delivery-days/` list/detail endpoints.
- [ ] Days filters: past/today/future/all, date range, lifecycle, assigned user, exceptions, search, test-data inclusion, ordering, page/page size.
- [ ] Day list summary returns date/window, assignments, lifecycle/run status, elapsed timer, delivery/item totals, confirmation/load/completion progress, and exception flags in bounded queries.
- [ ] Day detail returns Jobs/Items plus optional current/completed run summary; full events/media are lazy detail data.
- [ ] Add canonical paginated `/api/pos/deliveries/` and search across customer, phone, current/original address, receipt/cart, SKU/item, notes, date/Day/driver, and status.
- [ ] Full CRUD contract:
  - create scheduled or unscheduled;
  - edit contact/notes and append-only address correction;
  - assign/reschedule to a Day;
  - add/edit/remove Job Items;
  - cancel/restore with reason;
  - read history/evidence.
- [ ] Routine delete means audited soft cancel/archive. Hard deletion is limited to test-dataset cleanup or exceptional owner-only maintenance with dependency checks.
- [ ] Add Day actions for crew assignment, add/remove Job, Start/Resume Today, cancel/mark not run, and manager correction.
- [ ] Put mutations in transactional services with server-side state/permission checks.
- [ ] Start safeguards use the store/location timezone and enforce Today-only, nonempty Day, one open run, and completed-Day immutability.
- [ ] Keep `/delivery-availabilities/`, `/delivery-jobs/`, date-based run calls, terminal booking, and current Day Board working through deprecated compatibility adapters for one release.

### 1C. Named dummy-data lifecycle

- [ ] Add `seed_delivery_test_dataset --key ...` with chosen date/date-offset and optional uncommitted real test-phone argument.
- [ ] Add `show_delivery_test_dataset --key ...`: Days, Jobs/Items, runs/stops, contact state, media, and storage keys.
- [ ] Add `reset_delivery_test_dataset --key ...`; dry-run by default, explicit execute/production flags, and typed confirmation containing the exact key.
- [ ] Reset only durable dataset relationships—never `[TEST]`, phone, notes, date, or ID range.
- [ ] Remove exact ledger-owned storage objects and attachment/S3 rows deliberately; missing objects are idempotent success. Storage failure marks `reset_failed`, preserves the dataset tombstone/ledger, and supports retry.
- [ ] Make reseed/reset idempotent and transactional where possible; provide actionable output on partial storage cleanup.
- [ ] Exclude test data from normal counts/lists by default; add an explicit test-data filter/badge for QA.
- [ ] Seed a compact but complete scenario pack:
  - Today planned/not started, past completed, future planned, and unscheduled;
  - confirmed, awaiting, no-answer, reschedule, cancel, and wrong-number states;
  - apartment + unit;
  - multi-item sale-linked stop with quantity >1 and scannable SKU;
  - non-scannable manual item;
  - address correction;
  - reschedule/cancel/remove-item corrections;
  - issue/return/reconcile;
  - truck/proof/signature media slots.
- [ ] Document the exact deploy → seed → phone test → inspect → reset loop in the initiative/session notes or existing operations docs; do not create a parallel docs tree.

### 1D. Two-page inactive UX

**Desktop / Delivery Desk**

- [ ] Build **Days** as the default delivery destination: compact Past/Today/Future filters, date/driver/lifecycle/exception search, high-signal counts/progress/timer, one-click Day drill-down.
- [ ] Build **Total Deliveries** as a server-paginated URL-backed search/CRUD workspace with focused delivery detail/edit.
- [ ] Build inactive desktop Day detail for planning/corrections, route-summary placeholder, live-monitor summary, and completed evidence/history.

**Mobile / Delivery Field foundation**

- [ ] Build separate mobile Days landing: Today summary card first, then Past days, Future days, and manager Add day.
- [ ] Build compact Past/Future find/read/open lists.
- [ ] Build mobile Total Deliveries as search-first cards/detail, not a compressed DataGrid.
- [ ] Build inactive mobile Day Board review/correction.
- [ ] Today before start explains that the Day is planned but not running; past/future/completed never expose execution controls.
- [ ] Implement explicit Desk/Field routes and saved switch; viewport chooses only the initial default.
- [ ] Redirect legacy `/pos/deliveries` bookmarks safely.
- [ ] Do not expose a half-built Start flow in the new Field shell. Keep the existing active board on a clearly temporary compatibility route for regression/dataset smoke until Phase 2 replaces it.

### 1E. Correctness hardening

- [ ] Remove successfully uploaded media from the outbox immediately; keep idempotent retry by `client_photo_id`; test online, offline, reconnect, refresh, and duplicate retry.
- [ ] Preserve structured cart-line linkage for board-created past-sale deliveries so item rows, quantities, SKUs, and scan verification resolve.
- [ ] Make resolved item quantity authoritative on the pre-run board, date rail, availability counts, and terminal slot counts.
- [ ] Enforce run/stop phase transitions server-side, not only through hidden UI controls.
- [ ] Prevent ordinary “Done” from bypassing required proof/signature; define a manager override with reason/audit for legitimate legacy/manual completion.
- [ ] Make completed runs stable and review-only; starting a duplicate empty run for a completed date is blocked.
- [ ] Normalize delivery boolean request parsing so non-empty string `"false"` is not treated as true.
- [ ] Add focused regression tests for every item above.

### 1F. Implementation sequence and likely file areas

Deliver in independently testable slices that leave the existing production path usable:

1. **Production preflight** — report duplicate dates/runs, date/FK mismatches, orphan scheduled Jobs, ambiguous drivers, malformed source-line IDs, item-count differences, and attachment ownership. Unresolved evidence conflicts block constraints.
2. **`0020_delivery_day_expand`** — state-level in-place Day/Job FK rename while preserving physical table/columns; add nullable assignment/archive/dataset/item/snapshot/scan/audit/supersession fields. No uniqueness constraints yet.
3. **`0021_delivery_backfill`** — map Jobs/Runs to Days; create incomplete non-bookable Days for orphan dates; validate source lines before item backfill; create explicit non-scannable fallbacks; snapshot stop items and valid legacy scans.
4. **Dual-read/write deploy + verification** — canonical services/APIs, compatibility adapters, old/new count and evidence comparison.
5. **`0022_delivery_constraints`** — only after zero unresolved preflight errors: partial unique indexes for active Day identity, canonical run/Day, active item positions, active address revision, and non-null `(run, client_photo_id)`; positive quantity/state guards.
6. **Test dataset commands** — seed/show/reset, exact artifact/storage cleanup, production guards, default exclusion.
7. **Desktop inactive pages** — Days, Total Deliveries, Day detail.
8. **Mobile inactive pages** — Today/Past/Future, mobile Total Deliveries, inactive board, experience switch.
9. **Hardening/release smoke** — known defects, page tests, production seed/reset, physical-phone inactive-flow test.

Likely files:

- Backend: `apps/pos/models.py`, new POS migrations, serializers/views/URLs, delivery services, new `apps/pos/management/commands/`, and POS tests.
- Shared frontend domain: `types/pos.types.ts`, `api/pos.api.ts`, `hooks/usePOS.ts`.
- New Desk and Field page/component directories. Do not continue growing the existing 1,000+ line `DeliveriesPage.tsx`.
- App routing/navigation and existing project docs at ship time.

### Phase 1 gate

- [ ] Existing Day IDs, Jobs, Runs, Stops, evidence, and events survive the in-place migration; every scheduled Job maps to a Day and resolvable item maps to a Job Item; leftovers are explained.
- [ ] Unresolved duplicate/evidence conflicts block the constraint migration rather than being silently merged.
- [ ] Quantity-two items require two idempotent scans; removed/corrected items remain visible in historical stop snapshots.
- [ ] Days Past/Today/Future and driver search return correct bounded summaries.
- [ ] Total Deliveries finds name, formatted/unformatted phone, address, receipt, SKU, item text, notes, date, and status.
- [ ] CRUD/item/reschedule/cancel/restore changes are permissioned and audited.
- [ ] Completed/wrong-phase mutations are rejected server-side; proof/completion overrides are manager-only and require a reason.
- [ ] Desktop and mobile inactive boards show the same canonical data through different components.
- [ ] New inactive routes cannot start a run in Phase 1; the legacy compatibility route may start Today for seeded regression QA, and past/future cannot start accidentally.
- [ ] Test data is hidden by default and loud when included.
- [ ] One dataset can seed → inspect → reset → reseed → reset in production without real-row or media leakage.
- [ ] Existing terminal booking and active board remain functional through compatibility cutover.
- [ ] Focused backend tests, frontend page/integration tests, and a physical-phone smoke pass are green.

---

## Phase 2 — Active mobile Field workflow and desktop live operations

**Goal:** Replace the current shared active board with the ordered contact/load/field workflow while the Desk remains a planning, monitoring, correction, and review experience.

**Estimated size:** 2–4 engineering days plus repeated owner review on a physical phone.

### 2A. Contact and disposition

- [x] Mobile review-all stage with compact per-delivery contact queue.
- [x] Native initial-confirmation Text and Call actions.
- [x] Truthful attempt tracking: composer opened vs text marked sent vs call placed.
- [x] Standard disposition: awaiting reply, confirmed, reschedule requested, cancel requested, no answer/voicemail, wrong number, other.
- [x] Guided reschedule/cancel actions and a persistent unconfirmed pool.
- [x] Allow loading all same-day candidates while replies are pending so a late confirmation can join the route without returning to the store; route/departure gates still require every job to be resolved or explicitly unconfirmed.
- [x] Server transitions use contact disposition, not merely “some call attempt exists.”

### 2B. Item-by-item load and shared photos

- [x] Load queue is Job Item based, with customer/stop context and quantities.
- [x] Verify by QR/SKU scan or manual entry; explicit audited **Skip verification**.
- [x] Reuse Receiving-grade camera/upload/thumbnail/view/replace behavior for each in-truck item photo.
- [x] Item load/verification/photo progress rolls up to delivery and Day.
- [x] Final truck/closed-door photo after every remaining same-day candidate item is loaded.
- [x] Departure blocks on required load/evidence unless a manager provides an audited override reason.
- [x] Offline queue/reconnect/refresh cannot duplicate uploads or strand successful media as pending.

### 2C. Active Field shell

- [x] Replace the compatibility handoff with a separate mobile component tree.
- [x] Obvious timer in sticky header from Start Today through End Day.
- [x] One stage-primary CTA plus compact safe-area bottom shortcuts: **Unconfirmed**, **Route**, **Navigate**, **Current/Top**.
- [x] Current/next stop remains dominant during drive/deliver/issue/return.
- [x] Resume exact server stage after refresh, login renewal, slow network, or offline media capture.
- [x] Guard unsaved evidence and prevent accidental experience switching from losing work.

### 2D. Desktop live operations and review

- [x] Desk Day detail shows timer/stage, confirmations, load progress, current/next stop, route revision, exceptions, and pending media.
- [x] Manager intervention is explicit/audited; desktop never renders the driver's wizard.
- [x] Completed review combines Jobs/Items, contact attempts/dispositions, media, signature state, route revisions, overrides, and return issues.

### 2E. UX verification

- [x] Page/integration tests cover contact disposition, item load, photo gates, timer resume, bottom shortcuts, and Desk monitoring.
- [ ] Test representative iPhone/Android viewports, touch, keyboard, safe-area, offline/reconnect, and refresh. *(owner physical-phone pass)*
- [ ] Run the named production scenario on a physical phone and collect owner notes before Phase 3. *(owner physical-phone pass)*

### Phase 2 gate

- A seeded Today can be contacted and loaded item-by-item on a phone, including item photos and final truck photo.
- Unconfirmed/reschedule/cancel work remains visible and truthful.
- Timer/progress survive refresh and match the desktop monitor.
- Owner confirms Field is operationally distinct from Desk and no field task requires desktop UI.
- **Automated gate (2026-07-22):** backend Phase 2 + delivery_run suites green; Field/Desk unit tests green. **Physical-phone passes 1–2 remain owner QA** before treating the Phase 2 gate as fully closed.

---

## Phase 3 — Verified routing/ETAs, delivery proof/signature, and customer updates

**Goal:** Finish the phone-critical capabilities and prove the route/ETA/customer-contact loop end to end.

**Estimated size:** 2–4 engineering days plus at least two production phone iterations.

### 3A. Delivery evidence photo completion

- [ ] Extract/reuse the stable Receiving photo primitives and media contracts where domain-neutral.
- [ ] Support camera/library capture, compact upload variants, thumbnail display, full viewer, replace, and allowed delete with audit.
- [ ] Apply to delivery proof and issue photos; align Phase 2 item/truck photos with the same contract.
- [ ] Make replace semantics explicit: old evidence remains auditable where policy requires; the current attachment is obvious.
- [ ] Resolve pending/outbox state consistently across reload and devices.

### 3B. Basic signature pad

- [ ] Build a plain signature pad only—no document background or simulated paper.
- [ ] Map pointer/touch coordinates from the rendered canvas rectangle into canvas coordinates; handle device pixel ratio correctly.
- [ ] Lock canvas geometry once ink exists or preserve strokes through a resize; never stretch/offset existing ink.
- [ ] Prevent page scrolling while drawing without breaking ordinary page navigation.
- [ ] Provide Clear, Cancel, and Save signature with obvious states.
- [ ] Save a small bounded-dimension **PNG** with predictable white/transparent background and no unnecessary metadata.
- [ ] Reload and display the saved PNG in evidence/history.
- [ ] Test pointer alignment, orientation change, high-DPI screens, scroll position, and repeated clear/save on iPhone and Android.
- [ ] Keep document overlay/compositing as a future extension, not a Phase 3 requirement.

### 3C. Real optimization and ETA engine

- [ ] Audit the existing Google integration and choose/configure the production API that returns optimized waypoint order plus leg durations/distances.
- [ ] Expose provider result explicitly: `optimized`, `provider`, `fallback_reason`, route revision, and calculation timestamp.
- [ ] Never present list-order/Maps-URL fallback as successful optimization or provider-backed ETA.
- [ ] Add a manager-editable delivery service duration setting, default **20 minutes per stop**.
- [ ] Commit the route for confirmed stops only.
- [ ] Compute and persist/display:
  - departure → A drive time;
  - A arrival ETA;
  - A service duration/departure;
  - A → B drive time;
  - B arrival ETA;
  - repeat through last stop and optional return-to-store estimate.
- [ ] For every unconfirmed candidate, calculate a non-committing insertion preview: best **before/after** neighbors, added drive/service time, and provisional ETA.
- [ ] **Confirm and add to route** shows the proposed delta before committing a new optimized route revision.
- [ ] Route mutations submit the base revision and reject/reload stale Desk/Field updates rather than overwriting another crew device.
- [ ] Recalculate from the relevant current point/time after completion, delay, address correction, hold/removal, or newly confirmed stop.
- [ ] Preserve route revisions/events so office staff can explain why an ETA changed.
- [ ] Add provider-mocked order/arithmetic tests, request-count/cache controls for candidate simulations, and a controlled real-provider production smoke test.

### 3D. No-answer recovery and customer messaging

- [ ] Keep unconfirmed/no-answer jobs visible but excluded from the active optimized route.
- [ ] When contact is made, provide one explicit **Confirm and add to route** action.
- [ ] Re-optimize/recalculate after insertion and show the driver what changed before continuing.
- [ ] Provide templates using current persisted ETA, including:
  - initial/day-of confirmation;
  - on my way;
  - revised ETA;
  - delayed/no-answer follow-up.
- [ ] Build iOS- and Android-compatible `sms:` composer links with encoded phone/body and platform-specific query handling where required.
- [ ] Validate phone normalization without silently replacing unusual valid numbers.
- [ ] Keep send state truthful: composer opened and user-marked Sent are separate; neither is carrier delivery proof.
- [ ] Test message punctuation, spaces, line breaks, phone formats, and composer opening on physical iPhone and Android devices.

### 3E. Drive, deliver, and return completion

- [ ] Current stop has Call, Text, Navigate, items, ETA, proof, signature, Complete, Hold, and Report issue.
- [ ] Completing/holding a stop advances the next stop and refreshes remaining ETAs.
- [ ] Failed/undelivered items remain in the return queue with unload/put-back/reconcile evidence.
- [ ] End Day requires reconciliation or reasoned manager force-finish.
- [ ] Completed Days are immutable review by default; corrections append history.

### Phase 3 gate

- Photos can be captured, viewed, replaced, retried, and reviewed on a real phone.
- Signature ink tracks the finger and reloads as a compact PNG.
- A production smoke route proves provider optimization, leg durations, service-time math, candidate insertion previews, and ETAs.
- A no-answer stop can later join the route and produce revised ETAs.
- Native text composer opens correctly with recipient and ETA body on both target phone platforms.
- Full seeded happy-path and failure/return flows finish and reset cleanly.

---

## Initiative-wide acceptance

- [ ] Production test-data seed/status/reset workflow is safe and repeatable.
- [ ] Test data is unmistakable, dataset-scoped, excluded by default, and storage-clean.
- [ ] Delivery Desk and Delivery Field are separate applications over shared domain logic.
- [ ] Server state guards match the actions presented by both applications.
- [ ] Item linkage and all quantity displays agree.
- [ ] Media outbox cannot strand already-uploaded evidence.
- [ ] Receiving-grade photo capture/view/replace is shared rather than copied.
- [ ] Signature is finger-aligned, compact PNG, and physically tested.
- [ ] Provider-backed optimization and ETA math are observable and tested.
- [ ] Dynamic confirmation/re-routing updates route order and ETAs.
- [ ] iPhone and Android native SMS composer handoff works; user remains responsible for Send.
- [ ] Critical page/integration tests and production smoke checklist are green.
- [ ] Changelog, POS/frontend context, navigation docs, and release version are updated when behavior ships.

---

## Explicitly out of scope

- Automatic/server-sent SMS, delivery-message receipts, or a Twilio-style messaging inbox.
- Background GPS tracking, driver surveillance, payroll time, or turn-by-turn navigation inside the dashboard.
- Customer-facing live map/tracking portal.
- Signature embedded into a document/PDF. The saved PNG may support that later.
- Inventory status mutation during failed delivery return; current reconciliation remains operational/audited only unless separately approved.
- Rebuilding POS checkout/delivery-fee policy.
- Native iOS/Android apps; this remains the deployed web application with native URI handoffs.

---

## Owner gates for implementation planning

Defaults below keep work moving but should be confirmed at the relevant phase:

1. **Top-level destinations (locked):** **Days** and **Total Deliveries**. Day Board is a Days drill-down, not another nav destination.
2. **Experience names:** use **Delivery Desk** and **Delivery Field** as working names unless owner renames them during visual review.
3. **Production QA phone:** fictional 555 numbers by default; a real recipient number only through an uncommitted command option.
4. **Service duration:** 20 minutes globally by default; future per-stop override may be added only if field testing shows it is needed.
5. **Re-optimization:** show the changed route/ETAs before committing when a newly confirmed stop is inserted during an active run.
6. **Message copy:** owner approves final customer-facing templates during Phase 3 phone QA.

---

## Sessions

### Session 1
- **Goal:** Capture the completion contract for safe production phone testing, separate desktop/mobile delivery experiences, field evidence, routing/ETAs, and native texting.
- **Finish line:** One active initiative with three large implementation phases, explicit gates, and the known v2.52 hardening gaps included.
- **Scope:** Planning/docs only; no delivery code, migrations, seed commands, or release changes.
- **est** 1h
- **Started:** 2026-07-22T12:21:00-05:00
- **Result:** Initiative created; implementation has not started. Await owner direction for next-step planning.

### Session 2
- **Goal:** Lock the two-page information architecture and turn Phase 1 into an implementation-ready foundation plan.
- **Finish line:** Days/Total Deliveries, inactive/active Day Board modes, today's ordered workflow, desktop responsibilities, canonical data migration, safe production test loop, and Phase 1 sequence/acceptance are explicit.
- **Scope:** Initiative planning only; no application code, migrations, commands, release, or deploy.
- **est** 1h
- **Started:** 2026-07-22T12:40:00-05:00
- **Result:** Initiative updated and Phase 1 planned; implementation has not started.

### Session 3
- **Goal:** Implement Phase 1 — canonical Days/items/audit/datasets, Days + Deliveries APIs, Desk/Field inactive shells, dummy-data loop, and correctness hardening.
- **Finish line:** Migrations `0020`–`0022`, `/delivery-days/` + `/deliveries/`, seed/show/reset commands, Desk/Field routes with legacy board retained, hardening + regression green.
- **Scope:** Backend domain/API/commands, frontend Desk/Field inactive UX, docs/changelog; not Phase 2 active Field wizard or Phase 3 routing/signature/SMS.
- **est** 1d
- **Started:** 2026-07-22T15:40:00-05:00
- **Result:** Phase 1 implemented locally. Backend delivery suite 69 tests OK; seed→show→reset smoke OK. Active Start Today remains on `/pos/deliveries/legacy` until Phase 2. Ready for production migrate + phone QA with `seed_delivery_test_dataset`.

### Session 4
- **Goal:** Implement Phase 2 — contact truth, item execution, workflow gates, day-scoped run/monitor API, Field full-day shell/stages, Desk live monitor, active-run seed, cutover.
- **Finish line:** Migration `0023`, disposition/attempt/item/truck APIs, Field Start Today path, Desk monitor, tests + docs as **v2.56.0**; legacy board deprecated one release.
- **Scope:** Backend Phase 2 services/APIs/tests, Field/Desk frontend, seed `--with-active-run`, changelog/version/nav docs; not Phase 3 provider-proven ETAs/signature rebuild/SMS polish.
- **est** 2–4d
- **Started:** 2026-07-22T16:08:00-05:00
- **Result:** Phase 2 implemented locally. Backend Phase 2 + delivery_run tests green; Field/Desk unit tests green. Physical-phone passes 1–2 remain for owner. Seed: `seed_delivery_test_dataset --key phase2 --with-active-run --stage load`.

---

## See also

- [`pos_discount_and_delivery`](./_archived/_completed/pos_discount_and_delivery.md)
- [`../extended/pos-system.md`](../extended/pos-system.md)
- [`../extended/frontend.md`](../extended/frontend.md)
- [`../extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) — Receiving media behavior
- [`../../docs/app_navigation_and_pages.md`](../../docs/app_navigation_and_pages.md)
- [`../protocols/code.0.Startup.md`](../protocols/code.0.Startup.md)
