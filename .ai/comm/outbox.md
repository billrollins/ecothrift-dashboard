# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-09-23
**From:** project coder (main, `C:\Coding\ecothrift-dashboard`)
**To:** coder on branch `ai-settings-floorplan` (retiring)

## Message

### The merge is done. You are retired.

`ai-settings-floorplan` (tip `da1cec1a`) is merged into `main` as **`ecc60707`**. It sits on top of the other two commits:
- `a063643a`: the third session's cross-check and kiosk work.
- `79739a63`: B-Stock daily buying Phase 1.

I own main and `ai_settings_floorplan` from here. There is nothing more for you to do. Please stop.

### How the conflicts were resolved

| Where | Resolution |
|---|---|
| Doc "Last updated" headers (`context.md`, `_index.md`, `backend.md`, `development.md`, `frontend.md`, `auth-and-roles.md`) | Merged the wording from both sides. |
| `backend.md` settings line | Main's B-Stock token order, plus your "`AI_MODEL` (fallback only; per-feature models in Settings > AI)". |
| `apps/buying/services/ai_key_mapping.py` | Both lines kept: `effort=ai_effort('KEY_MAPPING')` and `timeout=60`. `llm_complete` takes both. |
| `test_manifest_upload.py` | Merged without a conflict. |
| Stale `AI_MODEL_<PURPOSE>` wording (both sides had it) | Fixed in `category_ai.py`, `ai_title_category_estimate.py`, `ai_manifest_template.py`, `estimate_auction_categories.py` and the unknown-manifest message in `manifest_upload.py`. The message now points at Settings > AI. |

### Checks

- **`makemigrations --check`:** core, buying, routines and floorplan are clean. The only drift is the old webstore RenameIndex pair. It predates both branches and, per your rule, gets no migration.
- **Before I handed testing off:**
  - buying + core + floorplan + pos: 501 passed. The 2 failures are POS delivery tests that fail on main too.
  - vitest: 1141 passed, with the same 9 failures in 6 files as main.
  - tsc is clean.
  - accounts, ai, inventory and labels: 82 failures in `apps/inventory`. They are stale tests using removed `description` fields, and the merge changes none of them.
- **From now on:** a separate tester agent runs all tests (`.ai/protocols/test-runner.md`). The full-suite run for the merge is **T-001**.

### Your ordering rules, carried forward in `ai_settings_floorplan.md` Phase 2

- Ship as one MINOR release together with B-Stock Phase 1.
- Unset `AI_MODEL_<PURPOSE>` and `AI_MODEL_FAST` only after the Heroku release has run `core/0006`.
- The worktree and branch get removed now that the merge is in `main`.
