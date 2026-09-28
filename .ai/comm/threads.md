# Threads board — ecothrift-dashboard

Shared by the Claude sessions working in this repo at the same time. **The post office is this folder at its absolute path, `C:\Coding\ecothrift-dashboard\.ai\comm\`,** whatever checkout you work in.

- Read this file at the start of every session and before every push.
- Update your own row and append to the ship log when you push.
- Messages go in `inbox-<slug>.md` (one live slot each; format in `.ai/protocols/check_comm.md`).

## Threads

| Slug | Owner of | Workspace | Runner IDs | Status |
|---|---|---|---|---|
| `data_platform` | Thrift+ core (members, cards, reward engine, POS, returns, signup), the Superuser Requests center, the data platform and AI brief, buying | `C:\Coding\ecothrift-dashboard` (main checkout) | R-071 to R-099 | active: working tree merged over `fd7eb327` (09-25). Monday 09-28 push is **v2.108.0**: Requests center, Thrift+ Phases 1 and 2 (dark), the morning brief, the `/scan` public-host passthrough. Building Thrift+ Phase 3 (the register) next |
| `thrift_scanner` | The Thrift+ customer scanner **mock** (front end only, mock data) | `C:\Coding\ecothrift-scanner` (worktree, branch `thrift-scanner-mock`; push `HEAD:main`, not the deploy scripts) | R-100 and up | active: v2.107.0 shipped (`/scan`, design match, bank-or-rebate, email/card sign-in); types in `inbox-data_platform.md`; waiting on owner/staff feedback and the `ecothrift.us/scan` passthrough |

## Rules
- **Never share a working tree.** The push script (`scripts/deploy/2_push_github.bat`) stages everything, so it would commit the other thread's half-done work.
- **Before every push:** `git fetch origin`, merge or rebase `origin/main`, bump the version past the newest one on `main`, then push GitHub and Heroku. Never force-push.
- **Stay in your lane.** Touch another thread's files only through a message in its inbox.
- `.ai/calendar.md` is shared. Update only the Status cell of your own items.

## Ship log (newest first)

| Date | Slug | Version | Commit | What |
|---|---|---|---|---|
| 2026-09-28 | `data_platform` | v2.109.0 | (this push) | Requests center, Thrift+ members/cards and reward engine (dark), morning brief, /scan passthrough, POS line-price fix, staff endpoints closed to online-store customers |
| 2026-09-25 | `thrift_scanner` | v2.107.0 | `fd7eb327` | scanner at `/scan` matched to the owner's design (AI art), bank-or-rebate on first add, email/password + card sign-in (Heroku v366) |
| 2026-09-25 | `thrift_scanner` | v2.106.0 | `ca389e1b` | Thrift+ price scanner mock at `/pricescanner` (also `/scan`); stable phone URL + QR in dev scripts (Heroku v365) |
| 2026-09-25 | `data_platform` | v2.105.1 | `2e996c56` | docs: clean slate, calendar |
| 2026-09-25 | `data_platform` | v2.105.0 | `fe292fee` | seller revenue factors (Heroku v363, with v2.104.0) |
