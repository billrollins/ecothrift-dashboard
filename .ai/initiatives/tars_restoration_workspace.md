<!-- initiative: slug=tars-restoration-workspace status=active updated=2026-06-23 -->
<!-- Last updated: 2026-06-23 (Session 1b — TARS page model: Send / Check-In & Evaluate / TARS) -->

# Initiative: TARS Restoration Workspace

**Status:** **Active** — Phase 0 (design + client mock).

**Goal:** Build the **Restoration workspace** for TARS — **Test, Assemble, Repair, Salvage** — with a clear handoff from Processing and a profit-based decision engine.

**Reference UX:** [`.ai/reference/TARS Restoration Processing App/`](../reference/TARS%20Restoration%20Processing%20App/TARS.dc.html) (Design Component prototype).

**Route:** `/restoration/tars` — Restoration nav workspace (Slot C).

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

- [ ] `RestorationJob` (or equivalent) model: stage, scale, `grade_values`, paths, `chosen_path`, timestamps
- [ ] REST API: list/send/scan/bench/decide/complete
- [ ] Wire mock UI to React Query hooks

### Phase 2 — Processing handoff

- [ ] Items with `dispatch=restoration` create or enqueue restoration jobs
- [ ] Intake queue fed from real check-ins (not seed data)

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

- Prototype: [TARS.dc.html](../reference/TARS%20Restoration%20Processing%20App/TARS.dc.html)
- Nav: [`slotCNavLayout.ts`](../../frontend/src/navigation/slotCNavLayout.ts), [`navItemCatalog.ts`](../../frontend/src/navigation/navItemCatalog.ts)
- Processing dispatch `restoration`: [`processingItemFormOptions.ts`](../../frontend/src/pages/inventory/processing/processingItemFormOptions.ts)
- Prior placeholder: shipped in **v2.25.0** staff nav (`staff_nav_redesign`)
