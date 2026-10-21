<!-- Last updated: 2026-10-21 (new, D21: Bench row, history row, ship v2.189.3) -->
# Machines — ecothrift-dashboard

Where this repo lives and where it has been built. Every other file uses repo-relative paths; anything that differs by machine is looked up here. Shape: `{master}/templates/machines-template.md` v1 · standard: `{master}/standards/machines.md` (D21).

## Current build machine

**Bench** since 2026-10-21 (the first date on record; every release before it was built on Bench too). It ships and deploys.

## Machines

| House name | Computer name | Board UUID | Remote Control name | Coding root | This repo | Master folder | Status | First used | Last used |
|---|---|---|---|---|---|---|---|---|---|
| Bench | CANFIELD-MAIN | 4C4C4544-0030-3510-804A-CAC04F334C33 | unverified | `C:\Coding` | `C:\Coding\ecothrift-dashboard` | `C:\Coding\.ai` | current | 2026-02-13 | 2026-10-21 |

Computer name: `$env:COMPUTERNAME`. Board UUID: `(Get-CimInstance Win32_ComputerSystemProduct).UUID`.

Worktrees sit under the coding root in `_worktrees\ecothrift-dashboard--<slug>` (house rule D7), or in `.claude\worktrees\` inside this repo when the Claude app makes them.

## Machine paths

Only the absolute paths a tool or folder can't get from PATH or an env var. Scripts look in this order: PATH, then the env var, then this table.

| Machine | What | Env var | Path | Why it's here |
|---|---|---|---|---|
| Bench | PostgreSQL 18 client (`psql`, `pg_dump`, `pg_restore`) | `PSQL` | `C:\Program Files\PostgreSQL\18\bin\psql.exe` | On the user PATH, but read-only prod queries call it by full path; `scripts/db/` needs its `bin` folder on PATH |
| Bench | Microsoft Edge, headless (poster and print renders, `.ai/extended/creative-method.md`) | `EDGE` | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` | Not on PATH |

## Ship and deploy log

Newest first. One row per ship (`ship.md`) and per deploy (`deploy.md`). A deploy row goes out with the next ship.

| Date | Event | Version | Commit | Heroku release | Machine | Session |
|---|---|---|---|---|---|---|
| 2026-10-21 | ship | v2.189.3 | (this version's commit) | — | Bench | Adopt house standard D21 (machines, relative paths) |
| 2026-02-13 … 2026-10-21 | history | v1.0.0–v2.189.2 | — | — | Bench | (before this log) |
