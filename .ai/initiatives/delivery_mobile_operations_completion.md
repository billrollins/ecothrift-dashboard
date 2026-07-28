<!-- initiative: slug=delivery_mobile_operations_completion status=active updated=2026-07-28 -->
<!-- Last updated: 2026-07-28 (Phase 5B function-first Desk add/adjust done) -->
# Initiative: Delivery Mobile Operations Completion

**Status:** Active — **Phases 1–4 shipped (v2.55–v2.58); Phase 5B function-first done in working tree.** Desk can create from past sale and adjust/cancel with run sync; shared Delivery theme module landed. **Next:** polish/tests at push; optional deeper Desk visual pass. Owner-only hardware smoke can still catch Field leftovers.

**Purpose:** Two deliberate products over one delivery domain:

1. **Delivery Desk** (desktop) — planning, monitoring, corrections, evidence review.
2. **Delivery Field** (mobile) — one-handed driver/crew workflow on a phone.

**Predecessor:** [`pos_discount_and_delivery`](./_archived/_completed/pos_discount_and_delivery.md) (v2.50–v2.52). This initiative completed/hardened that domain into Desk + Field.

**Working version:** `v2.58.0` in [`.version`](../../.version); Phase 5B add/adjust is staged under `## [Unreleased]` in [`CHANGELOG.md`](../../CHANGELOG.md) and ships at the next push per `review.0.Bump` Part 2E.

---

## Current state (2026-07-28, v2.59.0)

### Shipped and in code

| Area | What exists |
|---|---|
| **Split apps** | Desk `/pos/deliveries/desk/*` and Field `/pos/deliveries/field/*`; `/pos/deliveries` experience redirect; **legacy board retired** (`/pos/deliveries/legacy` → redirect only). |
| **Canonical domain** | Delivery Day / Job / JobItem / Run / Stop / StopItem / scans / attachments / change events / test datasets (migrations through `0024_delivery_run_truck_reopened`). |
| **Field shell** | [`EcoFieldRunShell.tsx`](../../frontend/src/pages/pos/deliveries/field/EcoFieldRunShell.tsx) — immersive phone frame, sticky timer, step rail **Contact → Load → Routes → Deliveries → Finish**, server-gated unlock, refresh resumes server phase. |
| **Contact** | Card pager + dots; Call/Text handoff; attempt vs disposition truth; continue → Load. |
| **Load + seal** | Item scan (`@zxing`), skip/heal, load photos, unload; **camera-first Seal/Reseal** (button opens camera when seal-window photo missing); **reopen truck** breaks seal (`truck_reopened_at`); header hint `· truck open — reseal to continue`; secondary truck photo counter not gated by `onTruck.length === 0`. |
| **Routes** | Google **Routes API** (`computeRoutes` / `computeRouteMatrix`); traffic-aware ETAs; configurable unload minutes (`delivery_service_minutes_per_stop`, default 20); honest `provider` / `fallback_reason`; Optimize always available; **@dnd-kit** reorder + drag on↔off route; one-touch on/off arrows; Undo snackbar after reorder; compact one-line expandable header; footer icon row (Optimize / Maps / Add N); collapsible Off-route section; begin-route gate. |
| **Deliveries** | Arrive → Navigate/Call/Text ETA → **EvidenceButtons** (thumb in button, tap thumb → viewer, rest of button retakes; upload spinner) → **Hold to complete** (~900ms fill, aborts if pointer moves >10px so pager swipe still wins) → Problem sheet. **No “Items handed to customer” tap** — backend stamps `delivered_at` on `complete_stop`. |
| **Finish** | Return-to-store, exception reconcile, unload reminder for off-route loaded items, manager force-finish, day-complete summary. |
| **Evidence / SMS** | SignaturePad (DPR-aware PNG); IndexedDB outbox; upload busy bar (kind label + indeterminate progress); platform-aware `sms:` composer + templates. |
| **Desk monitor** | [`DeskDayLiveMonitor.tsx`](../../frontend/src/pages/pos/deliveries/desk/DeskDayLiveMonitor.tsx) — timer/stage, contact/load/truck, current/next, route/ETA panel, pending media, exceptions, manager Optimize. Not the driver wizard. |
| **Test data** | `seed` / `show` / `reset_delivery_test_dataset`; scenario **v6** = 5 Today zig-zag Omaha stops, **1 item each**, intentionally suboptimal order for Optimize demos; `--with-active-run --stage …`. Local phone loop: [`scripts/dev/start_mobile_dashboard.bat`](../../scripts/dev/start_mobile_dashboard.bat). |

### Recent polish (post-CHANGELOG v2.57.0 line — still local)

These landed after the published Phase 3 notes and must be captured in the next release notes:

1. **Camera-first reseal** — Seal/Reseal always interactive; missing seal-window photo opens camera; seal-after-photo chain; reopen → reseal header hint; load photo counter independent of empty truck list.
2. **Routes membership decoupled from contact** — confirmed stops can be dragged/toggled off-route (`excluded_unconfirmed_at`); off-route stops can be re-added; serialize `off_route` / `off_route_reason`.
3. **Routes API hard fixes** — omit past `departureTime` (INVALID_ARGUMENT); conditional `optimizedIntermediateWaypointIndex` field mask; richer Google error logging.
4. **Compact Routes UI** — one-line expandable ETA strip; footer icon row; Undo instead of “Restore optimized order”; compact row density; sticky On/Off headers; Off-route collapses when >3.
5. **Deliveries completion redesign** — removed slide-to-complete (fought `FieldDeliveryPager` capture-phase horizontal swipe); added [`FieldHoldToComplete.tsx`](../../frontend/src/pages/pos/deliveries/field/components/FieldHoldToComplete.tsx); removed “Items handed to customer”; proof/signature/issue thumbnails live inside their buttons.
6. **Zig-zag seed** — `SCENARIO_VERSION = 6`, five Omaha addresses north/south zigzag, one item per stop.

### Explicitly still open (2026-07-28, after v2.59.0)

| Gap | Notes |
|---|---|
| **Owner-only hardware pass** | Real rear-camera quirks, GPS drift, and the actual iOS/Android Messages handoff still need one owner pass on a phone. Every code-level path is audited and fixed (safe-area, tap swallow, hold fail-safe, scanner resume, SMS iPadOS, empty-phone guards); nothing here is a code gap. |
| **Owner visual sign-off** | Field composition vs [`eco-field-demo.html`](../reference/eco-field-demo.html) at phone width is an acceptance judgment, not an implementation item. |

Everything else previously listed here shipped in **v2.59.0**: production add/adjust (including manager item add/remove), Desk day create/edit, the real Static Map route surface (decorative `MiniMap` deleted), Desk page tests, byte-level upload progress, the change-history timeline, and all five deferred 4C shell fixes.

---

## Owner intent (locked)

1. Local/DEBUG phone iteration with unmistakably fake `[TEST]` datasets. **Production carries no test data** (seed stays `DEBUG`-only).
2. Mobile and desktop are different products, not one responsive page. They share one design language and domain layer, but not page shells or task models (see owner intent 9).
3. Delivery media is first-class (Receiving-grade capture/view/replace/outbox).
4. Signature is a plain finger pad → compact PNG (no document compositing).
5. Optimization/ETAs are real and explainable; fallback is never labeled “optimized.”
6. Route is dynamic: off-route pool, late confirm / drag-on, re-optimize, revised ETAs.
7. Customer texting is human-controlled via native Messages composer.
8. Unload/service time default **20 minutes/stop**, editable in Assumptions (`delivery_service_minutes_per_stop`).
9. **Added 2026-07-27:** mobile is the design source of truth. Once Field is accepted, desktop adopts the same visual language through a universal token/primitive layer rather than keeping its own look.

---

## Product contract (stable)

### Routes and experiences

| Experience | Routes |
|---|---|
| Desk | `/pos/deliveries/desk/days`, `/total`, `/days/:dayId` |
| Field | `/pos/deliveries/field/days`, `/total`, `/days/:dayId` (+ immersive run shell on Today start/resume) |
| Entry | `/pos/deliveries` → saved experience / device default; Desk↔Field switch always available |

### Field five-step rail (accepted)

| UI step | Server phase | Interaction |
|---|---|---|
| Contact | `calls` | Card pager + dots |
| Load | `load` + truck close/reseal | Card pager + dots; seal CTA at end |
| Routes | `route` | Ordered list + on/off zones (not pager) |
| Deliveries | `active` | Card pager + dots; hold-to-complete |
| Finish | `return` + completed | Exceptions → day summary / End day |

**Pager rules:** one card; dots from server tone; swipe one card; selection by stop ID across poll. Horizontal swipe owns the card — irreversible complete uses **hold**, not slide.

**Completion gates (Field):** arrived (`contact_present`) + proof photo + signature → Hold to complete. `delivered_at` is stamped by `complete_stop` (legacy Desk checkbox `/delivered/` still exists).

### Test-data safety (unchanged)

- Durable dataset identity; never infer from name/phone/date alone.
- Every seeded name starts with `[TEST]`; phones `555-01xx` by default.
- Routable Omaha public/business addresses; scenario v6 zig-zag for Optimize demos.
- Reset dry-run by default; production flags + typed key; storage ledger cleanup.
- Test data excluded from ordinary counts; Show test data control.

---

## Finish line

The initiative is complete when:

1. Bill can seed a named dummy day **locally** (`DEBUG`), run the full Field workflow on iPhone/Android via `start_mobile_dashboard.bat`, reset only that dataset, and repeat. Production never carries test data.
2. In production, managers can create a delivery from a past invoice/sale and adjust any existing delivery (contact, address, schedule, items, cancel) from Desk — without relying on QA seeds.
3. Desk and Field read as one product built from one design system, with different layouts for a keyboard workspace versus a one-handed phone. They share tokens and primitives, not page shells or the driver wizard.
4. Truck/proof/issue/signature media use Receiving-grade capture, thumb-in-button, viewer, replace, outbox retry.
5. Finger and signature ink stay aligned on supported phones; PNG reloads as evidence.
6. Configured Routes API returns optimized order + leg durations; UI shows provider status honestly.
7. ETA = departure + travel legs + configurable service minutes (default 20), per-stop and totals.
8. Stops can leave and re-enter the route (drag/toggle/late confirm); re-optimize updates order + ETAs + Maps URL.
9. One tap opens native SMS with number + encoded template; human Send.
10. Server guards, focused tests, and a real phone smoke checklist cover the critical path.
11. Desk Day detail is purpose-built for planning, monitoring, and review on the shared design system, not a leftover jobs table.
12. A token or density change lands in one shared module and takes effect in both Field and Desk.

---

## Phase status

### Phase 1 — Canonical Days, Total Deliveries, test loop — **SHIPPED (v2.55)**

Canonical Day/JobItem/scan/audit/test-dataset model; Days + Deliveries APIs; Desk/Field inactive shells; seed/show/reset; hardening (outbox clear-on-success, phase guards, proof override rules). Historical unchecked migration checklists are obsolete — treat migrations `0020`–`0022` (+ later Phase 2/3 migrations) as done in tree.

### Phase 2 — Active Field workflow + Desk monitor — **SHIPPED (v2.56)**

Contact dispositions, item load/scan/photos, truck close gates, EcoField shell cutover, Desk live monitor, active-run seed stages. Legacy board deprecated then removed in Phase 3.

### Phase 3 — Routes API, ETAs, evidence, SMS, completion — **SHIPPED (v2.57)**

- Routes API optimize + matrix insert preview; service-minutes setting; hold/release ETA refresh; revision 409.
- Signature PNG + outbox; SMS templates/platform composers.
- Field Routes/Deliveries/Finish polish; Desk route panel; legacy route retired.
- **Owner physical-phone passes still open** (signature, SMS, live Routes smoke).

### Phase 3.1 — Field polish (local, post-v2.57 notes) — **DONE in working tree**

| Item | Status |
|---|---|
| Camera-first seal/reseal + reopen seal window | Done |
| Photo upload busy bar | Done (indeterminate) |
| Off-route drag/drop + one-touch toggle; confirmed can leave route | Done |
| Routes API departureTime / field-mask fixes | Done |
| Compact Routes header/footer/rows/off-route collapse + Undo | Done |
| Zig-zag 5-stop / 1-item seed (scenario v6) | Done |
| Hold-to-complete (replace slide) | Done |
| Drop “Items handed to customer”; stamp `delivered_at` on complete | Done |
| Evidence thumbnails inside proof/signature/problem buttons | Done |
| Delete unused `FieldSlideToComplete`, `FieldStageHeader`, `FieldBottomShortcuts` | Done |

## Remaining plan (2026-07-27)

Two remaining phases, each one plan plus one execution:

- **Phase 4 — Finalize mobile.** Close out Field: cleanup/ship notes (4A), code-audit substitute for phone smoke (4B), fix what the audit finds (4C). **DONE in working tree 2026-07-27.**
- **Phase 5 — Unify desktop on the mobile design language.** Promote Field tokens into a universal system, rebuild Delivery Desk on it, and mount production add/adjust (no test data in prod).

Owner chose a code audit over a physical-phone session for 4B; remaining owner-only checks are real camera/GPS/SMS hardware handoffs (not blocking Phase 5 planning).

### Phase 4 — Finalize mobile — **DONE (working tree 2026-07-27)**

**Goal:** Field is accepted on real phones and free of dead scaffolding. No Desk work happens here.

#### 4A. Shippable slice (AI) — **DONE 2026-07-27**

- [x] Stage Phase 3.1 polish under `## [Unreleased]` in `CHANGELOG.md` (version bump deferred to push).
- [x] Test-data policy locked: seed stays `DEBUG`-only; production carries **no** test data. Phone QA is local HTTPS only.
- [x] Desk/Field list queries send `include_test=1` only when `import.meta.env.DEV`.
- [x] Delete unused Field chrome: `FieldStageHeader`, `FieldBottomShortcuts` (step rail + `FieldListBottomNav` own chrome).
- [x] Keep orphaned but complete `AddDeliveryDialog` / `DeliveryDayBoard` / `DeliveryDetailsModal` for Phase 5 reuse — do not treat as rot.
- [x] Outbox regression tests: success clears queue, failure retries, same `client_photo_id` is idempotent.
- [x] Clean `npx tsc --noEmit` (ContactStep sx order; BarcodeDetector cast via `unknown`).

#### 4B. Device-path code audit (substituted for owner phone smoke) — **DONE 2026-07-27**

Owner skipped the physical-phone session for schedule reasons. AI ran a read-only audit of signature, SMS, camera/scanner, pager/hold, safe-area, and outbox paths and produced a prioritized defect list. Findings that survived skeptical review fed 4C.

**Still owner-only (optional pass, does not block Phase 5 planning):**

- Real rear-camera hardware / permission UX on a phone.
- Real GPS / Maps handoff feel.
- Actual iOS Messages / Android SMS composer body prefill on device.
- Full seeded-day walkthrough confidence.

**Walkthrough checklist (optional owner pass — local HTTPS):**

```bat
scripts\dev\seed_delivery_test_dataset.bat
scripts\dev\start_mobile_dashboard.bat
```

- [ ] Contact Call/Text; Load reseal camera; Routes Optimize on zig-zag; Deliveries hold-to-complete; Finish return.
- [ ] Signature alignment; SMS body prefill; refresh mid-run; offline capture reconnect.

#### 4C. Audit fix slice (AI) — **DONE 2026-07-27**

- [x] `viewport-fit=cover` + run shell `100dvh`; bottom safe-area only on `FieldStepRail` (inner footers fixed padding).
- [x] Pager tap swallow: `gestureSuppressesTap` — only past swipe dead zone suppresses Call/Text/Navigate clicks.
- [x] `FieldHoldToComplete` fail-safe: window-level pointer release, single `pointerId`, disabled while `onComplete` pends, keyboard/tabIndex.
- [x] Evidence/outbox: reset file input after pick; single-flight drain + visibility/focus drain; honest “Proof uploading…” hold label when queued.
- [x] SignaturePad: skip resize while drawing / unchanged width; saving guard; one active pointer; `touch-action: none` on canvas.
- [x] Scanner: restart camera on return to visible; stop tracks in Type SKU mode.
- [x] Empty-phone Call/Text disabled (“No phone”); iPadOS desktop Safari detected as iOS for SMS `&body=`.
- [x] Deferred (Phase 5): pin primary CTA outside card scroll; soften uiStep forward-sync; freeze selection during mutations; letterbox signatures; extension-aware phone normalize.

**Phase 4 gate (soft):** Field carries no dead scaffolding; code-audit device defects fixed; local seed→phone→reset loop still available. Optional owner hardware pass can still find leftovers.

### Phase 5 — Unify desktop on the mobile design language — **NEXT**

**Goal:** Desktop stops looking like a different product. The Field decisions become a universal system, Delivery Desk is rebuilt on it, and production managers can add/adjust real deliveries without test data.

This **supersedes** the earlier rule that Desk and Field must be visually unrelated component trees. The shared thing is the design language and primitives; the layouts still differ because a keyboard workspace is not a one-handed phone.

#### 5A. Universal design system — **DONE (working tree 2026-07-28)**

- [x] Promote tokens to [`frontend/src/theme/deliveryTheme.ts`](../../frontend/src/theme/deliveryTheme.ts); Field [`ecoFieldTheme.ts`](../../frontend/src/pages/pos/deliveries/field/ecoFieldTheme.ts) re-exports.
- [x] Phone/desktop density helpers for primary and secondary buttons; summary-row comfortable/compact kept.
- [x] Desk planning row + shared status chips / cards / bucket tones.
- [x] Scope boundary: Delivery Desk only.

#### 5B. Desk rebuild + production add/adjust — **DONE (function-first, 2026-07-28)**

| Finding | Resolution |
|---|---|
| Orphaned create UI | Mounted on Desk Total + Day detail; create posts to audited `POST /deliveries/` with cart linkage. |
| Orphaned edit UI | `DeliveryDetailsModal` wired on Day detail via `buildDeliveryDayCards`; board stays unmounted (date-keyed run API). |
| Desk Total archive | Day-detail cancel uses `PATCH /delivery-jobs/` → `cancel_job_with_run_sync`; Total archive now also syncs via `archive_delivery`. |
| Assign day | `assign_delivery_to_day` calls `sync_job_onto_open_run` (+ leaves prior open stop as rescheduled). |
| Past-sale audit | `DeliveryViewSet.create` passes `cart` / `source_cart_line_ids` into `create_delivery`. |

**Work:**

- [x] Mount Add delivery from past invoice/sale on Desk Total + Day detail (audited `/deliveries/`).
- [x] Mount adjust: contact, append-address, reschedule, cancel (run-aware).
- [x] Align archive/assign-day with open-run sync + tests.
- [x] Replace Day detail jobs table with `DeskPlanningRow` planning surface.
- [x] Restyle Days, Total, live monitor onto shared tokens.
- [x] Page tests for Days, Total, Day detail, planning row.
- [x] Completed-day evidence/history timeline — `GET …/history/` on days and jobs + `DeliveryHistoryPanel`; run attachments render as thumbnails on completed days.
- [x] Do not port the driver wizard.

**Phase 5 gate (soft):** Managers can create from a past sale and adjust deliveries; Day detail is a planning surface; shared theme module exists.

#### 5C. Completion sweep — **DONE (v2.59.0, 2026-07-28)**

| Item | Resolution |
|---|---|
| Manager item adjustments | `DeliveryDetailsModal` gained an *Adjust items on record* block wired to `addItem` / `removeItem` in `useDeliveryMutations`; Desk Day detail passes them for managers only. |
| Day create/edit | `DeskDayDialog` mounted on Days list (Add) and Day detail (Edit) — date, window, crew, driver, notes, planning disposition. |
| Change history | `delivery_audit.py` gained `describe_change` / `serialize_change_event` / `{day,job}_history_queryset`; two read endpoints; `DeliveryHistoryPanel` on Desk Day detail and the details modal. |
| Real route map | Routes API `encodedPolyline` → `run.route_summary` → cached Static Map via `delivery_route_map.py` and `GET /delivery-days/{id}/route-map/` (API key stays server-side); `DeliveryRouteMap` replaces `MiniMap` on Desk monitor, Field day preview, Field Routes header. |
| Byte-level upload % | `uploadDeliveryAttachment` accepts `onProgress`; threaded through `useFieldPhotoUpload` into the busy bar and evidence ring. |
| Deferred 4C shell fixes | All five landed: pinned CTA footer in `FieldDeliveryCardFrame`, `resolveUiStepSync` live-edge follow + “Live: …” chip, pager/dots frozen while `busy`, `letterboxRect` signature preservation, extension-aware phone parse. |
| Dead code | `DeliveryDayBoard` / `DeliveryDayCard` / `DeliveryCardPhaseActions` deleted with their empty subfolders; orphaned `usePOS` delivery hooks and 16 unused `pos.api` clients pruned. |
| Suite repair | Pre-existing `apps.pos` failures fixed (stale `Item.title` kwargs in three cart tests; future-dated audits and a migration-seeded goal collision in `test_dashboard_metrics`). `apps.pos` 176 pass, frontend 374 pass, `tsc` clean. |

---

## Eco Field visual contract (still binding, now the app-wide source)

Reference: [`../reference/eco-field-demo.html`](../reference/eco-field-demo.html).

- Replicate composition and one-handed behavior, not every raw CSS value.
- Tokens live in [`ecoFieldTheme.ts`](../../frontend/src/pages/pos/deliveries/field/ecoFieldTheme.ts) (ink `#14201A`, green `#0E8A4E` / deep `#0A6B3C`, tints, 44px+ touch, safe areas). Phase 5 promotes them to an app-level module; Field keeps consuming them, not owning them.
- Field remains an immersive phone app — no desktop tables in the Field tree.
- **Direction change 2026-07-27:** the earlier rule that Desk must look deliberately unlike Field is retired. Desk adopts the same tokens, primitives, and interaction vocabulary at desktop density. What stays separate is layout and task model: Desk plans, monitors, and corrects; it never renders the driver wizard.
- Deviations require accessibility, safe-area, backend truth, native handoff, or maintainability — not “existing component looked different.”

---

## Rebuild acceptance (updated)

- [x] Field five-step shell over real Day/Run APIs (not mockup JS state).
- [x] Legacy Field stages / legacy board removed from nav.
- [x] Routes API + honest provider/fallback + service-minutes ETAs.
- [x] Off-route membership + Optimize + compact Routes UI.
- [x] Hold-to-complete + evidence-in-buttons + no redundant handed-over tap.
- [x] Camera-first seal/reseal + reopen window.
- [x] Desk live monitor (functional).
- [ ] Field visual composition accepted by owner at phone width vs mockup. *(optional owner pass)*
- [x] Device-path audit + 4C fixes (safe-area, tap swallow, hold fail-safe, scanner resume, SMS iPadOS, empty phone). *(Phase 4B/4C)*
- [ ] Optional owner hardware smoke (real camera/GPS/SMS handoff). *(does not block Phase 5 planning)*
- [x] Test-data policy: seed `DEBUG`-only; production has no test data; lists omit `include_test` outside DEV. *(Phase 4A)*
- [x] Field carries no dead scaffolding (`FieldStageHeader` / `FieldBottomShortcuts` deleted). *(Phase 4A)*
- [x] Outbox regression tests + clean `tsc`. *(Phase 4A)*
- [x] Universal tokens/primitives module shared by Field and Desk. *(Phase 5A)*
- [x] Desk Day detail is a planning surface on the shared system, not a jobs table. *(Phase 5B)*
- [x] Production add-from-past-sale + adjust-delivery mounted on Desk. *(Phase 5B)*
- [x] Critical page tests green; release cut. *(Phase 5B/5C — v2.59.0)*
- [x] Real map surface (Static Map from the Routes polyline) on Desk and Field. *(Phase 5C)*
- [x] Change-history timeline readable on Desk. *(Phase 5C)*

---

## Initiative-wide acceptance

- [x] Local `DEBUG` seed/show/reset is safe and repeatable; production never seeds test data.
- [x] Test data is unmistakable, dataset-scoped, excluded by default (and not requested outside DEV builds).
- [x] Desk and Field are separate applications over shared domain logic.
- [x] Desk and Field share one token/primitive layer so the two read as one product. *(Phase 5A)*
- [x] Managers can create deliveries from past invoices and adjust existing deliveries (including items) in production Desk. *(Phase 5B/5C)*
- [x] Server state guards match Field actions (contact/load/seal/route/proof/return).
- [x] Provider-backed optimization and ETA math are observable and unit-tested.
- [x] Dynamic off-route / re-routing updates order and ETAs.
- [ ] Signature finger-aligned and physically tested.
- [ ] iPhone and Android native SMS composer handoff physically tested.
- [ ] Owner phone smoke checklist green.
- [x] Changelog dated release cut when polish pushes. *(v2.58.0 Field, v2.59.0 Desk)*

---

## Explicitly out of scope

- Automatic/server-sent SMS, delivery receipts, Twilio-style inbox.
- Background GPS tracking, payroll time, in-dashboard turn-by-turn.
- Customer-facing live tracking portal.
- Signature embedded into PDF/document (PNG may feed that later).
- Inventory status mutation on failed return (reconcile stays operational/audited).
- Rebuilding POS checkout/delivery-fee policy.
- Native iOS/Android apps (web + native URI handoffs only).

---

## Owner gates

1. **Destinations locked:** Days + Total Deliveries; Day Board is a Days drill-down.
2. **Names:** Delivery Desk / Delivery Field unless renamed in visual review.
3. **QA phones:** fictional 555 by default; real number only via uncommitted option.
4. **Service duration:** 20 minutes global default; per-stop override only if field testing demands it.
5. **Re-optimization:** Optimize always available; late Add N / drag-on refreshes ETAs.
6. **Complete gesture:** hold-to-complete (not slide) so card paging stays reliable.
7. **Message copy:** owner approves final templates during phone QA.

---

## Key file map

| Area | Paths |
|---|---|
| Field shell / steps | `frontend/src/pages/pos/deliveries/field/EcoFieldRunShell.tsx`, `steps/{Contact,Load,Routes,Deliveries,Finish}Step.tsx` |
| Field components | `components/FieldHoldToComplete.tsx`, `FieldDeliveryPager.tsx`, `FieldBarcodeScannerSheet.tsx`, `FieldStepSummaryShell.tsx`, `ecoFieldTheme.ts` |
| Photo / SMS / sig | `useFieldPhotoUpload.ts`, `components/pos/delivery/SignaturePad.tsx`, `fieldRunUtils.ts` |
| Backend | `apps/pos/services/delivery_{run,distance,settings,phase2,test_dataset}.py`, `apps/pos/migrations/0024_delivery_run_truck_reopened.py` |
| Desk | `frontend/src/pages/pos/deliveries/desk/DeskDay{DetailPage,LiveMonitor}.tsx`, `DeskDaysPage.tsx`, `DeskTotalDeliveriesPage.tsx` |
| Local phone | `scripts/dev/start_mobile_dashboard.bat`, `scripts/dev/seed_delivery_test_dataset.bat` |
| Mockup | `.ai/reference/eco-field-demo.html` |

---

## Sessions

### Session 1–2 (2026-07-22) — Planning
Initiative + Phase 1 IA/migration plan. Docs only.

### Session 3 (2026-07-22) — Phase 1
Canonical Days/items/datasets, Days + Deliveries APIs, Desk/Field inactive shells, seed/show/reset. **v2.55.**

### Session 4 (2026-07-22) — Phase 2
Contact truth, item load, Field Start Today shell, Desk monitor, active-run seed. **v2.56.**

### Session 5 (2026-07-22) — Eco Field rebuild contract
Mockup-driven Field Home + five-step shell over real APIs; local phone loop. Desk redesign deferred.

### Session 6 (2026-07-24) — Phase 3
Routes API, service-minutes ETAs, Field route/evidence/SMS/completion, Desk route panel, legacy retired. **v2.57.0.** Owner phone smoke left open.

### Session 7 (2026-07-24 → 2026-07-27) — Field polish / ops acceptance prep
- Camera-first reseal + reopen seal window + upload busy bar.
- Off-route DnD / membership decoupled from contact; Routes API departureTime fixes.
- Compact Routes UI; zig-zag scenario v6 seed.
- Hold-to-complete; drop handed-over checkpoint; evidence thumbnails in buttons.
- Remaining work restructured into two phases at owner direction: **Phase 4 finalize mobile**, **Phase 5 unify desktop on the mobile design language**.

### Session 8 (2026-07-27) — Phase 4A Field cleanup
- Deleted unused `FieldStageHeader` / `FieldBottomShortcuts`.
- Gated `include_test` on `import.meta.env.DEV` across Desk/Field list queries.
- Cleaned `tsc` (ContactStep sx, BarcodeDetector cast); added `deliveryMediaClient` outbox regression tests.
- Staged `[Unreleased]` CHANGELOG; locked policy: no production test data; phone QA is local HTTPS.
- Documented Phase 5B production add/adjust gaps (orphaned `AddDeliveryDialog` / `DeliveryDetailsModal`).

### Session 9 (2026-07-27) — Phase 4B audit + 4C Field device fixes
- Owner skipped physical-phone smoke; AI code audit substituted (signature/SMS/scanner/pager/hold/safe-area/outbox).
- Fixed: `viewport-fit=cover` + `100dvh`; pager tap swallow; hold-to-complete fail-safe; file-input reset; single-flight + visibility/focus outbox drain; SignaturePad mid-stroke resize wipe; scanner resume + Type SKU LED off; empty-phone + iPadOS SMS.
- Deferred to Phase 5: pinned CTA layout, uiStep soft-sync, selection freeze, signature letterbox, extension phones.

### Session 10 (2026-07-28) — v2.58.0 + Phase 5B function-first
- Released **v2.58.0** (Field polish) to GitHub; fixed root `package.json` drift (was 2.56.2).
- Audited past-sale create: `DeliveryViewSet.create` accepts `cart_id` / `cart_line_ids`; `AddDeliveryDialog` posts to `/deliveries/`.
- Mounted Add + adjust on Desk; Day detail planning rows; run-sync for assign-day/archive.
- Promoted `deliveryTheme.ts`; restyled Desk Days/Total/monitor.

### Session 11 (2026-07-28) — Phase 5C completion sweep → v2.59.0
- Landed all five deferred 4C shell fixes and byte-level upload progress.
- Built the change-history read path (`describe_change` / `serialize_change_event` / day+job `history` endpoints) and `DeliveryHistoryPanel`.
- Replaced `MiniMap` with a real route map: Routes API polyline → cached Static Map behind `GET /delivery-days/{id}/route-map/` (key never reaches the browser).
- Mounted manager item add/remove and `DeskDayDialog` day create/edit.
- Swept dead code (legacy board trio, orphaned `usePOS` hooks, 16 unused API clients).
- Repaired pre-existing `apps.pos` failures unrelated to deliveries (stale `Item.title` cart tests; `test_dashboard_metrics` future-dated audits + seeded-goal collision).
- Gates: `apps.pos` 176 pass, frontend 374 pass, `tsc` clean, `makemigrations --check` clean. Released **v2.59.0**.
- **Remaining:** owner phone hardware pass and owner visual sign-off only.

---

## See also

- [`pos_discount_and_delivery`](./_archived/_completed/pos_discount_and_delivery.md)
- [`../extended/pos-system.md`](../extended/pos-system.md)
- [`../extended/frontend.md`](../extended/frontend.md)
- [`../extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) — Receiving media behavior
- [`../../docs/app_navigation_and_pages.md`](../../docs/app_navigation_and_pages.md)
- [`../protocols/code.0.Startup.md`](../protocols/code.0.Startup.md)
- [`../context.md`](../context.md)
