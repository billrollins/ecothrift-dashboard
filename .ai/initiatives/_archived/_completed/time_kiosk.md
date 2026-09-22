<!-- initiative: slug=time-kiosk status=completed updated=2026-09-22 -->
<!-- Archived 2026-09-22: disposition=completed shipped GitHub and Heroku v2.96.0 (hosted /kiosk, public /clock, badge cards, clock-in gate). Small updates continue outside this initiative. -->
<!-- Last updated: 2026-09-22 (moved to _completed) -->

# Initiative: Time kiosk

**Status:** **Completed** (2026-09-22) — GitHub and Heroku **v2.96.0**. Hosted `/kiosk` and public `/clock`. Set `kiosk.public_allowed_ips` before relying on the door tablet. Small updates continue outside this initiative.

**Objective:** A store tablet lets any staff member punch in, out, or on break with a scannable employee card and no login of their own, while the same screen shows who is in, on break, expected, late, or called in, grouped by department. Two faces: hosted `/kiosk` (a dedicated Employee host stays signed in; full board; pay edits) and public `/clock` (no login; card-only punch; redacted board). Clock-in walks a gate: stale punch, missed routines flagged `gate_on_miss` (a reason is required), unheard nudges.

**Compass:** this file is not the compass; [`documents`](../../documents.md) stays the compass.

---

## Finish line

An Admin issues a card from Users → employee → Badge and prints it. The kiosk host opens Essentials → Kiosk, taps once to go fullscreen, and leaves the tablet for the day. A cashier scans her card, sees `Retail Open, 8:30 to 2:30`, answers why yesterday's checklist was missed, taps Clock in, and is back at the board in four seconds. The door tablet at `/clock` does the same without any login and shows only names, shifts, and In / Out / Expected / Late. Command Center shows `Missed · Forgot` on the missed row.

---

## Out of scope

- PIN or photo on the public face; buddy-punch prevention beyond a witness on `/kiosk` and the card on `/clock`
- AI daily messages and the overseer context project (the gate `kind` list is the hook)
- Translation-table initiative; Spanish department or shift names
- Label Studio employee-card template; per-user capability grants; clock-out routine guard
- Two punches in one day (that is a time edit); pay data or QA scores on the kiosk
- Heroku deploy

---

## Phases

### Phase 1 — Cards, hosted kiosk, public clock, gate, miss reasons
Everything in the plan lands in one build on branch `kiosk`, one commit per todo.
**Gated by:** none.

Acceptance:
- [x] `EmployeeProfile` badge hash fields; Admin issue / reprint / revoke; one-time print with Code 128
- [x] `/api/hr/kiosk/*` behind `hr.kiosk:use`; `/api/hr/clock/*` AllowAny with device cookie, IP allowlist, throttle
- [x] `/kiosk` and `/clock` full-bleed routes; Tap to start; overlays; timeouts 15 / 45 / 4 s; host-expired overlay; Exit needs host password
- [x] Clock-in gate: stale punch, `gate_on_miss` missed routines with reasons, nudges Heard; nothing saved on walk-away
- [x] Command Center Missed rows show the reason; Routine Control `gate_on_miss` switch superuser-only
- [x] Every kiosk string EN + ES; test fails on a missing Spanish value

---

## Acceptance

- [x] Phase 1 (code and tests; not yet used on a real tablet)
- [x] Out-of-scope items stay out
- [ ] Morning review: merge `kiosk`, release via `ship-push-git.md`, create the kiosk host Employee account, issue the first cards, set `kiosk.public_allowed_ips`

---

## Build log

Resume point for the overnight run. One line per todo as it lands.

- `run-contract` — branch `kiosk`, this file, index row.
- `models` — `accounts 0008_kiosk` (badge hash / issued / revoked), `hr 0015_kiosk` (`KioskEvent`), `routines 0022_kiosk` (`gate_on_miss`, `miss_reason*`). Pre-existing harmless drift in `hr` and `routines` (index renames, field alters) folded into these migrations. `core` and `webstore` still report three index renames on `makemigrations --check`; they predate this branch and were left alone.
- `service` — `apps/hr/kiosk_service.py`: HMAC token hash, identify + throttles, preview, hosted and redacted boards, punch actions, gate items, fix-stale, `KioskEvent` logging.
- `hosted-api` + `public-api` — `apps/hr/kiosk_views.py`, URLs, `hr.kiosk:use`, `POST /api/auth/verify-password/`, badge issue / reprint / revoke on `UserViewSet`, `badge_status` on the serializer. Public device cookie, IP allowlist, per-device throttle.
- `routines-backend` — `gate_on_miss` superuser-only write; `miss_reason` on run serializer, Command Center jobs, score items, day grade rows.
- `backend-tests` — `test_kiosk.py` (25), `test_badge.py` (6), `test_miss_reason.py` (3): all green.
- `frontend-core` — `i18n/kiosk.ts` (+ test that fails on a missing Spanish value), `api/kiosk.api.ts`, `client.ts` never redirects `/kiosk` to login, `/kiosk` + `/clock` lazy routes, Essentials → Kiosk.
- `kiosk-ui` — `pages/kiosk/*`: shell, board, scan input, punch overlay, gate steps, Something's wrong sheet, tap-to-start, exit dialog, host-expired overlay, manager warning, `useKioskSession`, `useOverlayTimeout`.
- `clock-ui` — `ClockPage` on the redacted board; `ShiftPicker` accepts caller tiles so the public clock skips the staff endpoint.
- `admin-ui` — `BadgeBlock` in the employee drawer (one-time Code 128 card, print via local print server); "Ask why when missed" toggle (superuser) in both routine editors; Command Center `Missed · Forgot` line, tooltip note, Week dialog hover.
- `frontend-verify` — `tsc` clean; `vitest` 1082 passed, 9 failed in 6 files, identical set fails on `main` (ShiftHeroCard, TodayPage, TodayPhone, ListingStudioPage, RestorationQueuePage, noDashes); `npm run build` green with `KioskPage` / `ClockPage` / `useKioskSession` as their own chunks.
- `handoff` — full pytest with `--create-db` on both trees: `kiosk` 1473 passed / 123 failed, `main` 1439 passed / 123 failed, the failing set is identical (routines `tests.py`, inventory preprocessing / ai_cleanup / intake_undo, buying valuation, pos delivery, webstore query budget). The +34 are this branch's tests. Docs (`auth-and-roles`, `frontend`, `backend`, `routines`, `docs/app_navigation_and_pages.md`), this file, outbox.

---

## Later

Things noticed during the build that are not in scope. Do not build; list them.

- Pre-existing red on `main`: 9 vitest failures (6 files, above) and 123 pytest failures (102 node ids) rooted in `hr_department_name_key` duplicate seeds, grading expectations, and em-dash lint. Both predate this branch; a separate cleanup pass.
- `pytest.ini` has `--reuse-db`, so the test database keeps the schema of whichever branch ran last. Switching branches without `--create-db` produces confusing `NotNullViolation` errors on columns the other branch does not have. Worth a note in `development.md`.
- `frontend/` has no `eslint` installed; only `tsc` and vitest guard the code.
- `makemigrations --check` on `main` reports index-rename drift in `core` and `webstore` (plus `hr` / `routines`, now folded in here). A one-line migration each would quiet it.
- Main staff bundle is 4.5 MB minified; the kiosk is already split out, the rest is a code-splitting initiative.
- Kiosk host account creation is a manual step (Users → new Employee, no other roles). A one-click "make a kiosk host" would save a form.
- Public board department order comes from `hr.Department.sort_order`; Spanish department and shift names are the translation-table initiative.
- `KioskEvent` has no admin or report surface yet; it is queryable in Django admin only if registered later.

---

## Record

**2026-09-18 — Opened.** Hosted `/kiosk` + public `/clock`, hashed Code 128 cards, clock-in gate, miss reasons.

**2026-09-18 — Built.** Overnight run finished on branch `kiosk`: 11 commits, 34 new backend tests green, kiosk frontend tests green, build green. Pre-existing failures verified against a `main` worktree. Awaiting the user's merge and release.

**2026-09-21 — Review fixes.** A bad card no longer looks like a dead host session. A good scan clears the failure count. `clock_in` and `fix_stale` lock the person row. Overlay timers, separate Tap-to-start keys, and the blocked door screen match the plan. Allowlist docs say exact IP strings. Release **v2.96.0** prepared. Not merged.

**2026-09-22 — Completed.** Moved to `_archived/_completed/`. Owner call: done; remaining updates are not initiative scope.

---

## See also

- Index: [`_index.md`](../../_index.md)
- Plan of record for the overnight run: `~/.cursor/plans/hosted_time_kiosk_4c9306bd.plan.md`
