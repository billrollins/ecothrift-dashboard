<!-- Last updated: 2026-03-24T23:45:00-06:00 -->
<!-- Retired with `.ai/initiatives/_index.md` — initiatives backlog no longer active; this file is historical only. -->
# Plan: Codebase organization

**Status: retired (2026-03-24).** Was completed same day; moved here when all plans were retired.

Bring the repo to a **clean, navigable, contributor-friendly** layout: one obvious place for each kind of asset, no accidental commits of generated or local-only files, and `.ai/` / `workspace/` aligned with how the app actually runs.

---

## Goals

1. **Repo hygiene** — `venv/`, `__pycache__/`, editor checkpoints, and local secrets stay out of version control; `.gitignore` matches real workflows (Windows + dev notebooks).
2. **Single source of truth** — `.ai/` for AI-oriented steering; `workspace/` for local scratch; avoid duplicate divergent copies.
3. **Predictable structure** — Backend apps, frontend `src/`, `scripts/`, and `workspace/` (notebooks, experiments) have clear roles; no “mystery” top-level clutter.
4. **Low-risk execution** — Organize in small PR-sized steps; no behavior change unless a move requires import path updates (do those in the same change).

---

## Phase 1 — Git and generated artifacts — **done**

- `.gitignore`: added global `.ipynb_checkpoints/`; clarified workspace block comment; whitelisted `workspace/notebooks/requirements-notebooks.txt`; ignored `workspace/notebooks/__pycache__/`.
- **Deferred:** physical `backend/` move — documented as “no separate folder” in `.ai/extended/development.md` / `README.md`.
- **Duplicate `.ai` paths:** On Windows, `\` and `/` refer to the same tree; no duplicate files to remove in git. Ongoing churn is handled by normal commits under `.ai/`.

---

## Phase 2 — Documentation map — **done**

- `README.md` — Project structure updated (`printserver/`, seven apps including `ai`, backend = `manage.py` + `ecothrift/` + `apps/`, print server install path note).
- `.ai/extended/development.md` — **Repository layout** table (backend vs frontend vs `.ai/` vs `workspace/` vs scripts vs notebooks); root `package.json` explained; print server source vs `%LOCALAPPDATA%`.
- `workspace/notes/context-dump/OVERVIEW.md` — Print server note aligned with repo-root `printserver/`.

---

## Phase 3 — Backend layout — **done (inventory only)**

| App | Role (high level) |
|-----|-------------------|
| `apps.accounts` | Auth, users, roles |
| `apps.core` | Shared models, settings, print server releases |
| `apps.hr` | Time, employees |
| `apps.inventory` | Orders, items, retag v2, ML-related commands |
| `apps.pos` | Terminal, drawers, cash |
| `apps.consignment` | Consignees, items, payouts |
| `apps.ai` | AI endpoints |

Largest surface areas for future splits (if ever): `inventory`, `pos`. Management commands stay per-app.

---

## Phase 4 — Frontend layout — **done (convention documented)**

- `.ai/extended/development.md`: pages under `frontend/src/pages/`, shared UI in `frontend/src/components/`; keep pages thin.
- **Backlog:** dead routes / unused components — separate pass (not done here).

---

## Phase 5 — Scripts and local dev — **done**

- `scripts/dev/start_servers.bat` and `kill_servers.bat` linked from `.ai/extended/development.md` (Quick Scripts) and repository layout table.

---

## Phase 6 — Workspace — **done**

- Removed redundant local dirs: `workspace/scripts`, `workspace/tests`, `workspace/PrintServer` (redundant with repo `printserver/`).
- `workspace/notebooks/README.md` — `pip install -r workspace/notebooks/requirements-notebooks.txt` from repo root.

---

## Exit criteria — **met**

- `.gitignore` covers checkpoints and notebook `__pycache__`; workspace policy documented.
- `README.md` + `.ai/extended/development.md` explain backend, print server, and AI docs in two hops.
- Plan completed 2026-03-24; retired to archive when `.ai/plans/` (now `.ai/initiatives/`) backlog was closed.

---

## References

| Area | Doc |
|------|-----|
| Session / AI context | `.ai/context.md`, `.ai/protocols/startup.md` |
| Retag (ops + technical) | `.ai/extended/retag-operations.md`, `.ai/extended/inventory-pipeline.md`; archived cutover plan: `.ai/initiatives/_archived/_completed/retag_cutover.md` |
| Dev setup | `.ai/extended/development.md` |

---

## Backlog (not in scope of this completion)

- Optional physical `backend/` directory — separate high-touch migration (Procfile, paths, imports).
- Requirements split: main `requirements.txt` vs `workspace/notebooks/requirements-notebooks.txt` — now documented in dev guide + notebooks README.
- Static audit for unused frontend exports.

---

*Retired to archive 2026-03-24.*
