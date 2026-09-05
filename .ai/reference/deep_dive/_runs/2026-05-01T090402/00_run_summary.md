# Deep Dive Run Summary

## Executive Summary

| Field | Value |
|---|---|
| Run date | 2026-05-01 |
| Auditor | Agent (Composer), protocol `review.9.Deep.md` |
| Repo version | `v2.20.0` (`.version`) |
| Git state | **Dirty** — **`main` ahead of `origin/main` and `heroku/main` by 10 commits** (same SHA on both remotes after `git fetch`); modified/untracked include `.ai/` reference + protocol files; see **Deployment / prod gap** below |
| Overall confidence | **Medium** — code paths for upload → review → finalize were traced in `apps/inventory/views.py` and `layer_helpers.py`; steering doc drift is visible without a full `consultant_context.md` line-by-line diff |

## Deployment / prod gap (GitHub, Heroku, DB)

**How far from “live”:** Remotes **`origin/main`** (GitHub) and **`heroku/main`** are **the same commit** (`0366537…` as of this run). Your **local `main` is 10 commits ahead** of both — nothing is on GitHub/Heroku that you do not have locally; the gap is **unpushed local commits** plus any **uncommitted** changes.

| Action | What it does | Touches prod DB? |
|--------|----------------|------------------|
| **`git commit`** | Records staged snapshot in local repo only | No |
| **`git push origin main`** | Updates GitHub; Heroku does **not** auto-deploy from GitHub in this setup | No |
| **`git push heroku main`** (or `scripts/deploy/3_push_heroku.bat`) | Heroku build: root **`npm run heroku-postbuild`** (Vite build), collect static, then **`release:`** phase | **Yes** — see below |
| **Heroku `release:`** ([`Procfile`](../../../../Procfile)) | `python manage.py migrate && python manage.py createcachetable` against **`DATABASE_URL`** | **Yes** — schema/migrations + cache table |
| **App `web` dyno** | `gunicorn ecothrift.wsgi` with **`DJANGO_SETTINGS_MODULE=ecothrift.settings_production`** (see [`.ai/extended/development.md`](../../../extended/development.md)) — DB via `dj_database_url`, `search_path=ecothrift` ([`settings_production.py`](../../../../ecothrift/settings_production.py)) | Read/write at runtime only (no extra migrate) |
| **Data backfills / one-offs** | e.g. `manage.py recompute_all_item_costs`, category stats, imports — run via **Heroku Scheduler**, **`heroku run`**, or locally with **`--database production`** when **`PROD_DATABASE_*`** is set | **Yes** when aimed at production |

**Scripts (repo):** `scripts/deploy/2_push_github.bat` → `git add .`, `commit -F commit_message.txt`, `push origin main`. `4_deploy_careful.bat` → optional `1_backup_prod.bat`, then GitHub, then Heroku. `5_deploy_yolo.bat` → GitHub then Heroku with no prompts. **`0_pull_prod_to_local.bat`** copies **production `ecothrift` schema** into local **`ecothrift_v3`** (destructive to local `ecothrift` schema).

**Confidence:** **High** for remote parity (same ref on `origin` and `heroku`); **Medium** for “what the 10 local commits contain” without a per-commit review in this run.

## Preprocessing path (post–AI cleanup upload → final review)

This run stressed the wire drawn in code (not the offline Grok runner):

1. **`POST …/apply-cleanup-csv/`** (alias **`upload-cleanup-csv`**) — [`_upload_cleanup_csv_impl`](../../../../apps/inventory/views.py) builds per-row payloads after **`validate_cleanup_row_values`** ([`cleanup_csv_validate.py`](../../../../apps/inventory/cleanup_csv_validate.py)). **Staging-wide** rows use **`block_on_quality=False`**: most quality **`HARD_*`** checks are folded into **`soft_warnings`** instead of **`400`**; invalid JSON in required blob cells / **`ai_status`** still rejects. Narrow apply keeps strict hard gates. Staging writes target **`ai_*`** / **`ai_title`**, optional **`ai_status`**, and related fields on **`PreprocessingRow`**.
2. **`GET/PATCH …/preprocessing-review/`** — Review listing and paged search; PATCH goes through **`update_preprocessing_review_rows`** ([`views.py`](../../../../apps/inventory/views.py) ~475–560), mapping staff fields (e.g. **`description`**) onto **`ai_description`**, **`title` → `ai_title`**, condition via **`normalize_cleanup_condition`**, plus **`proposed_price`** / **`final_price`** on the staging row.
3. **`POST …/finalize-preprocessing/`** — Optional last PATCH from **`rows`**; then for each staging row, **`effective_preprocessing_row_price`** and title/description checks; **`snapshot_finalize_from_ai_and_standard`** ([`layer_helpers.py`](../../../../apps/inventory/layer_helpers.py) ~133–153) fills **`final_*`**; bulk update; **`ManifestRow.objects.filter(purchase_order=order).delete()`** and **`bulk_create`** new rows from **`final_*`**; product/item/batch follow-up in the same transaction tail.

UI step 3 label (**Final Review**) lives in [`PREPROCESSING_STEP_LABELS`](../../../../frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx).

## Top Findings

| Priority | Finding | Why it matters | Evidence | Recommended action |
|---|---|---|---|---|
| P1 | **Finalize is the single promotion gate** for staging → canonical manifest | Staff errors in AI layer are coalesced into `final_*` only here; validation blocks finalize without price and without title/description | `finalize_preprocessing` + `snapshot_finalize_from_ai_and_standard` ([`views.py`](../../../../apps/inventory/views.py) ~4162–4230; [`layer_helpers.py`](../../../../apps/inventory/layer_helpers.py) ~133–153) | Keep E2E tests aligned with `missing_price` / `missing_title_or_description`; document in `inventory-pipeline.md` |
| P1 | **Apply-cleanup-csv** distinguishes **wide** (JSON cells + optional title aliases + **`ai_status`**) vs **narrow** rows and validates before any DB write | Wide staging: many **`HARD_*`** become **`soft_warnings`**; narrow: full **`rejected_rows`** hard gates | `_upload_cleanup_csv_impl` ([`views.py`](../../../../apps/inventory/views.py) ~3442–3634) + `validate_cleanup_row_values` ([`cleanup_csv_validate.py`](../../../../apps/inventory/cleanup_csv_validate.py)) | **`cleanup_csv_contract.md`** + **`inventory-pipeline.md`** |
| P2 | Initiative rollup vs UI | **Resolved:** Progress table lists **Preprocessing** **Shipped (core)** with Step 3 **Final Review** | [`order_processing_pipeline_rebuild.md`](../../../initiatives/order_processing_pipeline_rebuild.md) | — |
| P2 | **`CHANGELOG` notebook path narrative** | **Removed** tree noted as historical; docs point to handoff + **`cleanup_csv_contract.md`** | [`CHANGELOG.md`](../../../../CHANGELOG.md) [Unreleased] | Keep in sync on future moves |
| P3 | **Dual review surfaces**: `preprocessing-review` (staging) vs `manual-review` (canonical `ManifestRow`) | After finalize, staff must use canonical APIs/UIs; pre-finalize editing is `ai_*`/`standard_*` / snapshots | [`views.py`](../../../../apps/inventory/views.py) `preprocessing_review` ~3959; `manual_review` ~4030 |

## Report Index

| Report | Status | Notes |
|---|---|---|
| `01_codebase_inventory.md` | complete | Backend + FE inventory; preprocessing modules called out |
| `02_context_and_extended_audit.md` | complete | TOC parity 15↔15; **2026-05-01** steering pass noted in file |
| `03_initiatives_audit.md` | complete | Active initiative vs shipped stepper |
| `04_version_changelog_audit.md` | complete | `.version` / root `package.json` aligned; rich `[Unreleased]` |
| `05_cleanup_and_restructure_audit.md` | complete | Build artifacts + notebook path churn |
| `PLAN.md` | complete | Action rows with approval flags |

## Cross-Cutting Risks

- **Steering vs product drift** — **reduced** after **2026-05-01** doc pass (`cleanup_csv_contract`, pipeline, initiative, frontend context); residual risk: mockups / legacy spec files still say **Manual Review** in places.
- **Changelog vs tree** — **[Unreleased]** documents removed **`workspace/notebooks/ai-cleanup/`** as historical; confidence: **Low** concern if links stay explicit.
- **Finalize validation** — strict price + title/description rules can block go-live until review patches land; confidence: **Low** (by design)

## Recommended Next Step

1. ~~Initiative Progress / Step 3~~ — aligned (**Final Review**, wide vs narrow + contract).
2. Keep **`CHANGELOG` [Unreleased]** Documentation bullets synced when **`cleanup_csv_contract.md`** changes.
3. Optional: extend **`test_preprocessing_redesign`** with wide CSV **`ai_status`** + relaxed-validation cases.

## Evidence Gaps

| Gap | Why unresolved | Follow-up needed |
|---|---|---|
| Full **`consultant_context.md`** diff vs `context.md` TOC | Time-bounded run | Line-by-line TOC parity check per maintenance rule |
| Runtime verification (upload CSV against staging PO) | No local DB fixture in this run | Manual QA or integration test with real Grok export |
| **`ARCHIVE.md` exact row count** vs disk | Spot-checked 16↔16 only | Re-run if files added under `_archived/_completed` |
