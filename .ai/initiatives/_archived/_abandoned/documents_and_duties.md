<!-- Archived 2026-08-31: disposition=abandoned — Library + QA-in-library was the wrong product; replaced by routines_and_documents -->
<!-- initiative: slug=documents-and-duties status=abandoned updated=2026-08-31 -->
<!-- Last updated: 2026-08-31 -->

# Initiative: Documents and routine duties

**Status:** **Abandoned** — replaced by [`routines_and_documents`](../../routines_and_documents.md).

**Objective:** Staff get one place for every operating document and one engine that serves the duties those documents describe. A superuser writes a policy, SOP, checklist, audit, or log once, assigns it on a schedule, and the person responsible gets a nag they cannot dismiss until the work is done. Overdue work is visible so it can be chased in person. Today none of this exists: Retail QA is a one-off feature in `apps/pos`, Forms Studio edits only QA forms, and every policy, SOP, sign, and log lives outside the app.

**Compass:** This file is the compass. [`admin_workspace_overhaul`](./admin_workspace_overhaul.md) is delivered except deferred grants; [`universal_object_surfaces`](./universal_object_surfaces.md) stays design-only.

---

## Finish line

A superuser creates a duty in a few clicks against a document or a template. The assignee sees a notification they cannot dismiss until the work is done, and it opens the exact thing due. Anyone can open a report and see what is overdue and who owns it. Retail QA is one template inside this system, not its own feature.

---

## Model

Nine kinds of paperwork collapse into three primitives and two overlays. Build the primitives; do not build nine features.

| Primitive | Is | Today |
|-----------|-----|-------|
| **Doc** + **DocVersion** | A versioned artifact you read, sign, or print | nothing |
| **Template** | A fillable definition | `QualityAuditForm.definition` (`apps/pos/models.py`) |
| **Submission** | One filled instance of a Template | `QualityAudit` (`apps/pos/models.py`) |

| Overlay | Is |
|---------|-----|
| **Acknowledgement** | A user read or signed **one DocVersion** |
| **Duty** | Schedule + assignee against a Doc (read / sign) or Template (perform); generates instances with a due date and drives the nag |

Mapping:

| Paperwork | Primitive |
|-----------|-----------|
| Policies / handbook | Doc `policy` + Acknowledgement |
| Reference / how-to | Doc `reference` |
| Printables (signs, past marketing) | Doc `printable` |
| Security and other signed files | Doc + Acknowledgement; annual re-sign is a Duty |
| SOPs / training manuals | Doc `sop`; audits cite the SOP |
| Audits | Template + Submission (graded) |
| Logs (service, deliveries) | Template + Submission (append-only, ungraded) |
| Checklists (open / close, truck) | Template + Submission (pass-fail) |
| Forms / worksheets | Template (digital) **and** Doc `printable` (blank) from one source |

**Two facets, no folder tree.** `department` is an FK to `hr.Department` + `kind`, plus free tags. Saved views, not paths. A folder tree breaks the first time two departments want the same document.

**Years are not folders.** "Signed annually for ten years" is a `DocVersion` chain with one `current`; an Acknowledgement points at a version, so signing the 2019 handbook is provably not signing the 2026 one. Submissions carry a `period_key` (`2026`, `2026-W35`, `2026-08-27`) so ordering, "is this period done?", and overdue math come free.

---

## Out of scope

- No external e-sign vendor. Signature capture is home-grown, reusing `frontend/src/components/pos/delivery/SignaturePad.tsx`.
- No folder tree and no general-purpose DMS.
- No customer-facing or public-site documents.
- No SMS or email nagging. In-app only.
- Nothing about payroll or HR compliance filings.

---

## Phases

### Phase 1 — Document library
A **Library** workspace (`9` / `L`) holds every policy, SOP, reference page, and printable, each with version history, written in-app or uploaded as a file. App: `apps/library` at `/api/library/`.
**Gated by:** none.

Acceptance:
- [x] `apps/library` with `Doc` + `DocVersion`; `kind` (`policy` / `sop` / `reference` / `printable`); `department` FK to `hr.Department`; tags; one `current_version` per Doc
- [x] A DocVersion body is rich text **or** an uploaded file (XOR `CheckConstraint`); both kinds render and both print from the browser
- [x] Superusers create and version documents (`IsSuperAdmin`); staff read them (`IsStaff`). Old versions stay reachable and are never overwritten
- [x] Browse is faceted by department and kind with free-tag filter — no folder tree anywhere in the UI or the model
- [x] Library workspace at `/library/*`, digit `9`, letter `L` (Documents would steal **D** from Deliveries)
- [x] `.ai/extended/library.md` exists; `context.md` capability list updated
- [x] File write copies delivery (`default_storage` + `core.S3File`); file read streams like Label Studio `media` (never 302)
- [x] Rich text copies blog: TipTap `body_json` + `bleach`-sanitized `body_html`

### Phase 2 — Template engine
`Template` / `Submission` live in `apps.library` on the existing `pos_qualityaudit*` tables (`SeparateDatabaseAndState`). Performing is `IsStaff`. Forms Studio is `/library/templates`.
**Gated by:** Phase 1.

### Phase 3 — Acknowledge and sign
`Acknowledgement` unique per `(doc_version, user)`. Signature pad → S3. Reader sign gate when `requires_acknowledgement`.
**Gated by:** Phase 1.

### Phase 4 — Duties and the nag
`Duty` + `DutyInstance`. `materialize_duties` honours `hours.py`. Badge (30s), drawer, blocking modal.
**Gated by:** Phases 2 and 3.

### Phase 5 — Overdue reporting
`GET /api/library/duties/overdue-report/` + Dashboard section. `IsStaff`.
**Gated by:** Phase 4.

---

## Acceptance

- [x] Phase 1 — document library with versions, both body kinds, faceted browse
- [x] Retail QA survives the Phase 2 migration with its history intact
- [x] A duty nag cannot be dismissed while the work is outstanding
- [x] Out-of-scope items stay out

---

## Decisions (closed 2026-08-28)

- App is `apps/library`, mounted at `/api/library/`. Skeleton from `apps/labels`; per-action perms from `FloorPlanViewSet`.
- Workspace is **Library**, digit `9`, letter `L`. Routes `/library/*`. "Documents" would steal **D** from Deliveries.
- Templates and Submissions move into `apps/library` via `SeparateDatabaseAndState` (keep `db_table`). Grade bands, `na` exclusion, chips/photo `touched`, one-`feeds_dashboard` form, and system-form immutability stay.
- Performing a submission is `IsStaff` (today Retail QA is Manager+). Authoring stays `IsSuperAdmin`.
- Duties are materialized `DutyInstance` rows swept by `materialize_duties` on Heroku Scheduler. Business days from `apps/webstore/services/hours.py` (store closed Sunday and Monday), never Mon–Fri.
- The nag is a badge + drawer (StudioNotices grammar, server-derived, no dismiss flag). `is_blocking` duties also raise an uncloseable modal. notistack is not used.
- Overdue report is `IsStaff` on `GET /api/library/duties/overdue-report/` plus its own `DashboardPage` section — not wedged into the 45s-cached POS metrics payload.
- No server-side PDF generation. Printables are uploaded PDFs; rich text prints from the browser.

---

---

## Record

**2026-08-27 — Opened.** Retail QA and Forms Studio are being replaced rather than patched. Nine kinds of paperwork were reduced to Doc / Template / Submission plus Acknowledgement and Duty. Signatures are real and reuse the Delivery signature pad. Phases 2–5 stay high-level until the phase before them is built.

**2026-08-28 — Decisions closed.** Library workspace (`9` / `L`), `apps/library`, SeparateDatabaseAndState QA move, `IsStaff` submissions, materialized duties, hours.py calendar, badge+drawer nag, all-staff overdue report. Full build plan accepted.

**2026-08-28 — Phases 1–5 built.** Document library, QA move into `apps.library`, per-version signing, duty materialization + nag, overdue report on the Dashboard.

---

## See also

- Existing QA to absorb: `apps/pos/models.py` (`QualityAuditForm`, `QualityAudit`), `apps/pos/views.py`
- Signature pad to reuse: `frontend/src/components/pos/delivery/SignaturePad.tsx`
- Nav rules: [`admin_workspace_overhaul`](./admin_workspace_overhaul.md)
- Index: [`_index.md`](./_index.md)
