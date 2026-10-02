# Nothing is running (updated 2026-10-01, evening)

The local standardize and dedupe pipeline **finished on 2026-10-01**. No background job is running.

**One thing still matters:** the local database now holds work that exists nowhere else yet:
- standardized profiles for 135,005 products (`ProductProfile`, `ProductProposal` batches `cat5-*` / `cat6-*`);
- vectors built from the vector text;
- 32,370 reversible product merges (`CatalogMerge`, method `spark_dedupe`) and 74,181 `DedupeDecision` rows.

**Don't pull production into local** (`scripts/db/pull_prod_to_local.bat`, `scripts/warehouse/nightly.ps1`) until the
owner says so: it would replace all of that. The answers themselves are safe in files (`workspace/standardize/`,
`workspace/dedupe/`), but the applied and merged state would have to be rebuilt (about an hour, no AI cost for
standardize; the merges replay from `DedupeDecision` only if that table is kept).

The pipeline code shipped in v2.119.0 (2026-10-02). The main checkout is still behind `origin/main` (standards row
T55): don't `git add -A` from it; ship other work from a worktree.

Delete this file once the production Requests are staged and the owner allows a fresh pull.
