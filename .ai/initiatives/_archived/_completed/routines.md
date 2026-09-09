<!-- initiative: slug=routines status=completed updated=2026-09-08 -->
<!-- Archived 2026-09-08: disposition=completed shipped v2.76.0–v2.87.0 (Routines + Retail QA + Floor pages). Split from routines_and_documents; Documents is its own file. -->
<!-- Last updated: 2026-09-08 (split → routines completed; documents stays active) -->

# Initiative: Routines

**Status:** **Completed** (2026-09-08) — Routines + Retail QA through desk Home / Today / Pay / Routines shipped **v2.87.0** (GitHub, not Heroku). Split out of `routines_and_documents`; Documents continues as [`documents`](../../documents.md).

**Objective:** Staff have **Routines** (periodic or on-demand fill-in forms, pooled or per person) as a phone-first page.

**Compass:** retired. Documents is the remaining product work: [`documents`](../../documents.md). Replaces abandoned [`documents_and_duties`](../_abandoned/documents_and_duties.md) (Library + QA-in-library was the wrong product).

---

## Finish line

A person opening **Routines** sees Blocking / Overdue / Due today / This week / Done this week / On demand without the list jumping. Filling a run is the only way it closes. Superusers author in a desk form with a live phone preview. Deleted routines leave every staff surface.

---

## Shipped

- Phone-first two-pane shell: left list/editor, right 9:20 phone (`PhoneFrame` flush + stage). Permanent bottom bar by mode.
- My Routines / Catalog toggle in the account-menu page. Compact `TaskRow` with status tile, badges, one pill verb.
- Status model (`presentRun` + glyphs). Finished runs open read-only. Soft-delete (`is_active=false`) hides catalog, mine, overdue, and run URLs.
- Editor: Name / Schedule / Owner / two-line check cards. Copy for AI + Update from JSON (departments and people in the brief; names resolve to ids; no em dash in generated copy).
- Bi-weekly trigger (`anchor_date`). Saving a routine and opening `/mine/` materialize today's run.
- Nav: Time clock + Routines in the account menu. Digit 9 and letter L stay free.
- **Routine Control** (`/admin/routines`, superuser): every routine incl. retired, run stats, search / status / health chips / department / cadence / sort, inspector with quick edits (shared `RoutineSettingsFields`), Retire + Undo, Restore, Delete forever. API `admin/`, `restore/`, `hard-delete/`.
- **Retail QA program**: nag hierarchy (`remind_time` / nullable `due_time` / `late_after`, `runUrgency`, clock-out guard), `Section` CRUD with owners, five routine kinds with purpose-built runners (including `work_cycle`), seven seeded routines, `grading.py` with A-F letters, `GET /routines/grades/`, Settings > Retail QA, Routine Control > Sections and Grades, Dashboard Retail letters, POS work-cycle pill and idle prompt.

---

## Out of scope

- Documents (own initiative: [`documents`](../../documents.md))
- SOP / training document library, versioning, and read-tracking of reference material
- A schedule model (Department / Shift / Day / Time / Who). Open / Day / Close stay pooled to Retail; the time clock is the "who is here" signal
- Event-driven routine triggers
- SuperAdmin Control Center overdue rollup across people / departments (`GET /api/routines/runs/overdue-report/` already exists; Routine Control shows it per routine only)

---

## Decisions locked

- QA tables `pos_qualityaudit` / `pos_qualityauditform` are dropped (`pos/0026_drop_quality_audit`). The letter grade came back on the routines engine instead, not on the old QA app.
- Dashboard Retail card is the Retail QA letter: the day's letter per cell, the week's letter under the label.
- Open / Day / Close are graded on **whether they happened on time**, never on what they found. Finding problems must never cost anyone points.
- Daily section walks are recorded, never scored. A busy aisle is not its keeper's fault.
- A missed owner spot check is silence, not a zero; a missed cross-check that was assigned **is** a zero.
- Every number that decides a grade lives in Settings > Retail QA, never in the scoring code.
- Pinned Essentials: Dashboard only. Account menu: Time clock, Routines.

---

## Record

**2026-09-08 — Split and completed.** Owner split `routines_and_documents`. This file is Routines only and is done. Documents is [`documents`](../../documents.md).

**2026-09-03 — GitHub v2.87.0.** Floor pages: Home / Today / Pay / Routines share `FloorNav`. Shift on the punch, language, 52-item Open / Day / Close (`0008` reseeds definitions, does not wipe history), expire, audience, subject-pool removal, phone Dashboard / Today / Pay. Retail cells with no letter stay blank, not a miss. Not on Heroku.

**2026-09-02 — GitHub v2.77.0.** Retail QA stabilize: purge authored leftovers, lock program routines, Work cycle as its own kind with mobile draft pickup, terminal idle prompt, dashboard/grades activity figures, one Routine Control shell, no em/en dashes in ts/tsx/py. Not on Heroku.

**2026-09-02 — GitHub v2.76.0.** Routines, Retail QA, and the Documents API (staff UI still unwired). Not on Heroku yet.

**2026-09-01 — Retail QA program.** Nag hierarchy (soft badge, hard app bar, late, and "at clock-out" with a time-clock guard). Sections with owners, CRUD, and coverage gaps. Four routine kinds with their own runners: Open / Day / Close checklists that verify the shift before, the daily section tally, the Tuesday cross-check, and the owner spot check. `grading.py` turns all of it into A-F with every weight and threshold in Settings > Retail QA. Routine Control gained Sections and Grades; the Dashboard Retail card shows letters; the POS cart header carries a Work cycle pill.

**2026-09-01 — Routine Control.** Admin workspace page for the owner: all routines with history, filters, quick edits, retire / restore / hard-delete. Editor's Name / Schedule / Owner bands moved into `RoutineSettingsFields` so both surfaces share one form.

**2026-09-01 — Routines ship-ready; Documents parked.** Phone-first shell, catalog/editor/AI JSON, brand chrome, hide retired routines. Documents pages unwired from `App.tsx` and the account menu.

**2026-08-31 — Rebuild.** Library and Quality Audit torn out. `apps.routines` + `apps.documents` shipped in-tree. Heroku Scheduler job `materialize_duties` must be replaced with `materialize_routines` in the dashboard (not in git).

---

## See also

- Documents (active): [`documents`](../../documents.md)
- Abandoned predecessor: [`documents_and_duties`](../_abandoned/documents_and_duties.md)
- Domain: [`.ai/extended/routines.md`](../../extended/routines.md)
- Index: [`_index.md`](../_index.md)
