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
