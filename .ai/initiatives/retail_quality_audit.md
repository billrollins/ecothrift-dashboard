<!-- initiative: slug=retail_quality_audit status=active updated=2026-06-29 -->
<!-- Last updated: 2026-06-29 -->
# Initiative: Retail Quality Audit

Mobile-first floor QA checklists under **Admin → Quality Audit**, starting with **Retail** (5 sections × 5 checks). Submitted audits store auditor + timestamp and feed the dashboard **Retail QA** grade card.

## Objectives

- [x] Admin nav entry **Quality Audit** (Manager+)
- [x] Type picker hub (Retail only; placeholder for future types)
- [x] Mobile-first retail wizard with Pass / Fail / N/A checks
- [x] Summary review, edit sections, submit
- [x] Backend persistence + dashboard `last_grade` from latest submit

## Acceptance

- Manager or Admin can start a retail audit from `/admin/quality-audit`
- Wizard saves draft progress on each section advance
- Submit requires all checks answered; overall letter grade computed
- Dashboard Retail QA card shows latest submitted grade

## See also

- [`apps/pos/models.py`](../../apps/pos/models.py) — `QualityAudit`
- [`apps/pos/quality_audit_templates.py`](../../apps/pos/quality_audit_templates.py) — checklist template
- [`frontend/src/pages/admin/QualityAuditHubPage.tsx`](../../frontend/src/pages/admin/QualityAuditHubPage.tsx)

---

## Sessions

### Session 1 — 2026-06-29

- **Goal:** Ship Retail QA MVP — mobile wizard, submit, dashboard grade.
- **Finish line:** Manager+ can complete a retail audit on phone and see grade on dashboard.
- **Scope:** Retail type only; dummy template; no photo/history admin UI.
- **Estimated time:** est 3h
- **Started:** 2026-06-29T12:00:00-05:00

**Result:** (pending session close)
