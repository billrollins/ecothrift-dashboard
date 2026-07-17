# Standalone TARS Studio contract

Last updated: 2026-07-13

## Product surface

- Durable route: `/restoration/tars`.
- Staff-only route outside dashboard chrome; dashboard navigation opens it in a new tab.
- The header owns Back to dashboard, Inbox / Bench / Pending, scan input, HR state, elapsed labor, and the only primary Pause / Resume control.
- Deep links use `?view=inbox|bench|pending&job=<id>`.
- Inbox and Pending are full-width lists. Bench presents one technician-owned item.

## Bench information architecture

1. **Item State** stays visible: grade/value ladder, missing valuations, current grade, known labor/parts cost, and committed plan.
2. **Actions** open one focused surface at a time: Assess grade, Add / run test, Build plan, Commit plan, Parts, Record work, Hold, and Finish.
3. **Restoration log** is the primary record. It separates estimates, decisions, performed work, and system history while retaining revisions and voided entries.
4. **Final disposition** reviews final grade, destination, active labor, known parts, committed plan, and the item story before completion.

## Ownership and lifecycle

- `RestorationJob.bench_owner` is explicit. A conditional database constraint permits at most one `stage=bench` job per technician.
- Check-in and resume lock the technician row before assigning the bench.
- A conflict returns HTTP 409 with the existing bench job so the client can navigate to it.
- Hold, Inbox return, Processing return, and completion clear ownership.
- Legacy Bench rows that cannot be assigned safely stay unowned, return `bench_ownership_ambiguous: true`, and display a cleanup warning instead of receiving invented ownership.
- Incomplete valuations do not block check-in. They remain amber in Item State; completion still requires complete grade values.

## Durable restoration log

`RestorationTimelineEvent` is the attributed, append-oriented history. Each entry stores:

- job, server occurrence time, actor, event type, schema version, and typed JSON payload;
- stable entity ID and correlation ID;
- active / revised / voided status;
- superseded event, or void actor, time, and reason.

Corrections create a superseding event. User deletion requires a reason and voids the active editable record. System events such as timers and lifecycle transitions cannot be revised or voided. Legacy jobs receive one honest `legacy.snapshot` during migration `inventory.0081_tars_studio_timeline`.

API:

- `GET|POST /api/inventory/restoration-jobs/{id}/timeline/`
- `PATCH /api/inventory/restoration-jobs/{id}/timeline/{event_id}/`
- `POST /api/inventory/restoration-jobs/{id}/timeline/{event_id}/void/`

The current `RestorationJob` columns and `work_session` remain the fast projection. New TARS mutations update projection and timeline in one transaction.

## Event coverage

- valuation requested, values changed, request fulfilled;
- condition/current grade assessed;
- test added, result recorded, test removed;
- grade estimate revised, plan committed or cleared;
- parts draft, request, order, and receipt;
- TEST / REPAIR / ASSEMBLE / SALVAGE work, including result and labor minutes;
- timer start, pause, and adjustment;
- check-in/resume, hold, Inbox return, Processing return, and final disposition.

Related events from one operation share a correlation ID, including check-in + timer start, hold + timer pause, valuation update + fulfillment, and multi-entity work-session saves.

## Labor timer

- Check-in starts labor when the employee is clocked in and not on break.
- The first state-changing Bench action auto-starts a stopped timer. Merely opening a tool does not.
- HR break and clock-out pause on the server; the Studio refreshes current-entry state and reconciles any stale running timer.
- Ending a break does not resume automatically.
- Five minutes without activity pauses the server timer and asks whether work continued.
  - **Yes:** keep elapsed time and resume.
  - **No:** restore the persisted last-meaningful-action baseline and remain paused.
- Timer mutations are serialized client-side and locked server-side.

## Smoke path

1. Open TARS from dashboard and confirm a standalone tab plus Back behavior.
2. Scan an Inbox item and check in.
3. Assess current grade; add and run a baked test.
4. Build estimates and commit a plan.
5. Add/request parts; verify Pending and parts-received state.
6. Record performed work with notes, result, and labor minutes.
7. Hold and resume; verify one Bench item and correlated log entries.
8. Finish and review final grade, labor, parts, destination, and item story.
9. For a missing value, request Processing valuation and verify request, values-changed, and fulfilled events.
10. Revise an editable log record; void another with a reason; confirm history remains inspectable.
