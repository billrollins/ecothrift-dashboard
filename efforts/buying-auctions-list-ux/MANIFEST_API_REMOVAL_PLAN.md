# Manifest API removal (expanded scope)

**Last updated:** 2026-04-17  
**Intent:** Remove **all** code, tests, docs, and ops hooks that call or support B-Stock **`order-process.bstock.com/v1/manifests/{lotId}`** (the 10-row preview). You will obtain manifests **manually** (CSV download from the buyer portal). **Future** auto-download/save of CSVs is **out of scope** here; **in scope** is: **never ingest or process manifest rows via that API again.**

---

## 1. Auction list stale `has_manifest` (keep + fix)

**Root cause:** [`DELETE …/manifest/`](apps/buying/api_views.py) already sets `has_manifest=False` and deletes rows. [`AuctionDetailPage.tsx`](frontend/src/pages/buying/AuctionDetailPage.tsx) `removeManifestMutation.onSuccess` refetches detail + manifest_rows but **does not** invalidate `['buying', 'auctions']` / summary.

**Fix:** On successful manifest removal, `invalidateQueries` (or equivalent) for `['buying', 'auctions']` and `['buying', 'auctions', 'summary']` so list/infinite queries refetch (mirror upload success paths).

---

## 2. Remove entirely — HTTP + UI (staff)

### Backend [`apps/buying/api_views.py`](apps/buying/api_views.py)

Remove actions and imports:

- `POST …/pull_manifest/`
- `GET …/manifest_pull_progress/`
- `GET …/manifest_queue/`
- `POST …/pull_manifests_budget/` (detail=False)
- `GET …/manifest_pull_log/` (if present)

Trim `get_queryset()` action lists accordingly. **Keep:** `upload_manifest`, `DELETE manifest`, `manifest_rows`, `map_fast_cat_batch`, etc.

### Frontend

- Remove API pull UI, progress polling, queue dialog, related hooks, [`buying.api.ts`](frontend/src/api/buying.api.ts) helpers and types.
- Delete unused components: e.g. `ManifestQueueDialog`, `ManifestPullProgressPanel`, `useBuyingManifestPullProgress`.

---

## 3. Remove entirely — pipeline + module

| Artifact | Action |
|----------|--------|
| [`manifest_api_pipeline.py`](apps/buying/services/manifest_api_pipeline.py) | **Delete file** (entire two-worker pipeline). |
| [`pipeline.py`](apps/buying/services/pipeline.py) | Remove `run_manifest_pull`, `run_budget_manifest_pull`, `manifest_pull_queue_queryset`, and imports of `run_api_manifest_pull` / `manifest_dev_timelog` used only by those paths. |
| [`manifest_dev_timelog.py`](apps/buying/services/manifest_dev_timelog.py) | **Delete** if only used by API pull logging; otherwise strip API-only helpers. |

---

## 4. Remove entirely — `scraper.py` order-process manifest client

Remove **all** helpers that exist only to call `https://order-process.bstock.com/v1/manifests/...`, including but not limited to:

- `ORDER_MANIFEST_BASE` / manifest URL construction
- `_manifest_http_session`, `_manifest_items_from_response` (if only used by manifest GET)
- `_fetch_manifest_paginated`, `get_manifest`, `get_manifest_with_stats`, `iter_manifest_pages`
- Module docstring / comments that describe manifest GET as supported

**Keep** in `scraper.py`: search, auction state, listing groups (if still used), shipment quotes, etc. — anything **not** `order-process` manifests.

After removal, run a repo-wide grep for `order-process`, `manifests/`, `iter_manifest_pages`, `get_manifest` to ensure no stray references.

---

## 5. Remove entirely — management commands + benchmarks

Delete or replace with `CommandError('Removed.')`:

- `pull_manifests.py`
- `pull_manifests_nightly.py`
- `pull_manifests_budget.py`
- `benchmark_manifest_pull.py`

**Ops:** Remove Heroku Scheduler (or cron) jobs that invoke nightly/budget pulls; document in deploy notes / CHANGELOG.

---

## 6. Tests

- Remove or replace [`test_manifest_api_pipeline.py`](apps/buying/tests/test_manifest_api_pipeline.py).
- Fix any other tests that mock `iter_manifest_pages`, `run_api_manifest_pull`, or manifest scraper entry points.
- Optional: one regression test that **list** serializer shows `has_manifest: false` after DELETE (API integration test) — low priority if manual QA covers it.

---

## 7. Normalize / rehydrate (audit, do not blindly delete)

- [`normalize.py`](apps/buying/services/normalize.py) `normalize_manifest_row` was shaped for **API** `raw_data`. **`renormalize_manifest_rows`** may still use it for legacy rows in DB.
- **Action:** Trace imports; if only API pipeline called `normalize_manifest_row`, either remove that function **or** keep it **only** for `renormalize_manifest_rows` / one-off maintenance. **Do not** remove CSV path: [`manifest_template.standardize_row`](apps/buying/services/manifest_template.py) / [`manifest_upload.process_manifest_upload`](apps/buying/services/manifest_upload.py).

---

## 8. Workspace / diagnostic artifacts (optional cleanup)

Remove or ignore one-off probe scripts under `workspace/API pipline logs/` (e.g. `_probe_bstock.py`, `_probe_many_auctions.py`, `_tally.py`) if committed; they exist solely to debug the preview API.

---

## 9. Documentation updates

Update at minimum:

- [`.ai/extended/bstock.md`](.ai/extended/bstock.md) — remove `get_manifest` / anonymous manifest pull; state manifests are **CSV upload** (and future manual/automated CSV **storage** is separate from order-process preview).
- [`.ai/extended/backend.md`](.ai/extended/backend.md) — drop pull commands and API pull endpoints from the buying table.
- [`.ai/extended/development.md`](.ai/extended/development.md) / bookmarklet docs — remove `pull_manifests` workflow if referenced.
- [`CHANGELOG.md`](CHANGELOG.md) — entry for removal + breaking change (staff endpoints gone; commands gone).

---

## 10. Explicitly **kept** (not “manifest API”)

- **`POST /upload_manifest/`** — multipart CSV → `ManifestRow` (same as manual file).
- **`DELETE …/manifest/`** — clear rows + valuation.
- **`ManifestRow`**, templates, fast-cat mapping, valuation using DB rows.
- **Sweep / search** — unchanged.
- **Future work (out of scope):** authenticated `listing.bstock.com/.../items/export` → save CSV blob; still **no** row processing via order-process preview.

---

## Verification checklist

- [ ] `rg order-process|iter_manifest_pages|run_api_manifest_pull|manifest_api_pipeline` → clean (or only historical CHANGELOG).
- [ ] Auction list updates `has_manifest` after DELETE without full reload.
- [ ] `pytest` buying tests green.
- [ ] No scheduler calling removed commands.
