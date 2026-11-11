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
| 2026-11-10 | ship | v2.271.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline (docs only, not deployed) |
| 2026-11-10 | deploy | v2.271.0 | 347bacea | v620 | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | ship | v2.271.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | deploy | v2.270.0 | 1f48062e | v619 | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | ship | v2.270.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | deploy | v2.269.3 | a1c441e2 | v618 | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | ship | v2.269.3 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | config | — | — | v617 | Bench | Eco-Thrift - Mainline (four house AI key names added) |
| 2026-11-10 | deploy | v2.269.2 | 53bd86d9 | v616 | Bench | Eco-Thrift - Mainline |
| 2026-11-10 | ship | v2.269.2 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | deploy | v2.269.1 | a28b320f | v615 | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | ship | v2.269.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | deploy | v2.269.0 | 556d2132 | v614 | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | ship | v2.269.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | deploy | v2.268.2 | d4a786e1 | v613 | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | ship | v2.268.2 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | deploy | v2.268.1 | bd90d9ed | v612 | Bench | Eco-Thrift - Mainline |
| 2026-11-09 | ship | v2.268.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.267.0 | 6f889dba | v610 | Bench | Eco-Thrift - Mainline |
| 2026-11-06 | ship | v2.268.0 | (this version's commit) | — | Bench | Dash #76 Get manifest (heuristic-thompson-cf0947) |
| 2026-11-05 | ship | v2.267.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.266.0 | 4bb5123c | v609 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.266.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.265.2 | 9512c93a | v608 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.265.2 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.265.1 | 4cb01fde | v607 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.265.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.265.0 | bce0ad5b | v606 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.265.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.264.0 | 8844ea8a | v605 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.264.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.263.0 | 84b0b1ee | v604 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.263.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.262.0 | fa8e6545 | v603 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.262.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | deploy | v2.261.0 | d156260e | v602 | Bench | Eco-Thrift - Mainline |
| 2026-11-05 | ship | v2.261.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | deploy | v2.260.1 | d8fb6605 | v601 | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | ship | v2.260.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | deploy | v2.260.0 | f0c83a8f | v600 | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | ship | v2.260.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | deploy | v2.259.1 | cc6fda13 | v599 | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | ship | v2.259.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | deploy | v2.259.0 | c4974722 | v598 | Bench | Eco-Thrift - Mainline |
| 2026-11-04 | ship | v2.259.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.258.0 | 4831ca94 | v597 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.258.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.257.0 | e45022e2 | v596 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.257.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.256.0 | 081400c0 | v595 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.256.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.255.0 | 1bd37d0f | v594 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.255.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.254.0 | 08161b76 | v593 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.254.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.253.0 | 60f75b76 | v592 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.253.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.252.0 | 00949ce8 | v591 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.252.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.251.0 | fb7bf66f | v590 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.251.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.250.0 | 068a2197 | v589 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.250.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.249.0 | 27261d1a | v588 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.249.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.248.1 | 7d6e9d6f | v587 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.248.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.248.0 | f6fb0eba | v586 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.248.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | deploy | v2.247.0 | 73d9fe24 | v585 | Bench | Eco-Thrift - Mainline |
| 2026-11-03 | ship | v2.247.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.246.1 | 7c68670e | v584 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.246.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.246.0 | bf5dac46 | v583 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.246.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.245.0 | d9b6a422 | v582 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.245.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.244.0 | 19e8641a | v581 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.244.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.243.0 | 838b8b36 | v580 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.243.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.242.0 | 06d95575 | v579 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.242.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.241.0 | 7f187c17 | v578 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.241.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.240.0 | f656460b | v577 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.240.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.239.1 | ce3d033e | v576 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.239.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.239.0 | fc6a56ee | v575 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.239.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.238.0 | bfe409e2 | v574 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.238.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.237.0 | 304cdd94 | v573 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.237.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.236.0 | fb90c9b5 | v572 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.236.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.235.0 | 6c7d897e | v571 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.235.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.234.1 | ee025ef3 | v570 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.234.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.234.0 | 8777f1dc | v569 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.234.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.233.1 | 203e553f | v566 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.233.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | deploy | v2.233.0 | bdbf7282 | v565 | Bench | Eco-Thrift - Mainline |
| 2026-11-02 | ship | v2.233.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-31 | deploy | v2.232.4 | 3de9ffd8 | v564 | Bench | Eco-Thrift - Mainline |
| 2026-10-31 | ship | v2.232.4 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-29 | deploy | v2.232.3 | 5480241a | v562 | Bench | Eco-Thrift - Mainline |
| 2026-10-29 | ship | v2.232.3 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.232.1 | b97e40e5 | v561 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.232.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.232.0 | 1b09c035 | v560 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.232.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.231.0 | a78cf34e | v559 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.231.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.230.0 | 45600bce | v558 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.230.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.229.1 | 6a8fc180 | v557 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.229.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.229.0 | a255df89 | v556 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.229.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.228.0 | 9f11c4f1 | v555 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.228.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.227.0 | 0efc1ec5 | v554 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.227.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.226.1 | f04269fa | v553 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.226.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.226.0 | 8a5076ce | v552 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.226.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.225.1 | c39fd199 | v551 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.225.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.225.0 | 36544066 | v550 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.225.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.224.0 | b43339fa | v549 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.224.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.223.0 | 6dd83cf6 | v548 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.223.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.222.0 | ef3cd996 | v547 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.222.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | deploy | v2.221.1 | a0f23d85 | v546 | Bench | Eco-Thrift - Mainline |
| 2026-10-28 | ship | v2.221.1 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.221.0 | e31e9580 | v545 | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | ship | v2.221.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.220.0 | 9c1d41bb | v544 | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | ship | v2.220.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.219.0 | 43067a73 | v543 | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | ship | v2.219.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.218.0 | c10a1e81 | v542 | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | ship | v2.218.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.217.0 | 3d44d534 | v541 | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | ship | v2.217.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.216.0 | 038e014a | v540 | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | ship | v2.216.0 | (this version's commit) | — | Bench | Eco-Thrift - Mainline |
| 2026-10-26 | deploy | v2.215.2 | 3316fc51 | v539 | Bench | Eco-Thrift - Mainline |
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
