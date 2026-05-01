# Cleanup And Restructure Audit

## Executive Summary

- **Safe cleanup candidates:** Add missing **`ARCHIVE.md`** rows (documentation fix); fix **broken initiative links** in a few steering files (no binary removal).
- **Needs classification:** `.ai/reference/Mockups/files.zip` (untracked); new mock/spec JSX+MD under `.ai/reference/Mockups/` — likely intentional design refs.
- **Restructures:** **Duplicate** `.ai/initiatives/_protocols/` vs `.ai/initiatives/_archived/_protocols/` — pick one canonical set to reduce drift.
- **Confidence:** **High** for identified debris; **Medium** for “all zip/binary artifacts” without listing entire tree.

## Generated / Disposable Candidates

| Path | Type | Evidence | Safe to remove? | Approval needed | Notes |
|---|---|---|---:|---:|---|
| `frontend/dist/` | build output | `.gitignore` line 20 | yes (if present locally) | no | Not tracked |
| `**/__pycache__` | bytecode | `.gitignore` | yes | no | Standard |
| `.ai/reference/Mockups/files.zip` | zip artifact | `git status` untracked | **unknown** | **yes** | May be packaging of mockups; confirm with owner |

## Duplicate / Stale Reference Candidates

| Path / reference | Duplicate of / replaced by | Evidence | Recommendation | Priority |
|---|---|---|---|---|
| Initiative link `…/initiatives/bstock_auction_intelligence.md` | Archived file under `_completed/` | ripgrep hits | Update hrefs | P1 |
| `.ai/initiatives/_protocols/` | Same filenames as `_archived/_protocols/` | both trees list 6 protocols + README | Single source of truth | P2 |
| Dual path display in glob (`e:\...` vs `e:/...`) | cosmetic / OS | Tool output only | ignore | — |

## Documentation Restructure Candidates

| Area | Current problem | Proposed structure | Why | Risk |
|---|---|---|---|---|
| Deep dive reports | Only discoverable via protocol | Optional link in `README` AI table | Faster onboarding | low |
| Initiative archive TOC | Two files missing from `_completed` table | Add rows | Trust | low |

## Code Restructure Candidates

| Area | Current problem | Proposed structure | Evidence | Risk | Suggested timing |
|---|---|---|---|---|---|
| Inventory preprocessing components | Growing subtree | None urgent | `frontend/src/components/inventory/preprocessing/` | low | only if import cycles hurt |
| Duplicate protocol MD | Drift risk | One folder + README pointer | Two identical dirs | medium | next hygiene PR |

## Removal Safety Notes

- **Secrets / env:** Do not touch `.env` (gitignored).
- **DB dumps:** None identified in audit scope.
- **User reference assets:** `.ai/reference/Mockups/**` — treat as product/design unless user says temporary.
- **Build artifacts:** `frontend/dist/` gitignored — safe to delete locally for clean build.

## Notes For `PLAN.md`

- `DEL-001`: `files.zip` classification
- `STRUCT-001`: protocol deduplication
- `CTX-*`: link repairs
