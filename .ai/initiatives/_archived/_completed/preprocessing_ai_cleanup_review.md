<!-- Archived 2026-06-10: disposition=completed (Step 2 web AI cleanup review + implementation shipped v2.28.0) -->
<!-- initiative: slug=preprocessing-ai-cleanup-review status=completed updated=2026-06-10 -->
<!-- Last updated: 2026-06-10 (archived — Sessions 1–2 complete) -->

# Initiative: Preprocessing AI cleanup — review & test

**Status:** **Completed** — archived. **Shipped:** **v2.28.0** (Sessions 1–2, 2026-06-10): Fable verdict + all seven implementation slices (`ai-cleanup-batch` browser pool, chunked offline apply, gthread Procfile, legacy `ai-cleanup-rows` 410). See [`CHANGELOG` [2.28.0]](../../../../CHANGELOG.md). Optional post-deploy ops: manual smoke on a 700+ row PO (WLMRT-OJU-3V74) — not blocking archive.

**Fable verdict (summary):** Web UI click-to-run is primary; **new** slim `ai-cleanup-batch` endpoint (explicit `row_ids`, ≤10/batch, Anthropic only, writes `PreprocessingRow.ai_*` via the same merge helper as `apply-cleanup-csv`, generation guard kept) — do **not** refactor legacy `ai-cleanup-rows` (it creates Products/Items pre-check-in and overwrites the `ManifestRow` vendor claim; deprecate→410→remove). **batch_size 10 confirmed.** Concurrency: Procfile must move to gthread (`--workers 2 --threads 8`) first; then browser pool **default 4, cap 8, never 16** (16 would starve the 2-worker dyno incl. POS). Grok harness **frozen** as offline fallback; `.cleaned.csv` stays the interchange; apply cliff fixed by **chunked apply** (50 rows/POST, `partial: true`, candidates deferred to new `ai-cleanup-complete`). Implementation order + acceptance checklist in the handoff doc.

**Parent context:** Follow-on to the shipped inbound rebuild ([`order_processing_pipeline_rebuild`](./order_processing_pipeline_rebuild.md) **v2.20.0**–**v2.24.2**) and separate from the active product-identity / Item Processor work in [`intake_processing_improvements`](../../intake_processing_improvements.md).

**Primary question:** Does Step 2 **need** to be offline (download → local AI → re-upload), or can we restore a **click-to-run** path that survives **Heroku's ~30s request limit** via **one small API call per batch**, partial progress, and resume?

**Owner goals (Session 1):**

1. **Offline vs in-app** — Is CSV round-trip still justified, or should staff click **Run AI Cleanup** again?
2. **Heroku timeout** — Root cause was 30s router limit; each HTTP request must be a **single batch** (fetch → one AI call → save → return). Strip heavy work before/after the model call.
3. **Operational safety** — Partial progress must persist; failure mid-run must not leave staff with nothing. Need fail-safe or stable-by-design from day one.

**Primary surfaces (read/test, not necessarily edit):**

| Layer | Where |
|-------|--------|
| Staff UI | `PreprocessingPage` Step 2 — `CleanupStep` → `RowProcessingPanel` |
| SPA apply path | `POST …/apply-cleanup-csv/` via `useUploadCleanupCsvRows` |
| Export | `GET …/download-cleanup-csv/` |
| Validation | `apps/inventory/cleanup_csv_validate.py`, `cleanup_condition.py` |
| Apply impl | `PurchaseOrderViewSet._upload_cleanup_csv_impl` — `apps/inventory/views.py` |
| Offline Grok harness | `workspace/ai-cleanup-grok/helpers/clean-grok.mjs` (gitignored workspace; local only) |
| Legacy in-app path | `POST …/ai-cleanup-rows/` (Anthropic batches on `ManifestRow` — not Step 2 primary) |

**Out of scope (unless owner pulls forward):** Final Decisions / product matching (see `intake_processing_improvements`), Item Processor, buying/B-Stock, broad intake schema changes, committing workspace Grok tooling to git.

---

## Objectives

1. **Offline vs in-app verdict** — Recommend primary path for production staff; keep offline as fallback or drop it.
2. **Timeout / batch architecture** — Map what each request does today; size batches for &lt;30s; identify work to remove from the hot path.
3. **Fail-safe design** — Partial save, resume offset, status/progress, retry-one-batch, undo; no single 744-row all-or-nothing apply.
4. **Document current state** — What Step 2 actually ships today (UI + APIs + Grok workspace).
5. **Hands-on test** (optional) — Real PO (e.g. WLMRT-OJU-3V74): timing, apply payload size, soft warnings.

---

## Session 1 findings — offline vs in-app (2026-06-10)

### What Step 2 shipped before Session 2 (historical)

| Path | UI | Server | Writes to |
|------|-----|--------|-----------|
| **Offline (primary in UI)** | `RowProcessingPanel` — download + upload CSV; toolbar **Run Cleanup** | `download-cleanup-csv` → local Grok → `apply-cleanup-csv` (all rows, one POST) | `PreprocessingRow.ai_*` ✓ |
| **In-app (legacy, UI removed)** | Hooks existed but **nothing called them** | `POST ai-cleanup-rows` — default `batch_size=25`, Anthropic `timeout=90s` | **`ManifestRow`** (not staging `ai_*`) ✗ for new flow |

Offline was a **workaround**, not a product requirement: avoid Heroku H12, use Grok structured output locally, and avoid the legacy in-app path that timed out.

### Why in-app failed before

1. **Heroku router ~30s** — Backend allows 90s Anthropic timeout; router kills first.
2. **Batch too large** — Default 25 rows + rich prompt often &gt;30s API time.
3. **Heavy per-request work** — `ensure_manifest_products_and_items`, item prefetch, `sync_manifest_row_outputs_to_items` in the same request as the AI call.
4. **Wrong write target for new flow** — `ai-cleanup-rows` still mutates **`ManifestRow`**, not **`PreprocessingRow.ai_*`**.

### Hidden second timeout (offline apply)

`apply-cleanup-csv` requires **exact row coverage** and runs **one atomic transaction** for the **entire PO** (e.g. 744 rows). A large Grok output can also H12 on apply — staff can finish AI locally and still fail at upload.

### Verdict (delivered)

**Offline does not need to be the primary path.** Keep as **fallback** (Grok preference, API outage, bulk re-run from CSV).

**In-app should return** as a **client-driven batch loop**:

```
repeat until has_more:
  POST ai-cleanup-batch  { row_ids, batch_size: 5–10 }
    → load N PreprocessingRows only
    → one model call
    → save ai_* for those rows only
    → return { rows_saved, next_offset, has_more, discarded }
POST ai-cleanup-complete  (optional, fast)
    → match candidates, ai_cleaned_at, preprocess_status
```

**Fail-safes already partially exist:** `ai_cleanup_generation` invalidation on undo/cancel; `ai-cleanup-status` counts cleaned rows; generation check drops stale saves mid-flight.

### Recommended next session (if coding) — all delivered Session 2

| Priority | Change |
|----------|--------|
| P0 | New/refactored batch endpoint → `PreprocessingRow.ai_*`; batch_size tuned for &lt;25s |
| P0 | Restore Step 2 **Run AI Cleanup** UI — sequential batch loop, progress, pause/resume |
| P1 | Chunk `apply-cleanup-csv` (e.g. 50 rows) or drop all-or-nothing gate for incremental apply |
| P2 | Fast `ai-cleanup-complete` hook (match candidates once at end) |
| P3 | Keep offline CSV as advanced/fallback tab |

---

## Acceptance

- [x] Written findings: flow table, contract summary, sharp edges, draft operator/architecture notes (Session 1 + Fable handoff).
- [x] Benchmark notes: PO 323 (WLMRT-OJU-3V74, 744 rows) — Haiku batch 5/10/25; Grok local ~37s @ 16×20.
- [x] Fable verdict on primary path, concurrency, and API shape — delivered 2026-06-10 (workspace handoff doc § Fable 5 verdict; summary at top of this file).
- [x] Implementation (Session 2, 2026-06-10): all seven verdict slices — Procfile gthread; shared `services/ai_cleanup.py` merge helper; `ai-cleanup-batch` (row_ids ≤25, generation guard, 25s client timeout); `ai-cleanup-status` `uncleaned_row_ids`+`generation`; `ai-cleanup-complete`; `WebAiCleanupPanel` + `aiCleanupPool` (batch 10, default 4 / cap 8, retry ×2, pause/resume, progress); chunked apply (`partial: true`, 50/chunk); legacy `ai-cleanup-rows` 410 on staging + dead frontend hook removed. Tests: 13 new backend (`test_ai_cleanup_batch.py`), 7 new pool tests (`aiCleanupPool.test.ts`); full inventory suite 240 passed; vitest 67; tsc clean.
- [x] Shipped **v2.28.0** — see `CHANGELOG` [2.28.0]. Manual smoke on WLMRT-OJU-3V74 deferred to post-deploy ops (optional).

---

## Key references

- Domain: [`.ai/extended/inventory-pipeline.md`](../../extended/inventory-pipeline.md) — Step 2 **Clean**, § AI Row Cleanup
- Backend API notes: [`.ai/extended/backend.md`](../../extended/backend.md) — `download-cleanup-csv` / `apply-cleanup-csv`
- Shipped rebuild sessions: [`order_processing_pipeline_rebuild`](./order_processing_pipeline_rebuild.md) — preprocessing + Grok workspace notes
- Frontend CSV parser: `frontend/src/components/inventory/preprocessing/cleanupCsv.ts`
- Undo: `apps/inventory/services/intake_undo.py` — `ai_cleanup` stage
- **Fable handoff (primary):** [`workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md`](../../../../workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md)

---

## Sessions

### Session 1 — 2026-06-10

- **Start:** 2026-06-10T09:00:00-05:00
- **est:** ~2–4h (review + benchmarks + Fable handoff; no Step 2 implementation)
- **Goal:** Decide whether offline CSV is still required vs in-app batch cleanup; define stable architecture under Heroku 30s limit.
- **Finish line:** Written verdict + batch/fail-safe design; Fable handoff for path/concurrency decision before implementation.
- **Scope:**
  - **In:** docs + code read-through; Anthropic benchmarks; Fable handoff doc; `.ai` doc sync.
  - **Out:** Step 2 UI/backend implementation; product-identity work.
- **Owner decisions captured:** batch_size **10**; parallel workers **like Grok** (browser pool, not one long server request).

#### Session updates

- `2026-06-10T09:00:00-05:00` — Opened initiative; read Step 2 pipeline (offline CSV vs legacy `ai-cleanup-rows`).
- `2026-06-10T10:30:00-05:00` — Anthropic Haiku benchmarks on PO 323 (`test_ai_cleanup` dry-run): batch 5 avg 7.2s API, batch 10 avg 13.5s, batch 25 avg 19.6s — all under 30s API-only.
- `2026-06-10T11:00:00-05:00` — Identified production hot-path blocker: `ensure_manifest_products_and_items` on every `ai-cleanup-rows` call; apply cliff (744-row single POST).
- `2026-06-10T11:30:00-05:00` — Fable handoff: `workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md` (Grok WLMRT run 744 rows / ~37s / 16 threads).
- `2026-06-10T12:00:00-05:00` **Checkpoint** — `.ai` doc sync (`context.md`, `inventory-pipeline.md`, `frontend.md`, `backend.md`, `_index.md`, `CHANGELOG` `[Unreleased]` steering); `test_ai_cleanup` command field fixes (dev tooling only).

- `2026-06-10T13:00:00-05:00` — **Fable 5 verdict** delivered after code walk (verified hot-path `ensure_manifest_*` per batch, `ManifestRow` writes, apply cliff, and the `Procfile` `--workers 2` constraint Composer's doc missed). Full Q1–Q6 answers + implementation order appended to the workspace handoff doc; summary added to this file's header.

#### Result

**done** — Analysis + Fable verdict complete; superseded by Session 2 implementation.

### Session 2 — 2026-06-10 (Fable)

- **Start:** 2026-06-10T13:15:00-05:00
- **Goal:** Implement the full Fable verdict — all seven slices, no stopping.
- **Finish line:** Web batch cleanup runnable from Step 2; chunked offline apply; legacy endpoint 410; all tests green.
- **Scope:** In — backend service/endpoints, pool UI, Procfile, tests, docs. Out — production deploy, manual smoke on real PO.

#### Session updates

- `2026-06-10T13:20:00-05:00` — Slice 1: Procfile → `--worker-class gthread --workers 2 --threads 8`.
- `2026-06-10T13:35:00-05:00` — Slices 2–4: `apps/inventory/services/ai_cleanup.py` (shared staging merge extracted from `_upload_cleanup_csv_impl`, batch runner with generation guard, completion); views: `ai-cleanup-batch` / `ai-cleanup-complete` actions, status extended with `uncleaned_row_ids` + `generation`; legacy `ai-cleanup-rows` 410 on staging-active. Found + fixed latent prompt bug: legacy fast-mode told the model to use "Miscellaneous", which is not a taxonomy category (those outputs were silently dropped) — new prompt uses `Mixed lots & uncategorized`.
- `2026-06-10T13:45:00-05:00` — Slices 5–7 frontend: `WebAiCleanupPanel` + `utils/aiCleanupPool.ts` (partition, shared-index pool, retry ×2 backoff, pause/generation stop); CleanupStep: web panel primary, offline under **Advanced** accordion; PreprocessingPage Run Cleanup → 50-row partial chunks + `ai-cleanup-complete`; removed dead `aiCleanupRows`/`useAICleanupRows` + legacy response types.
- `2026-06-10T13:50:00-05:00` — Verification: `test_ai_cleanup_batch.py` (13 tests: merge/snapshot, manifest frozen, no Product/Item creation, generation guard, discards, 409/400/502, status shrink, complete idempotent, partial apply, full-apply coverage gate intact, legacy 410); full inventory suite **240 passed**; vitest **67 passed** (7 new pool tests); `tsc --noEmit` clean.

#### Result

**done** — All seven slices shipped; released **v2.28.0**. Initiative archived 2026-06-10.
