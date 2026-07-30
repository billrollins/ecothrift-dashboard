<!-- initiative: slug=retail_qa_submission_reliability status=completed updated=2026-07-30 -->
<!-- Archived 2026-07-30: disposition=completed shipped v2.60.0–v2.61.0 (Retail QA submission reliability + dashboard deep links) -->
<!-- Last updated: 2026-07-30 (completed → _completed/; owner closed) -->
# Initiative: Retail QA submission reliability

**Status:** **Completed** (2026-07-30) — Scope shipped in [`CHANGELOG`](../../../../CHANGELOG.md) **v2.60.0–v2.61.0** (live). Owner closed the initiative.

**Purpose:** Fix completed retail QAs never reaching the dashboard — stranded drafts, missing autosave/resume, grade/week counting bugs — then deep-link dashboard day cells into submitted audits with longer department history.

**Predecessor:** [`retail_quality_audit`](./retail_quality_audit.md) (v2.38.0 / v2.43.0 MVP).

**Shipped through:** `v2.61.0` in [`.version`](../../../../.version) / [`CHANGELOG.md`](../../../../CHANGELOG.md).

---

## Objectives

- [x] Recover stranded complete drafts (#15, #17) so they appear in history and on the dashboard
- [x] Autosave wizard progress; persist on chip jumps; leave-guard when answered but unsubmitted
- [x] Hub shows All / Submitted / In progress with Resume; start-audit offers resume vs new
- [x] Plus/minus grade bands so goals like B+ are achievable
- [x] Week audit counter includes off-schedule days; days-hit stays scheduled-only
- [x] Untouched photo/chips checks count as unanswered
- [x] Dashboard retail day cells deep-link to submitted audits (Manager+)
- [x] Department grids show 8 scrollable weeks; dashboard mobile usable inline

## Acceptance

- [x] Manager can resume an in-progress draft; submitted audits show in hub history
- [x] Completing a walk and submitting updates the dashboard Retail QA card
- [x] `B+` goal can be met by a `B+` (or better) overall grade
- [x] Blank seeded retail audit reports 42 missing checks (not 37)
- [x] Manager can open a submitted retail audit from a department day cell

## Closed without further code (2026-07-30)

Deferred (not blocking archive; open a new initiative if needed):

| Item | Notes |
|---|---|
| **Photo S3 upload** | Check-level photo capture still stubbed; out of this initiative’s submission-reliability scope. |
| **Multi-location QA** | Single-location form remains. |
| **Employee-role access** | Manager+ only. |

---

## See also

- [`apps/pos/models.py`](../../../../apps/pos/models.py) — `QualityAudit`
- [`apps/pos/services/quality_audit.py`](../../../../apps/pos/services/quality_audit.py)
- [`apps/pos/services/dashboard_metrics.py`](../../../../apps/pos/services/dashboard_metrics.py)
- [`frontend/src/pages/admin/QualityAuditWizardPage.tsx`](../../../../frontend/src/pages/admin/QualityAuditWizardPage.tsx)
- MVP: [`retail_quality_audit.md`](./retail_quality_audit.md)

---

## Sessions

### Session 1 — 2026-07-29

- **Goal:** Ship submission reliability — recover stranded audits, autosave + draft history, +/- grades, week count, derive_result honesty; then dashboard deep links + 8-week grids + mobile.
- **Finish line:** Carrie's Jul 24 audit grades the dashboard; managers can see and resume drafts; B+ goals are achievable; day cells open audits.
- **Scope:** Code + management command for #15/#17; dashboard metrics `?weeks=` + audit ids; mobile layout polish. No broader form redesign.
- **Out of scope:** Photo S3 upload; multi-location QA; employee-role access.
- **Estimated time:** est 3h
- **Started:** 2026-07-29T16:55:00-05:00
- **Ended:** 2026-07-29T18:15:00-05:00
- **Ship:** **v2.60.0**, polish **v2.61.0**.

**Session updates:**
- Recovered prod audits #15 (B+) and #17 (B, Carrie Jul 24); dashboard last_grade now B.
- Shipped autosave, draft hub history/resume, DELETE drafts, +/- grades, week off-schedule count, photo/chips honesty.
- Dashboard: `retail_audit_ids` / `form_slug`, deep-link cells, 8-week scroll grids (2-week viewport + snap-back), mobile department + sales polish, uniform cards.
- Fixed blank wizard (`useBlocker` incompatible with `BrowserRouter`).
- Tests: Django QA + dashboard metrics OK; vitest green; frontend build green; Heroku **v307**.

#### Result

- `committed as v2.60.0 at 895ab2c` + `v2.61.0 at 6e5e9d8` (live Heroku v307)
- Owner closed 2026-07-30 → `_archived/_completed/`
