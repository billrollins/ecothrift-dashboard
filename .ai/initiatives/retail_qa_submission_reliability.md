<!-- initiative: slug=retail_qa_submission_reliability status=active updated=2026-07-29 -->
<!-- Last updated: 2026-07-29 -->
# Initiative: Retail QA submission reliability

**Status:** Active

Fix the reason completed retail QAs never reach the dashboard: the wizard's only save-to-server path is an explicit final "Submit" tap, and drafts are invisible everywhere. Recover stranded audits, wire autosave + draft resume/history, correct the grade scale and weekly counting, and stop untouched checks from auto-answering. Also ship dashboard deep links into submitted audits and longer department history.

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

## See also

- [`apps/pos/models.py`](../../apps/pos/models.py) — `QualityAudit`
- [`apps/pos/services/quality_audit.py`](../../apps/pos/services/quality_audit.py)
- [`apps/pos/services/dashboard_metrics.py`](../../apps/pos/services/dashboard_metrics.py)
- [`frontend/src/pages/admin/QualityAuditWizardPage.tsx`](../../frontend/src/pages/admin/QualityAuditWizardPage.tsx)
- Archived MVP: [`_archived/_completed/retail_quality_audit.md`](./_archived/_completed/retail_quality_audit.md)

---

## Sessions

### Session 1 — 2026-07-29

- **Goal:** Ship submission reliability — recover stranded audits, autosave + draft history, +/- grades, week count, derive_result honesty; then dashboard deep links + 8-week grids + mobile.
- **Finish line:** Carrie's Jul 24 audit grades the dashboard; managers can see and resume drafts; B+ goals are achievable; day cells open audits.
- **Scope:** Code + management command for #15/#17; dashboard metrics `?weeks=` + audit ids; mobile layout polish. No broader form redesign.
- **Out of scope:** Photo S3 upload; multi-location QA; employee-role access.
- **Estimated time:** est 3h
- **Started:** 2026-07-29T16:55:00-05:00
- **Ended:** 2026-07-29T18:00:00-05:00
- **Ship:** Released **v2.60.0**.

**Session updates:**
- Recovered prod audits #15 (B+) and #17 (B, Carrie Jul 24); dashboard last_grade now B.
- Shipped autosave, draft hub history/resume, DELETE drafts, +/- grades, week off-schedule count, photo/chips honesty.
- Dashboard: `retail_audit_ids` / `form_slug`, deep-link cells, 8-week scroll grids, mobile department + sales polish.
- Tests: Django QA + dashboard metrics OK; vitest 372 OK; frontend build green.

### Session Result

- **Shipped:** **v2.60.0** — Retail QA submission reliability, stranded-audit recovery command, +/- grades, dashboard deep links, 8-week department grids, mobile dashboard overhaul; also orders-list secondary ratios and leaner `scripts/dev/`. **v2.61.0** — QA wizard blank-page fix, 2-week grid viewport + snap-back, uniform department cards, EST/ACT REC colors, Orders summary strip with Trucks in Transit.
- **Decisions:** Recover only #15/#17 (not #11/#13); extend grade engine to +/- bands rather than constraining the goal picker; department history default 8 weeks (2–12 clamp); visible grid height stays 2 weeks with scroll for the rest.
- **Follow-ups:** Photo S3 upload; archive initiative when no further QA reliability work remains.
