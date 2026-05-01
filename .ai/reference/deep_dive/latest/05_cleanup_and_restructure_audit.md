# Cleanup And Restructure Audit

## Executive Summary

- **Safe cleanup candidates:** `__pycache__` trees under `apps/inventory/**`; `frontend/dist/**`; Vite prebundles under `frontend/node_modules/.vite/deps/**` — **do not commit**.
- **Needs classification:** Deleted **`workspace/notebooks/ai-cleanup/**`** vs CHANGELOG / steering that still reference it; untracked **`.ai/reference/Rich Manifest Templates/`** (reference data).
- **Restructures worth planning:** None mandatory from this run; prefer **doc alignment** over folder moves.
- **Confidence:** **Medium**

## Generated / Disposable Candidates

| Path | Type | Evidence | Safe to remove? | Approval needed | Notes |
|---|---|---|---:|---:|---|
| `apps/**/__pycache__/` | bytecode | `git status` `??` entries | yes (local) | no | Add/keep ignore |
| `frontend/dist/` | build output | untracked in status | yes | no | CI/build regenerates |
| `frontend/node_modules/.vite/` | dev cache | untracked | yes | no | — |
| `.pytest_cache/` | test cache | seen in git status (truncated) | yes | no | — |

## Duplicate / Stale Reference Candidates

| Path / reference | Duplicate of / replaced by | Evidence | Recommendation | Priority |
|---|---|---|---|---|
| `latest/*.md` removed + `_runs/` archive | Prior deep-dive snapshot | Protocol move + this run recreate | Keep `_runs/`; restore `latest/` | P2 |
| Notebook-based ai-cleanup | `workspace/ai-cleanup-grok/` adjunct? | `git status` `D workspace/notebooks/...` | Update docs to single canonical path | P2 |

## Documentation Restructure Candidates

| Area | Current problem | Proposed structure | Why | Risk |
|---|---|---|---|---|
| Preprocessing | Facts split across CHANGELOG, initiative, `inventory-pipeline`, handoff md | One **“Cleanup CSV contract”** reference page | Faster onboarding | low (additive) |

## Code Restructure Candidates

| Area | Current problem | Proposed structure | Evidence | Risk | Suggested timing |
|---|---|---|---|---|---|
| Review naming (`manual-review` vs `final`) | “Manual” sounds like preprocessing step 3 | Optional alias route or doc rename only | UI step: **Final Review** | low | **only if touched** |
| `_upload_cleanup_csv_impl` size | Large single method | Extract validators / persistence | readability | medium | later |

## Removal Safety Notes

- **Secrets / env files:** Do not touch `.env`; `.env.example` is fair game for coordination only.
- **User reference assets:** `.ai/reference/Rich Manifest Templates/` — treat as curated samples; do not bulk-delete without owner.
- **Generated build artifacts:** Exclude from VCS via `.gitignore` if not already.

## Notes For `PLAN.md`

- **DEL-001** — confirm notebook tree intentional deletion; update CHANGELOG docs bullet — source: Duplicate / Stale table
- **SAFE-001** — ensure `__pycache__`/dist not staged — source: Generated candidates
