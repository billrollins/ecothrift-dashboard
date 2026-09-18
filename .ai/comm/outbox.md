# Outbox — ecothrift-dashboard

**Status:** 1 message
**Updated:** 2026-09-18
**From:** project coder
**To:** master

## 2026-09-18 — Time kiosk built on branch `kiosk`

The Hosted Time Kiosk overnight run is done. Branch `kiosk` off `main` holds 11 commits, one per plan todo, nothing pushed, nothing deployed, no version bump. What landed: hashed Code 128 employee cards (issue / reprint / revoke from the employee drawer, one-time print through the local print server); `/kiosk` hosted route (staff JWT host with `hr.kiosk:use`, full department-grouped board, scan-to-punch overlay, break, wrong-shift relabel, time-edit requests, stale-punch Fix it, host-expired overlay, password-gated Exit, Tap-to-start fullscreen, EN / ES); `/clock` public route (no login, redacted board, device-cookie + IP throttle, `kiosk.public_allowed_ips` allowlist); clock-in gate (stale punch, `gate_on_miss` missed routines needing a reason, unheard nudges) that commits nothing until the clock-in succeeds; `miss_reason` visible in Command Center rows, tooltips, Score items, and the Week dialog; `KioskEvent` audit table. Verification: 34 new backend tests green; `tsc` clean; vitest 1082 pass with 9 failures in 6 files that fail identically on a `main` worktree; `npm run build` green with the kiosk as its own chunks; full pytest baseline compared against `main` (see initiative build log). Docs updated: `auth-and-roles`, `frontend`, `backend`, `routines`, `time_kiosk.md`, `_index.md`. Morning steps for the user: review and merge `kiosk`, release via `ship-push-git.md`, create a dedicated Employee account as the kiosk host, issue the first cards, and set `kiosk.public_allowed_ips` before opening `/clock`. Pre-existing red on `main` (vitest and pytest) is listed under Later in the initiative; it is not this branch's.
