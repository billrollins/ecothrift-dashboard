<!-- Last updated: 2026-11-02 (opened from master handoff) -->
# Contractor agreements with e-signing

**Status:** waits for `packages/esign` 1.0.0 (master, 2026-11-02: Dark Horse builds it first; Eco-Thrift then vendors it, contractor agreement as first user here). Do not build `apps/esign` here. An early Eco-Thrift build exists, parked: lane/esign @ 6764766a (_worktrees/ecothrift-dashboard--esign), offered to master as reference.
**Directed by:** Eco-Thrift - Mainline (master handoff 2026-11-02; the Rollins sessions that started it were stopped, nothing built).

**Source:** Bill's doc https://claude.ai/artifact/QRX2yuDvtDW1ZsTCnfCUae (tab Agreement = Sections 1-9 + Bill's private notes; tab Dash handoff = the build spec). The doc holds the real contractor's names and terms: keep them out of the repo, tests and fixtures; real values go in through Dash's screens.

**Shape (master D22, 2026-11-02, standards row T81):** Dark Horse builds `apps/esign` and master publishes `packages/esign` 1.0.0 (`{master}/standards/documents.md`; signer screens follow the Thrift+ join flow, § 1). Eco-Thrift vendors 1.0.0, then builds the contractor agreement on it; offer letters move onto it later and keep running as they are until then.

## Spec in short (the doc is the source)

- Sections 1-9 become an editable, versioned template with fill-in fields (business name, Net 15, invoice numbers, check memo, scrap-money choice, ...). Bill's notes never go in it.
- Order: Bill fills in and sends; the contractor signs on a phone from an emailed single-use link (no Dash account); Bill countersigns; both get the same PDF.
- Kept off the staff side: no employee record, onboarding, schedule, time clock or login (protects contractor status).
- Valid e-signature (E-SIGN + Nebraska UETA): consent checkbox, locked text, single-use link, copy to both parties.
- Optional W-9 upload, owner-only (tax ID).
- Reuse the offer-letter signing pattern: single-use link, frozen text, drawn signature, PDF with audit page.
- Payment timing: each half-month invoiced after the period, paid within 15 days. Check-writing stays in Rollins; match its invoice scheme (`2026-10-B`, Rollins check templates v0.22.0).

## Draft plan (from the stopped session; not approved)

- New `apps/contractors`, owner-only: contractor list; versioned template (v1 = Sections 1-9 with blanks); one agreement per contractor with status, frozen text and SHA-256; optional private W-9.
- Dash > Contractors: fill in, preview, Send; countersign with the existing signature pad; download PDF; "Record notice" sets the end date 14 days out; template edits save a new version.
- Public signing page on dash.ecothrift.us, no login (like `/clock`): read, consent, name and title, draw signature; link works once, expires in 14 days.
- Final PDF (text, both signatures, audit page) emailed to both.
- Checks: tests with made-up names, tsc, an `[Unreleased]` entry.

## Open question for Bill

- Does he want a contractor invoice template in Dash too (mentioned, never built)?

*Parent: [`_index.md`](_index.md).*
