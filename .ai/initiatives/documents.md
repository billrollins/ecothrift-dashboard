<!-- initiative: slug=documents status=active updated=2026-09-08 -->
<!-- Last updated: 2026-09-08 (split from routines_and_documents) -->

# Initiative: Documents

**Status:** **Active** — Phase 1. API and page files are in-tree; staff routes and the account-menu link stay unwired until this UI ships. Split from [`routines_and_documents`](./_archived/_completed/routines.md) (Routines completed).

**Objective:** Staff have one Documents place for company paperwork and for paperwork that belongs to one person. A superuser publishes a company-wide PDF that everyone must read or accept, or assigns a PDF to one person to read, accept, or sign. Today the API can do pieces of this; the staff UI is off.

**Compass:** this file is the compass. Routines is done: [`routines`](./_archived/_completed/routines.md).

---

## Finish line

A superuser uploads a PDF and chooses **company-wide** or **individually assigned**. Company-wide staff see it as read-only or as an accept (and later non-signature completions). One named person can be asked to read, accept, or sign. Signing walks field-by-field to a flattened PDF. Company-wide items never ask for a signature.

---

## Assignment kinds

Two products, one catalog. Audience is the split. Action follows from the kind.

| Kind | Who | Actions |
|------|-----|---------|
| **Company-wide** | Everyone on staff (the company). | **Read only.** **Accepted** (I accept / I read this). Other non-signature completions later (the "etc"). |
| **Individually assigned** | One named person. | **Read only.** **Accepted check.** **Signed** (fields on the PDF, flatten + audit page). |

Signing is individual only. A handbook the whole store must accept is company-wide. A write-up, tax form, or policy that needs ink is assigned to one person.

In-tree today: `Document.mode` is `read` / `acknowledge` / `sign`; `DocumentAssignment.audience` is `person` / `everyone` / `role` / `department`. This initiative treats `everyone` as company-wide and `person` as individually assigned. Role and department slices are not a third kind; they stay out unless a later phase asks for them.

---

## Out of scope

- Routines (shipped; [`routines`](./_archived/_completed/routines.md))
- SOP / training document library, versioning, and a folder tree
- DOCX upload (export as PDF)
- Company-wide signatures (everyone signs the same field boxes)
- Customer-facing or public-site documents
- SMS or email nagging
- Role / department audience as a first-class kind (unless a later phase adds it)

---

## Phases

### Phase 1 — Company-wide
Staff Documents is live. A superuser publishes a company-wide PDF as **read only** or **accepted**. Every active staff member gets a recipient. Completing it records the read or the accept. No signature on this path.
**Gated by:** none.

Acceptance:
- [ ] `/documents*` and the account-menu Documents link are wired
- [ ] Superuser uploads a PDF, marks it company-wide, chooses read or accept, and toggles it live
- [ ] Each active staff member sees that item on Documents as read or accept (not sign)
- [ ] Read records that it was opened; accept is an explicit accepted check
- [ ] Toggle off / unassign removes it from staff lists
- [ ] Company-wide items cannot be set to signed

### Phase 2 — Individually assigned
A superuser assigns a PDF to one person as read, accept, or signed. Signed uses the in-tree field overlay and flatten.
**Gated by:** Phase 1.

Acceptance:
- [ ] Superuser picks one person and read, accept, or signed
- [ ] Only that person sees it on Documents
- [ ] Read and accept match the company-wide actions, for that person only
- [ ] Signed walks required fields, burns a flattened PDF, and appends the audit-trail page
- [ ] Superuser catalog shows per-person status (pending / viewed / completed)

---

## In the tree (not the finish line)

`apps.documents` and `frontend/src/pages/documents/` stay. Rewire `/documents`, `/documents/new`, `/documents/:id/edit`, `/documents/:id/sign` in `App.tsx` and put `documents` back on `PROFILE_NAV_IDS` in Phase 1. PDF only. Signing (when used) burns ink into a flattened PDF plus an audit-trail page.

---

## Acceptance

- [ ] Phase 1 company-wide
- [ ] Phase 2 individually assigned
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-08 — Opened (split).** Owner split `routines_and_documents`. Routines completed. Documents stays: company-wide (read, accepted, etc.) vs individually assigned (read, accepted check, signed).

---

## See also

- Routines (completed): [`routines`](./_archived/_completed/routines.md)
- Abandoned predecessor: [`documents_and_duties`](./_archived/_abandoned/documents_and_duties.md)
- Domain: [`.ai/extended/documents.md`](../extended/documents.md)
- Index: [`_index.md`](./_index.md)
