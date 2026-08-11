<!-- initiative: slug=tars-restoration-workspace status=pending updated=2026-07-09 -->
<!-- Archived 2026-07-09: disposition=pending paused off main index (Phases 0–2 + hardening shipped; resume Phase 3–4) -->
<!-- Last updated: 2026-07-09 (archived → _pending/) -->

# Initiative: TARS Restoration Workspace

**Status:** **Superseded — closed to new work.** All remaining TARS scope now lives in the active initiative [`finalize_tars_app`](../../finalize_tars_app.md). Do not resume this file; read it for history only. Phases 0–2 + hardening shipped through **v2.39.0**.

**Routes:** `/restoration/queue` (Send to Restoration), `/restoration/tars` (live bench workstation).

---

## Finish line (initiative)

Restoration staff can **receive items sent from Processing**, **price grade outcomes**, **scan onto the bench**, **run the decision engine** (parts + hours → profit), **perform** a chosen TARS path, and **work verb-specific queues** (Test / Assemble / Repair / Salvage) until items exit to floor dispatch.

---

## Workflow (two parts + execution)

| Phase | Who | UI page | What happens |
|-------|-----|---------|--------------|
| **1. Send to Restoration** | Processing (restoration workspace) | **Send to Restoration** | Pick item → choose **grade scale** → enter **retail $ per grade** → **Send to Restoration** |
| **2. Check in / Evaluate** | Restoration | **Check-In & Evaluate** | Scan sent items → **bench** → refine costs/issues → evaluation updates → **Perform** |
| **3. Execute** | Restoration | **TARS** (verb tabs below evaluation) | **Test \| Assemble \| Repair \| Salvage** queues under active evaluation summary → complete → floor |

**Out of scope (early phases):** Owner time-premium dashboard (defer to Admin assumptions); custom grade scales persisted server-side; API integration with live `Item` / `ProcessingRow`.

---

## MVP scope (phased)

### Phase 0 — Design + mock (this session)

- [x] Initiative file + active index row
- [x] `TarsWorkspacePage` replacing placeholder — pages **Send to Restoration \| Check-In & Evaluate \| TARS**
- [x] Client-only mock store (prototype sample SKUs, stages, profit math)
- [x] Basic dynamics: send, scan-in, decide, perform → verb queue, complete

### Phase 1 — Backend foundation

- [x] `RestorationJob` model: stage, scale, `grade_values`, timestamps (one per `ItemCheckIn`)
- [x] REST API: list / patch / send / manual SKU scan (`/api/inventory/restoration-jobs/`)
- [x] Queue page wired to React Query hooks
- [x] Bench / verb queue API (`sent` → `bench` → `executing` → `done`) — **`PATCH …/work-session/`**, scan-to-bench, pending/hold/done

### Phase 2 — Processing handoff

- [x] Items with `dispatch=restoration` create restoration jobs + persist grade snapshot
- [x] Intake queue fed from real check-ins (Processing + manual SKU scan)

### Phase 3 — Execute workflows

- [ ] Per-verb detail panels (parts used, actual hours, notes, photos)
- [ ] Complete → update `Item.location` / dispatch (on_shelf, salvage, etc.)

### Phase 4 — Steering

- [ ] Time premium + base rate from `AppSetting` / assumptions
- [ ] Backlog-aware premium suggestions (Owner prototype)

---

## Acceptance (Phase 0)

- [x] Restoration nav opens TARS workspace with three pages (Send → Check-In & Evaluate → TARS)
- [x] Send to Restoration: grade scale + retail table + send gate
- [x] Check-In & Evaluate: scan bar, queues, evaluation cards with live profit refresh + perform
- [x] TARS: active evaluation summary + verb sub-tabs (Test / Assemble / Repair / Salvage)
- [x] `npm run build` green

**Result:** Phase 0 mock shipped in repo (unreleased). Default landing: **Check-In & Evaluate**. TARS page shows evaluation context above verb queues.

---

### Session 1b — 2026-06-23

**Goal:** Reframe mock pages to match Restoration workflow naming and hierarchy.

**Updates:**

- Top pages renamed: **Send to Restoration**, **Check-In & Evaluate**, **TARS**.
- Check-In & Evaluate is default landing page; evaluation copy emphasizes live cost/issue updates.
- TARS page adds **Active evaluation** summary card + **Update evaluation** link; verb tabs sit underneath.
- `lastPerformedSku` / `focusEvaluationItem` in mock store for cross-page context.

---

## Sessions

### Session 4 — 2026-07-01

**Goal:** Full TARS quality pass — fix all confirmed bugs and land the easy upgrades from the 2026-07-01 four-track code review (backend services, bench workstation, queue/parts UI, API contract).

**Finish line:** All review findings fixed or explicitly deferred; Django restoration tests green; `npm run build` green.

**Scope:** Backend — requeue lifecycle reset, `work_session` validation + defensive metrics, parts-order site guard, mark-handled guard + unmark, final-grade validation, locking, N+1, dead `executing` stage. Frontend — grade-scales render loop, draft-save races, cache-invalidation gaps (Returns list, queue patches), pagination follow-up, negative-value clamps, timer/error UX, dead code.

**Out of scope:** Phase 4 steering (time premium), grade-values float→Decimal storage, returns endpoint pagination redesign.

**Est:** half day. **Start:** 2026-07-01

**Updates (2026-07-01):**

- Four-track review (backend / bench / queue+parts / API contract) produced ~30 findings; all confirmed items fixed in one pass (three parallel fix tracks, disjoint file ownership).
- Backend: requeue lifecycle reset, `work_session` validation + defensive dashboard metrics, multi-site parts-order guard, mark/unmark-handled, final-grade validation, `spent_parts_cost` from actuals, row locking, N+1 fix, dead `executing` stage removed — migration **`0078`** (stage choices + partial Returns index). +5 tests (55 → green).
- Frontend: `useGradeScales` memo (send-dialog render loop that wiped typed grade values), bench draft dirty-tracking + grade-card draft merge, per-job queue patch map, cache invalidation gaps (Returns list, queue cache, bench list), pagination follow-`next`, negative-money clamps, shared **`tarsMoney`** util, dead code removed.
- Verified: `manage.py test` inventory restoration + pos dashboard metrics (65 OK); `npm run build` green.
- Deferred (noted, out of scope): grade-values float storage, returns endpoint pagination, `TarsDisplaySource` union widening in `tarsTypes.ts`, `TarsQueuePreviewContent` whitespace cleanup.

**Goal:** Ship **TARS 2** live bench workstation, parts-list orders CRUD, dashboard metrics.

**Updates:**

- **`/restoration/tars`** — full-width **`TarsWorkstation`** with live **`RestorationJob`** bench API, debounced **`work_session`** draft, grade scales, timer flows, parts drawer.
- Parts drawer — Parts + Orders tabs; **`TarsPartsOrderDialog`** with drawer-style lines; **`partQtyOverrides`** for order-only qty.
- Dashboard — live metrics API, department/sales goals, sub-second reload via cache + client placeholder.
- Released **v2.34.0**.

---

### Session 2 — 2026-06-24

**Goal:** Finish **Queue** page design, then redesign **TARS** page to match reference UX — still client mock only.

**Finish line:** Queue design complete and signed off; TARS page (bench + evaluation + verb queues) visually aligned with [TARS prototype](../../../reference/TARS%20Restoration%20Processing%20App/TARS.dc.html).

**Scope:** Phase 0 mock UI polish — `TarsIntakePanel` / `TarsQueuePage`, then `TarsBenchPanel`, `TarsExecutePanel`, `TarsPage`. Shared mock store unchanged unless design needs it.

**Out of scope:** Django models, REST API, React Query wiring, Processing handoff (Phase 1+).

**Start:** 2026-06-24

**Order:** (1) Queue → (2) TARS → (3) backend / real data (later session).

**Updates (Session 2b — queue live):**

- `RestorationJob` + migration `0068`; `apps/inventory/services/restoration.py` grade validation + job lifecycle.
- Processing check-in validates/persists `restoration_scale` / `restoration_grade_values`; creates job when `dispatch=restoration`.
- REST: `GET/PATCH/POST /api/inventory/restoration-jobs/`, `POST …/{id}/send/`; manual SKU scan for restoration items.
- `/restoration/queue` uses React Query (`useRestorationJobs`); `TarsMockProvider` scoped to `/restoration/tars` only.

---

### Session 1 — 2026-06-23

**Goal:** Design pages, placeholders, mock basic dynamics per TARS reference prototype.

**Finish line:** Staff can click through Intake → Bench → TARS verb queues with in-browser mock data.

**Scope:** Frontend mock only; no Django models yet.

**Start:** 2026-06-23

**Updates:**

- Initiative created; reference linked.
- `TarsWorkspacePage` + mock store + Intake / Bench / Execute panels.

---

## See also

- Prototype: [TARS.dc.html](../../../reference/TARS%20Restoration%20Processing%20App/TARS.dc.html)
- Nav: [`slotCNavLayout.ts`](../../../../frontend/src/navigation/slotCNavLayout.ts), [`navItemCatalog.ts`](../../../../frontend/src/navigation/navItemCatalog.ts)
- Processing dispatch `restoration`: [`processingItemFormOptions.ts`](../../../../frontend/src/pages/inventory/processing/processingItemFormOptions.ts)
- Prior placeholder: shipped in **v2.25.0** staff nav (`staff_nav_redesign`)
