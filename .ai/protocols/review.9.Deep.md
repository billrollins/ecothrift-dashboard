<!-- Last updated: 2026-05-18 (no consultant_context; PreprocessingRow on PO) -->
# Protocol: Deep Research - Update All Context

Exhaustive repo + AI-steering audit. Use when the user asks for **deep research**, **update all context**, **full context refresh**, or a broad documentation / initiative / changelog integrity pass.

This protocol is **AI-readable**: dense instructions, little narrative. Human-readable findings live in generated reports under **`.ai/reference/deep_dive/latest/`** using templates from **`.ai/reference/deep_dive/_report-templates/`**.

---

## Scope

Audit and report on:

- Full codebase structure and shipped behavior
- **Preprocessing pipeline** (see [Domain focus: preprocessing through Final Review](#domain-focus-preprocessing-through-final-review) below) — treat as first-class: drift here breaks manifest → AI → staging → review.
- `.ai/context.md`, `.ai/README.md`
- `.ai/extended/*.md`
- `.ai/initiatives/_index.md`, active initiatives, archive buckets
- `.version`, root `package.json`, root `CHANGELOG.md`
- README / onboarding / protocol discoverability
- Generated debris, stale references, duplicate docs, likely removals

Deliverables:

- Fresh human-readable report set in **`.ai/reference/deep_dive/latest/`**
- Machine-actionable **`.ai/reference/deep_dive/latest/PLAN.md`**
- No code, docs, initiative moves, version bumps, or deletes unless the user explicitly approves the plan or asks for direct execution

---

## Domain focus: preprocessing through Final Review

When running this protocol, **actively trace** the end-to-end path below in `01_codebase_inventory.md` and cross-check steering docs (`context`, `extended`, initiatives). Surface mismatches between docs and code (columns, endpoints, validation rules, UI step names).

### Flow (conceptual)

```text
Purchase order manifest / staging
  → PreprocessingRow on PurchaseOrder (standard_* / ai_* / final_* layers, economics)
  → download-cleanup-csv (Step 2 input for offline tools)
  → Grok helper (workspace/ai-cleanup-grok): single <stem>.cleaned.csv, per-row ai_status JSON
  → POST upload-cleanup-csv / apply-cleanup-csv → PreprocessingRow.ai_* + ai_status
  → Final Review UI (triple-layer fields, finalize to ManifestRow)
```

### Backend (Django)

| Concern | Where to look |
|--------|----------------|
| Models: staging rows, `standard_*` / `ai_*` / `final_*`, `ai_status` | `apps/inventory/models.py` — `PreprocessingRow` (linked on `PurchaseOrder`; `PreprocessingOrder` removed in migration `0047`) |
| Download CSV for cleanup | `PurchaseOrderViewSet.download_cleanup_csv` — `apps/inventory/views.py` |
| Upload cleaned CSV / JSON rows | `_upload_cleanup_csv_impl`, `upload_cleanup_csv`, `apply_cleanup_csv` — `apps/inventory/views.py`; helpers `_parse_cleanup_csv_upload`, `parse_ai_cleanup_suggestions` |
| Row validation (blocking vs quality for wide import) | `apps/inventory/cleanup_csv_validate.py` — `validate_cleanup_row_values` (`block_on_quality` / staging-wide looseness) |
| Serializers for review API | `PreprocessingReviewRowSerializer` — `apps/inventory/serializers.py` (`ai_status` and layers) |
| Tests | `apps/inventory/tests/test_preprocessing_redesign.py` |

### Offline Grok cleanup

| Concern | Where to look |
|--------|----------------|
| Batch loop, validation, retries, **single output** `.cleaned.csv` | `workspace/ai-cleanup-grok/helpers/clean-grok.mjs` |
| Deterministic recovery + `ai_status.state` | `workspace/ai-cleanup-grok/helpers/recover-row.mjs` (+ `recover-row.test.mjs`) |
| Tool schema / examples | `MANIFEST_CLEANUP_JSON_SCHEMA`, `--validate-examples`, `prompts/examples.json`, `prompts/vendors/*.json` |
| System prompt | `workspace/ai-cleanup-grok/prompts/system-prompt.txt` |
| Input/output contract | Documented in `clean-grok.mjs` file header + repo `.ai/reference/cleanup_csv_contract.md` if present |

### Frontend

| Concern | Where to look |
|--------|----------------|
| Preprocessing / AI Cleanup / review UX | `frontend/src/pages/inventory/PreprocessingPage.tsx` (and related components under `frontend/src/components/inventory/`) |
| API types | `frontend/src/api/inventory.api.ts` — `PreprocessingReviewRow`, upload cleanup helpers |

### Initiatives / extended docs

- Reconcile with `.ai/extended/inventory-pipeline.md`, `.ai/initiatives/*order_processing*`, and any manifest-standardization notes.
- Call out when **CHANGELOG** or user-facing copy still mention `failures.csv` / `warnings.csv` if the Grok helper only emits `.cleaned.csv`.

### Report expectations

In **`01_codebase_inventory.md`**: include a **subsection** (or table) that maps the steps above to concrete routes, serializer fields, and CSV columns — especially `ai_status` shape and upload blocking rules.

In **`02_context_and_extended_audit.md`**: flag steering text that omits `ai_status`, Final Review gating (`hard_flagged` vs `soft_flagged`), or the upload path.

---

## Preconditions

1. Run **`code.0.Startup.md` steps 1-5** only enough to understand current steering structure. Do **not** create a normal feature-session entry unless the user also wants implementation.
2. Check git status. Treat uncommitted work as user-owned unless you made it in this run.
3. If any command would hit B-Stock live API, stop and apply the B-Stock API call-count rule. This protocol should normally use local files and local DB only.
4. If report templates are missing, stop and create / ask for templates before running the audit. Do not improvise report shapes when templates exist or are expected.

---

## Output Layout

Canonical folder:

```text
.ai/reference/deep_dive/
|-- _report-templates/
`-- latest/
    |-- 00_run_summary.md
    |-- 01_codebase_inventory.md
    |-- 02_context_and_extended_audit.md
    |-- 03_initiatives_audit.md
    |-- 04_version_changelog_audit.md
    |-- 05_cleanup_and_restructure_audit.md
    `-- PLAN.md
```

Before writing a new run:

- If **`latest/`** exists, move it to **`.ai/reference/deep_dive/_runs/<YYYY-MM-DDTHHMMSS>/`** or delete it only when the user explicitly wants old deep-dive reports discarded.
- Create a clean **`latest/`**. Do not merge old and new report files.
- Keep **`_report-templates/`** stable; edit templates only when the user asks to change reporting requirements.

---

## Part 1 - Evidence Collection

Collect facts before writing conclusions.

Required reads:

- Root: `.version`, `package.json`, `CHANGELOG.md`, `README.md`, `.gitignore`
- AI steering: `.ai/context.md`, `.ai/README.md`, `.ai/protocols/*.md`
- Extended: every `.ai/extended/*.md`
- Initiatives: `.ai/initiatives/_index.md`, every active `.ai/initiatives/*.md`, `.ai/initiatives/_archived/ARCHIVE.md`, every archived initiative TOC row needed to verify buckets
- Report templates: `.ai/reference/deep_dive/_report-templates/*.md`

Required repo scans:

- File tree by major area: `apps/`, `frontend/src/`, `ecothrift/`, `scripts/`, `printserver/`, `workspace/` whitelist, `.ai/`
- Backend routes/models/serializers/views/management commands/migrations by Django app
- Frontend routes/pages/api hooks/types/components by domain
- Test files and obvious coverage gaps
- Generated debris: `__pycache__`, `.pyc`, build output, temp logs, zip files, duplicate generated assets
- Stale references: paths mentioned in AI docs that no longer exist; files that exist but are not listed in TOCs where expected

Optional reads when useful:

- **Preprocessing / cleanup:** `.ai/reference/cleanup_csv_contract.md`, `.ai/extended/inventory-pipeline.md`, `workspace/ai-cleanup-grok/helpers/clean-grok.mjs` (input/CSV contract in header comment), initiative docs on order processing / preprocessing redesign
- Recent git history for shipped themes
- Local DB schema inspection only if a doc/code mismatch cannot be settled from files
- Terminal snapshots only if dev-server state affects audit evidence

---

## Part 2 - Reports

Create the reports from templates exactly:

| Report | Template | Purpose |
|---|---|---|
| `00_run_summary.md` | `00_run_summary.template.md` | Executive summary, confidence, top risks, recommended next actions |
| `01_codebase_inventory.md` | `01_codebase_inventory.template.md` | Current codebase map, domain surfaces, shipped behavior, tests |
| `02_context_and_extended_audit.md` | `02_context_and_extended_audit.template.md` | Drift in `context`, extended docs, protocol discoverability |
| `03_initiatives_audit.md` | `03_initiatives_audit.template.md` | Active/archive initiative health and recommended dispositions |
| `04_version_changelog_audit.md` | `04_version_changelog_audit.template.md` | `.version`, `package.json`, `CHANGELOG`, release traceability |
| `05_cleanup_and_restructure_audit.md` | `05_cleanup_and_restructure_audit.template.md` | File removals, restructuring, generated debris, duplicate/stale references |

Report style:

- Human-readable, not chatty
- Executive summary at top
- Tables, bullets, lists, checklists
- Short notes explaining **why** only when useful
- Cite files and symbols; avoid huge paragraphs
- Separate fact, risk, and recommendation
- Mark confidence: `High`, `Medium`, `Low`

---

## Part 3 - Plan File

Create **`.ai/reference/deep_dive/latest/PLAN.md`** after all reports.

Plan is AI-actionable. It must be organized into these sections:

1. **Immediate Safe Updates** - docs or indexes that can be updated with low risk
2. **Context / Extended Updates** - exact files, exact facts to change, source report refs
3. **Initiative Dispositions** - active, pending, backlog, completed, abandoned recommendations; include lifecycle protocol to use; do not move without user approval
4. **Version / Changelog Updates** - required release metadata fixes; bump recommendation only if semver evidence is clear
5. **File Removals** - generated debris, stale artifacts, duplicate outputs; include delete safety notes
6. **Restructures Needed** - doc tree or code organization changes; split mechanical vs design decisions
7. **Follow-up Research** - unresolved questions and exact evidence needed
8. **Execution Order** - numbered low-risk sequence for the next agent

Each plan item must include:

- `id`
- `priority`: `P0`, `P1`, `P2`, `P3`
- `action`
- `files`
- `reason`
- `source_report`
- `requires_user_approval`: `yes/no`
- `acceptance_check`

---

## Part 4 - Decision Rules

Context updates:

- Update recommendations only when repo evidence contradicts AI docs or TOCs.
- Prefer small factual edits over style rewrites.
- If an extended file is obsolete, recommend merge / archive / delete in plan; do not perform silently.

Initiatives:

- If active work appears complete, recommend **`move_initiative_to_completed`**.
- If active work is paused but should stay visible, recommend **On hold in root index**.
- If paused and should leave main index, recommend **`move_initiative_to_pending`**.
- If future / not-started clutter, recommend **`move_initiative_to_backlog`**.
- If superseded or intentionally dropped, recommend **`move_initiative_to_abandoned`**.
- Initiative moves require explicit user approval, then use `.ai/initiatives/_archived/_protocols/`.

Version / changelog:

- Verify `.version` equals root `package.json` version with `v` stripped.
- Verify top `CHANGELOG.md` release matches `.version`, unless `[Unreleased]` intentionally holds new work.
- Do not bump for steering-only deep-dive reports.
- Recommend a bump only when shipped user-visible/API behavior exists and can be tied to initiative or hotfix scope.

File removals:

- Treat `__pycache__`, `.pyc`, generated `frontend/dist`, local zips, temp logs, and duplicated generated assets as removal candidates.
- Never delete secrets, DB dumps, or user-created reference assets without explicit approval.
- For ambiguous files, plan item says **needs classification**, not delete.

---

## Exit Criteria

- `latest/` contains all required reports and `PLAN.md`.
- Every report starts with an executive summary.
- Every plan item has `id`, priority, files, reason, source report, approval flag, acceptance check.
- Reports distinguish evidence from recommendation.
- No initiative files were moved and no version was bumped unless separately approved by the user.
- Final response gives the report folder, top 3 findings, and the next recommended execution step.

---

## Relationship to Other Protocols

| Protocol | Role vs this one |
|---|---|
| `code.0.Startup.md` | Normal session context load; this protocol uses only enough startup to orient |
| `code.1.Bearing.md` | Short mid-session compass; this protocol is a full audit |
| `review.0.Bump.md` | Scoped docs/version/changelog pass; this protocol produces reports and a plan before edits |
| `code.9.Push.md` | Bump checklist + **`commit_message.txt`** + **`2_push_github.bat`** — unrelated to audit deliverables |
| `session.1.Checkpoint.md` | Work-session pulse; not used for deep audit reports |
| `session.9.Close.md` | Commit/release/session-result gate after approved plan execution |
| `.ai/initiatives/_archived/_protocols/*` | Required only after user approves initiative disposition changes |

