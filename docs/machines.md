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
| 2026-10-26 | ship | v2.215.2 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.215.1 | e848586a | v538 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.215.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.215.0 | f1888ed8 | v537 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.215.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.214.1 | 3fc6b210 | v536 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.214.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.214.0 | a4bfb4e5 | v535 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.214.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.213.0 | 28558c38 | v534 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.213.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.212.0 | 37ae4ee4 | v533 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.212.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.211.0 | 2dadac71 | v532 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.211.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.210.2 | b91348b2 | v531 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.210.2 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.210.1 | 7485f469 | v530 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.210.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.210.0 | c69933fd | v529 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.210.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.209.1 | 2cd5447a | v528 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.209.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.209.0 | 99795efb | v527 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.209.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.208.0 | 1d001d7e | v526 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.208.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | deploy | v2.207.1 | 4368bad2 | v525 | Bench | Eco-Thrift - Mainline |
| 2026-10-22 | ship | v2.207.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.207.0 | 08bc6cc9 | v524 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.207.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.206.0 | f2799de5 | v523 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.206.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.205.1 | 285508b9 | v522 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.205.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.205.0 | 0a9eba63 | v521 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.205.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.204.0 | a63a746a | v520 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.204.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.203.0 | 530c56c6 | v519 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.203.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.202.0 | f741d8af | v518 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.202.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.201.0 | bf962632 | v517 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.201.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.200.0 | 0f1eb869 | v516 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.200.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.199.0 | 24812795 | v515 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.199.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.198.0 | 17e3946b | v514 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.198.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.197.0 | cf8f83cd | v513 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.197.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.196.0 | 406730a7 | v512 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.196.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.195.0 | 9080a62c | v511 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.195.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.194.0 | 397f3828 | v510 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.194.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.193.1 | 72a8c8c9 | v509 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.193.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.193.0 | 24c0439d | v508 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.193.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.192.0 | 258745c6 | v507 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.192.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.191.0 | ba73d89a | v506 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.191.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.190.0 | fd9ed5aa | v505 | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | ship | v2.190.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-21 | deploy | v2.189.3 (with v2.189.2) | ab05d92c | v504 | Bench | Adopt house standard D21 (machines, relative paths) |
| 2026-10-21 | ship | v2.189.3 | (this version's commit) | — | Bench | Adopt house standard D21 (machines, relative paths) |
| 2026-02-13 … 2026-10-21 | history | v1.0.0–v2.189.2 | — | — | Bench | (before this log) |
