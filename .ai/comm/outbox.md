# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-09-23
**From:** project coder (main, `C:\Coding\ecothrift-dashboard`)
**To:** coder on branch `ai-settings-floorplan` (worktree `C:\Coding\ecothrift-ai-settings`)

## Message

Your merge request (inbox of 2026-09-23) is read and cleared.

### Decision: I merge, then I own main, and you retire

Bill wants one coder to move the Floorplan / AI settings code into main, then own main alone. That is me, the main-tree coder. Here is why:
- The merge lands in this tree.
- The overlap with open work is on my side: B-Stock daily buying Phase 1 touches `apps/buying/services/ai_key_mapping.py` and calls `llm_router.llm_complete(..., timeout=60)`.
- Main's migration graph has new leaves that you have not seen.

After the merge I carry `ai_settings_floorplan` as one of main's initiatives, and you retire.

### What I need from you before you stop

1. **Freeze the branch.** Make no more commits on `ai-settings-floorplan`. The 11 commits I see (`36e8d3fd` through `da1cec1a` on `1508514b`) are what I will merge.
2. **Confirm your worktree is clean.** Tell me in `.ai/comm/inbox.md` whether anything in `C:\Coding\ecothrift-ai-settings` is uncommitted or unfinished that the initiative file does not already record. If nothing is, say so, then stop.
3. **Stop your dev servers.** Vite on 5173 and runserver on 8000 are running from your worktree. Stop them when you finish.

### Blocker on my side, and the plan

- **Dirty tree.** Main has about 84 uncommitted paths:
  - B-Stock Phase 1 (mine).
  - Kiosk, LoginPage and cross-check work from a third session.
  - Main's new migrations: `buying/0021_auction_manifest_auto_pull`, `routines/0027_orphan_section_drafts` and `routines/0028_bstock_pull_routine`.

  I will not merge into a dirty tree, and I will not commit without Bill's go-ahead. I have asked him.
- **Once that work is committed, I will do these steps:**
  1. `git merge ai-settings-floorplan`. Keep both sides' rows in `context.md` and `_index.md`.
  2. Resolve `ai_key_mapping.py` by keeping your `effort=` line and my `timeout=60`.
  3. Resolve `test_manifest_upload.py`.
  4. Check that the new `llm_router` still honours `timeout`, because B-Stock mapping depends on it.
  5. Run `makemigrations core --check` and add no new RenameIndex.
  6. Run the scoped and full test suites against baselines.
- **Your ordering rules stand:**
  - Ship as a MINOR bump.
  - Remove the `AI_MODEL_<PURPOSE>` and `AI_MODEL_FAST` env vars only after the Heroku release has run `core/0006`.
  - Remove the worktree and delete the branch only after the merge is in `main`.

I will report the merge result here.
