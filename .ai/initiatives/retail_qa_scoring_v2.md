<!-- initiative: slug=retail-qa-scoring-v2 status=active updated=2026-09-18 -->
<!-- Last updated: 2026-09-18 -->

# Initiative: Retail QA Scoring v2

**Status:** **Active** — Phase 5 shipped GitHub **v2.95.0**. Not Heroku.

**Objective:** Retail managers can run the floor from one QA dashboard (who is scheduled, what is done, spots, cross-checks, flags, people). Staff can see their own week without baseline internals. Superusers can edit the three-thirds standard (Doing / Cross / Owner), preview the current week, and keep past weeks frozen under the settings they were scored with.

**Compass:** this file is not the compass; Documents stays the compass.

---

## Finish line

A Manager on `/admin/retail-qa` sees today plus week thirds and can assign owners, assign cross-checkers, close a section, and review flags. A staff member on `/routines/qa` sees store thirds and their own results. Settings > Retail QA holds the new ladders, severity groups, and an audit log; Preview rescores the current week before save. The owner spot runner draws only from sections tallied or cross-checked today, with Switch and an immediate score. The Dashboard retail card still shows a day letter from the same formula.

---

## Out of scope

- Scoring work cycles (activity only)
- Changing letter cutoffs from A/B/C/D/F
- Spanish copy on the RM dashboard and Grades pane (staff QA is EN/ES)
- Heroku deploy (GitHub **v2.95.0** only)
- Replacing punch-code clock-in tiles (`hr.shifts` codes stay)

---

## Phases

### Phase 1 — Data, baseline, settings, weekly roster
Observations, flags, assignment history, baseline and week snapshots, setting history, weekly shift templates (name, department, time in/out, weekdays) plus assignments. Baseline math and new `retail_qa` defaults.
**Gated by:** none.

Acceptance:
- [x] `SectionObservation` is written on submit and backfillable
- [x] `baseline.py` fits NB/Poisson, mid-p tails, shrink, and warm-up
- [x] New settings seed; retired keys are gone
- [x] A shift template + assignment can answer who is scheduled today

### Phase 2 — Grading engine and API
Three thirds for day and week, projection, people attribution, QA endpoints, dashboard_metrics rewire.
**Gated by:** Phase 1.

Acceptance:
- [x] Worked examples: normal 10 → found 2 = 100, found 5 = 60; normal 1 → found 1 = 100, found 2 = 60
- [x] Past weeks freeze settings and baselines; current week is live
- [x] `/api/routines/qa/mine/` redacts other people and flag evidence

### Phase 3 — Spot draw, schedule, verify photo
Tallied-only lazy draw, Switch log, cross-check weekday → next open day, random verify photo.
**Gated by:** Phase 2.

Acceptance:
- [x] Empty pool shows waiting copy; Switch logs every change
- [x] Cross-check moves to the first open day on or after the setting
- [x] Server refuses a pass on the photo-required verify item without a photo

### Phase 4 — Checker flags
Five tests, RM review, baseline exclusion.
**Gated by:** Phase 3.

Acceptance:
- [x] Each of the five tests can raise and auto-clear
- [x] Clear requires a note
- [x] Flagged checkers' later audits stay out of the baseline

### Phase 5 — Surfaces and docs
RM dashboard, Settings UI, Staff QA, Dashboard note, routines.md. Routine Control Grades is retired.
**Gated by:** Phase 4.

Acceptance:
- [x] `/admin/retail-qa` is usable by Manager+
- [x] `/routines/qa` is read-only for the logged-in person
- [x] Settings preview rescores the current week without saving

---

## Acceptance

- [x] Phase 1 models, baseline, settings, shifts
- [x] Phase 2 grading + QA API
- [x] Phase 3 spot / schedule / verify
- [x] Phase 4 flags
- [x] Phase 5 surfaces + docs
- [x] Out-of-scope items stay out

---

## Record

**2026-09-15 — Opened.** Three-thirds Retail QA (Doing / Cross / Owner) plus RM dashboard, staff QA view, and a weekly shift roster so “who should be in” is real data.

**2026-09-15 — Implemented locally.** Models, baseline, settings, grading, QA API, tallied-only spot draw, verify photo, checker flags, RM dashboard, staff QA, Settings preview/audit, weekly `Shift`/`ShiftAssignment` roster, Dashboard note. Not committed, not deployed.

**2026-09-16 — Grades pane retired.** Routine Control is Routines + Sections. Week scoring is Command Center only. `GET /api/routines/grades/` is gone.

**2026-09-18 — Shipped GitHub v2.95.0.** Command Center, staff `/routines/qa`, Settings > Retail QA, frozen `QaDayExpected` (zero expected excludes Do; a day with nothing expected is Closed, not A+). Not Heroku.

---

## See also

- Index: [`_index.md`](./_index.md)
- Domain: [`../extended/routines.md`](../extended/routines.md)
