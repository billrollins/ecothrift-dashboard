# Deep Dive Run Summary

<!-- Generated: 2026-05-01T12:00:00-05:00 — protocol: `.ai/protocols/review.9.Deep.md` -->

## Scope And Objective

- **Goal:** Steering-grade snapshot of the Eco-Thrift Dashboard codebase with emphasis on **preprocessing → Final Review → Item Processor**, plus repo hygiene, initiatives, versioning, and documentation alignment.
- **Method:** Read protocol + templates; sampled `.ai/context.md`, `.ai/consultant_context.md` (extended TOC), `.ai/initiatives/_index.md` + `ARCHIVE.md`; inspected `CHANGELOG.md` header; enumerated Django apps, migrations, tests; grepped `PurchaseOrderViewSet` custom actions in `apps/inventory/views.py`; verified `.version` / root `package.json` / `frontend/package.json`.

## Inputs Consulted

| Input | Purpose |
|-------|---------|
| `.ai/protocols/review.9.Deep.md` | Deliverables, preprocessing trace requirements, exit criteria |
| `.ai/reference/deep_dive/_report-templates/*.template.md` | Report structure for `00`–`05` and `PLAN.md` |
| `.ai/context.md` | Canonical AI orientation; extended TOC; known gaps |
| `.ai/consultant_context.md` § Extended docs TOC | Cross-check steering parity |
| `.ai/initiatives/_index.md`, `_archived/ARCHIVE.md` | Active vs archived initiatives |
| `README.md` (header) | Public-facing stack summary |
| `CHANGELOG.md` (`[Unreleased]` + `[2.20.0]`) | Shipped vs unreleased narrative |
| `ecothrift/settings.py` `INSTALLED_APPS` | Authoritative app list |
| `apps/*/migrations`, `apps/*/tests` | Migration pressure and test coverage footprint |

## Outputs (This Run)

| Artifact | Path |
|----------|------|
| Codebase inventory | `.ai/reference/deep_dive/latest/01_codebase_inventory.md` |
| Context / extended audit | `.ai/reference/deep_dive/latest/02_context_and_extended_audit.md` |
| Initiatives audit | `.ai/reference/deep_dive/latest/03_initiatives_audit.md` |
| Version / changelog audit | `.ai/reference/deep_dive/latest/04_version_changelog_audit.md` |
| Cleanup / restructure audit | `.ai/reference/deep_dive/latest/05_cleanup_and_restructure_audit.md` |
| Execution plan | `.ai/reference/deep_dive/latest/PLAN.md` |

## Archive / Prior Runs

- Prior **`latest/`** content was rotated into **`_runs/`** (see sibling folders under `.ai/reference/deep_dive/_runs/`) per protocol; this **`latest/`** folder now holds the fresh run only.

## Repo State Note (Sampling Point)

- **`git status`** at audit time showed **`main` ahead of `origin/main` by 1** with modified inventory backend/frontend, extended docs, initiative file, `CHANGELOG.md`, and deleted prior deep-dive files under `latest/` (superseded by this run). Treat as **WIP / pre-push** until the user commits and pushes intentionally.

## Confidence

**High** for stack, app inventory, initiative index vs archive file counts, version triple alignment (`.version` / root `package.json` / `[2.20.0]`). **Medium** for line-level correctness of every unreleased bullet vs working tree (CHANGELOG moves faster than static audits).

## Top Findings (Executive)

1. **Inventory inbound surface area is large and centralized:** `PurchaseOrderViewSet` exposes dozens of nested actions (preprocessing, cleanup CSV, review, finalize, processing workspace, legacy M3 paths). Primary implementation file: `apps/inventory/views.py` (see inventory report for representative paths).
2. **`[Unreleased]` is carrying substantial shipped narrative:** Item Processor workspace APIs/UI, Grok/`AI_PROVIDER` plumbing, preprocessing staging refinements, and Final Review UI plans coexist in one section — release slicing will need explicit user approval (`session.9.Close.md`).
3. **Test coverage is uneven:** Strong pockets under `apps/inventory/tests`, `apps/buying/tests`, `apps/pos/tests`; **accounts, core, hr, consignment, ai** have little or no mirrored `tests/` packages in this snapshot.
