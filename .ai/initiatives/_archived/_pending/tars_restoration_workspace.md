<!-- initiative: slug=tars-restoration-workspace status=pending updated=2026-07-09 -->
<!-- Archived 2026-07-09: disposition=pending paused off main index (Phases 0–2 + hardening shipped; resume Phase 3–4) -->
<!-- Last updated: 2026-07-09 (archived → _pending/) -->

# Initiative: TARS Restoration Workspace

**Status:** **Superseded — closed to new work.** All remaining TARS scope now lives in the active initiative [`finalize_tars_app`](../_completed/finalize_tars_app.md). Do not resume this file; read it for history only. Phases 0–2 + hardening shipped through **v2.39.0**.

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

## See also

- Process canon: [`.ai/reference/tars/`](../../../reference/tars/)
- Nav: [`slotCNavLayout.ts`](../../../../frontend/src/navigation/slotCNavLayout.ts), [`navItemCatalog.ts`](../../../../frontend/src/navigation/navItemCatalog.ts)
- Processing dispatch `restoration`: [`processingItemFormOptions.ts`](../../../../frontend/src/pages/inventory/processing/processingItemFormOptions.ts)
- Prior placeholder: shipped in **v2.25.0** staff nav (`staff_nav_redesign`)
