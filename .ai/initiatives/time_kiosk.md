<!-- initiative: slug=time-kiosk status=active updated=2026-09-18 -->
<!-- Last updated: 2026-09-18 -->

# Initiative: Time kiosk

**Status:** **Active** — Phase 1 building on branch `kiosk`. Not GitHub. Not Heroku.

**Objective:** A store tablet lets any staff member punch in, out, or on break with a scannable employee card and no login of their own, while the same screen shows who is in, on break, expected, late, or called in, grouped by department. Two faces: hosted `/kiosk` (a dedicated Employee host stays signed in; full board; pay edits) and public `/clock` (no login; card-only punch; redacted board). Clock-in walks a gate: stale punch, missed routines flagged `gate_on_miss` (a reason is required), unheard nudges.

**Compass:** this file is not the compass; [`documents`](./documents.md) stays the compass.

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
- [ ] `EmployeeProfile` badge hash fields; Admin issue / reprint / revoke; one-time print with Code 128
- [ ] `/api/hr/kiosk/*` behind `hr.kiosk:use`; `/api/hr/clock/*` AllowAny with device cookie, IP allowlist, throttle
- [ ] `/kiosk` and `/clock` full-bleed routes; Tap to start; overlays; timeouts 15 / 45 / 4 s; host-expired overlay; Exit needs host password
- [ ] Clock-in gate: stale punch, `gate_on_miss` missed routines with reasons, nudges Heard; nothing saved on walk-away
- [ ] Command Center Missed rows show the reason; Routine Control `gate_on_miss` switch superuser-only
- [ ] Every kiosk string EN + ES; test fails on a missing Spanish value

---

## Acceptance

- [ ] Phase 1
- [ ] Out-of-scope items stay out

---

## Build log

Resume point for the overnight run. One line per todo as it lands.

- `run-contract` — branch `kiosk`, this file, index row.

---

## Later

Things noticed during the build that are not in scope. Do not build; list them.

---

## Record

**2026-09-18 — Opened.** Hosted `/kiosk` + public `/clock`, hashed Code 128 cards, clock-in gate, miss reasons.

---

## See also

- Index: [`_index.md`](./_index.md)
- Plan of record for the overnight run: `~/.cursor/plans/hosted_time_kiosk_4c9306bd.plan.md`
