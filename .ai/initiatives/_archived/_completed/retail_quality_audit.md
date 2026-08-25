<!-- initiative: slug=retail_quality_audit status=completed updated=2026-07-09 -->
<!-- Archived 2026-07-09: disposition=completed (Retail QA MVP + editable forms/import; shipped v2.38.0 / v2.43.0) -->
<!-- Last updated: 2026-07-09 (archived → _completed/) -->
# Initiative: Retail Quality Audit

**Status:** **Completed** (2026-07-09) — Retail QA MVP shipped **v2.38.0**; forms list + JSON/YAML round-trip **v2.43.0**. See [`CHANGELOG`](../../../../CHANGELOG.md) `[2.38.0]` / `[2.43.0]`.

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

- [`apps/pos/models.py`](../../../../apps/pos/models.py) — `QualityAudit`
- `apps/pos/quality_audit_templates.py` — checklist template
- [`frontend/src/pages/admin/QualityAuditHubPage.tsx`](../../../../frontend/src/pages/admin/QualityAuditHubPage.tsx)
