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
- [`apps/pos/quality_audit_templates.py`](../../../../apps/pos/quality_audit_templates.py) — checklist template
- [`frontend/src/pages/admin/QualityAuditHubPage.tsx`](../../../../frontend/src/pages/admin/QualityAuditHubPage.tsx)

---

## Sessions

### Session 2 — 2026-07-02

- **Goal:** Clean up the QA Forms admin UX and add a JSON/YAML export/import round-trip so forms can be redesigned externally (e.g. by an AI) and re-imported.
- **Updates:** `/admin/quality-audit/forms` split into a list-first page (**`QualityAuditFormListPage`** — rows with chips/counts, Edit / Export / Delete, New form + Import) and a decluttered editor (accordion sections, dropdown control picker, sticky save bar; no more blank editor under the list). **`qaFormFile.ts`** (`js-yaml`) handles export (JSON/YAML), tolerant import (missing ids generated, controls validated client-side), slug-match update-vs-create on import, and editor **Load from file**. Server `validate_definition` unchanged and still gates saves.
- **Result:** Shipped **v2.43.0** (2026-07-02); QA forms tests 10 OK, vitest 213 OK, build green.

### Session 1 — 2026-06-29

- **Goal:** Ship Retail QA MVP — mobile wizard, submit, dashboard grade.
- **Finish line:** Manager+ can complete a retail audit on phone and see grade on dashboard.
- **Scope:** Retail type only; dummy template; no photo/history admin UI.
- **Estimated time:** est 3h
- **Started:** 2026-06-29T12:00:00-05:00

**Result:** Shipped Retail QA MVP (**v2.38.0**); Session 2 forms UX closed under **v2.43.0**. Initiative archived completed 2026-07-09.
