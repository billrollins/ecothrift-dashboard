# Nothing is running (updated 2026-10-02, 14:15 CT)

The standardize and dedupe results are **in production** since 2026-10-02 (Requests #5 and #6, vectors pushed from
this PC; `.ai/extended/backfill-plan.md` § Production load in the `intake-standard` worktree / `origin/main`).

**A fresh pull of production into local is allowed again**, once the owner says go. It replaces the local database.
What a pull loses, all of it rebuildable or kept in files: the local `ProductProposal` batches (`cat5-*`, `cat6-*`;
the answers are in `workspace/standardize/`).

Tonight: the shared database is attached (T31), then master switches its plan. No pull, load or deploy during that.

The main checkout is still behind `origin/main` (standards row T55): don't `git add -A` from it; ship other work from a
worktree (today's ships came from `C:\Coding\ecothrift-intake`, branch `intake-standard`).

Delete this file after the next pull.
