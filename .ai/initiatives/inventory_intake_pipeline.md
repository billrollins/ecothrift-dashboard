<!-- initiative: slug=inventory-intake-pipeline status=active updated=2026-04-28 -->
<!-- Last updated: 2026-04-28T16:45:00-05:00 (Session 2 — Order manifest UI + upload API hardening) -->

# Initiative: Inventory intake pipeline (order → dispute)

**Status:** Active

---

## Context

Staff **buy inventory** and run it through receiving, preprocessing, processing, wrap-up, and sometimes **dispute** resolution. This initiative names the **end-to-end operational flow** so work, sessions, and releases stay traceable.

The flow is modeled as six stages:

| Stage | Meaning (brief) | Target state |
|-------|-----------------|--------------|
| **1. Order** | Create and manage **Purchase Orders** (vendor, costs, manifest file, status steps: ordered → paid → shipped → delivered, etc.) | Working in app + API |
| **2. Receive** | Physical receiving / dock (queue, discrepancies — *scope TBD*) | **Deferred** — push later |
| **3. Preprocess** | PO **CSV manifest**: upload → standardize → AI cleanup → matching → pricing → finalize | Working in app + API |
| **4. Process** | M3-style **processing** (batches, tiers, item operations) tied to the PO | Working in app + API |
| **5. WrapUp** | Post-processing close-out (*scope TBD*) | **Deferred** — push later |
| **6. Dispute** | Vendor / B-Stock / carrier disputes (*scope TBD*) | **Deferred** — push later |

**Inventory** app: [`apps/inventory/`](../../apps/inventory/). **Frontend:** [`frontend/src/pages/inventory/`](../../frontend/src/pages/inventory/) (orders list/detail, preprocessing, processing). Deep reference: [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md).

---

## Infrastructure context (AWS, schemas — matters for manifests)

### AWS S3 — production **and** developer machines

**Both prod and dev use AWS** (`USE_S3` in [`ecothrift/settings.py`](../../ecothrift/settings.py)), not “local disk in dev / S3 in prod.” That means:

- **Collisions / surprises:** Uploading manifests (and other files) during **local testing** writes **real objects** into the configured bucket. After you deploy code expecting a clean slate, **objects may already exist** from earlier tests—or paths overlap conceptually with prod workflows—so “it worked on my machine” does not imply an empty or isolated bucket state.
- **Operational discipline:** Plan **periodic cleanup in AWS for dev/testing** (delete stale prefixes, orphaned `S3File` companions, or test objects by policy). Treat **dev bucket hygiene** as part of workflow, not an afterthought.
- **Desired improvement — partition dev uploads:** Prefer **isolating dev uploads** from prod using a stable prefix convention, e.g. environment + project, so dev never tramples prod-visible layout. Example shape (illustrative only until implemented): `{environment}/{project}/manifests/...` rather than a single flat `manifests/orders/...` for all worlds.

Today’s code path for PO manifests still uses keys like **`manifests/orders/{order_id}/{filename}`** ([`PurchaseOrderViewSet.upload_manifest`](../../apps/inventory/views.py))—see **Forward-looking conventions** below.

### Postgres — three schemas, shared database pattern

Production (and typical local restores) use a **single PostgreSQL database** that holds multiple **schemas** for different concerns and Heroku apps:

| Schema | Role (high level) |
|--------|-------------------|
| **`ecothrift`** | This Django app’s **`search_path`** — ORM tables for the Eco-Thrift dashboard (includes `S3File` and PO/manifest metadata). |
| **`darkhorse`** | Second **business** app/use case on the **same** database (shared Heroku Postgres across apps). |
| **`public`** | Legacy / cross-cutting / **personal** and tooling tables (not the Django default schema for V3 ORM—see [`.ai/extended/databases.md`](../extended/databases.md)). |

So: **three schemas support three use cases** (two business + personal/legacy/tooling patterns), **shared infrastructure** across Heroku apps—not three separate RDS instances. Naming in **S3** should mirror that mental model where it helps (**ecothrift** vs **darkhorse**, dev vs prod), even though blob storage is not “schema-aware.”

### Forward-looking conventions (AWS object layout)

- **Goal:** Clear org in S3: **`{environment}/{project}/...`** (e.g. **`dev/ecothrift/...`** vs **`prod/ecothrift/...`**) so **env**, **product**, and **file type** are obvious from the key.
- **Non-goal:** **No mass migration** of existing keys in this initiative—**do not restructure past work** in the bucket as a precondition. Older objects can stay where they are until a dedicated migration session; **from “now” onward**, new code should write under the agreed prefix pattern once env + project are wired (likely `AWS_LOCATION` / custom storage backend, or explicit path prefix in `save()`—design in a focused session).
- **Acceptance tie-in:** When we implement **partitioned dev uploads**, document the env var(s) and update [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) + [`.env.example`](../../.env.example) notes for `USE_S3` / prefix behavior.

---

## Objectives

1. **Pipeline clarity** — One named initiative covering the full life of bought inventory from **order** through **dispute**, with explicit deferrals where the product is not ready.
2. **Near-term shipping (today’s priority)** — **Order**, **Preprocess**, and **Process** pages and backing APIs behave as **production-complete** for daily use: no missing critical UI, no broken primary paths, manifests and standardization usable end-to-end.
3. **Storage hygiene** — Treat **dev vs prod file layout** on S3 as a first-class concern: plan **dev cleanup**, move toward **prefixed dev uploads** so testing does not collide with production expectations; keep **legacy keys** untouched until an explicit migration.
4. **Later** — **Receive**, **WrapUp**, and **Dispute** are acknowledged in the roadmap; implementation sessions can split out when scoped.

---

## Acceptance (near term: Order / Preprocess / Process)

Treat as “done” for this slice when:

- **Order**
  - Staff can create/edit POs and advance status where the app exposes it.
  - **CSV manifest upload** is available and working from the UI (multipart to `POST …/upload-manifest/` — see [`PurchaseOrderViewSet.upload_manifest`](../../apps/inventory/views.py)), with clear errors for auth/storage failures.
  - Order detail accurately reflects manifest file + preview metadata needed for preprocessing.
- **Preprocess**
  - With a manifest on the PO, staff can complete **standardize → cleanup → matching → pricing → finalize** without dead ends; errors are surfaced (not silent).
  - Navigation from order list/detail to preprocessing remains coherent.
- **Process**
  - Staff can run the **processing** workflow for lines/items tied to the PO (open from order/processing routes) without broken primary actions.

Regression checks: run through a **single PO** from create (or existing) → upload CSV → preprocess through finalize → process key steps. Document gaps in **`## Sessions`** as they appear.

---

## Out of scope (for this initiative’s *first* delivery pass)

- **Receive**, **WrapUp**, **Dispute** — no requirement to ship these in the first pass unless explicitly pulled into a session.
- Buying **auction** manifests (`/buying/*`) — separate domain; only touch when it blocks shared inventory behavior.

---

## Sessions

### Session 1

- **Goal:** Establish initiative, align **Order + Preprocess + Process** as the **today** priority; list known gap (PO manifest upload UI missing while API exists).
- **Finish line:** Initiative file + index row; shared understanding that **Receive / WrapUp / Dispute** are later; next session(s) execute hardening + missing UI/API fixes.
- **Scope:** Documentation only (`_index.md`, this file). Code changes tracked in follow-up sessions.
- **Est:** 0.25h
- **Start:** 2026-04-28T12:00:00-05:00

### Session 2

- **Goal:** Ship Order detail **manifest upload/replace** wired to `POST …/upload-manifest/`, multipart fix, backend decode/storage/replace safety; verify preprocessing handoff notes.
- **Finish line:** Staff can create/open a PO → upload CSV → **Preprocessing** unlocks → preprocessing flow unchanged except clearer copy; optional **`process-manifest`** atomic rows write.
- **Scope:** [`OrderDetailPage.tsx`](../../frontend/src/pages/inventory/OrderDetailPage.tsx), [`inventory.api.ts`](../../frontend/src/api/inventory.api.ts), [`apps/inventory/views.py`](../../apps/inventory/views.py), [`inventory.types.ts`](../../frontend/src/types/inventory.types.ts), [`PreprocessingPage.tsx`](../../frontend/src/pages/inventory/PreprocessingPage.tsx) alert copy, [`inventory-pipeline.md`](../extended/inventory-pipeline.md), `CHANGELOG.md` `[Unreleased]`.
- **Est:** 4h
- **Start:** 2026-04-28T15:30:00-05:00
- **Result:** Shipped **Order detail** Raw Manifest upload/replace (`useUploadManifest`, multipart fix in `inventory.api.ts`). **`upload-manifest`** hardened (UTF-8 decode, empty header, storage/DB errors + `code`; link new file before deleting old blob). **`process-manifest`** row writes wrapped in **`transaction.atomic()`**. Types: **`PurchaseOrder.manifest_rows`**. Preprocessing alert points to Order detail **Raw Manifest**. Docs: **`inventory-pipeline.md`**, **`backend.md`**, **`CHANGELOG.md` `[Unreleased]`**.

---

## See also

- [`.ai/extended/databases.md`](../extended/databases.md) — `ecothrift` / `darkhorse` / `public`, `search_path`, Heroku restores
- [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) — PO model, CSV upload, templates, `ManifestRow`, processing references
- [`frontend/src/api/inventory.api.ts`](../../frontend/src/api/inventory.api.ts) — `uploadManifest`, `processManifest`, previews
- [`frontend/src/pages/inventory/OrderDetailPage.tsx`](../../frontend/src/pages/inventory/OrderDetailPage.tsx), [`PreprocessingPage.tsx`](../../frontend/src/pages/inventory/PreprocessingPage.tsx), [`ProcessingPage.tsx`](../../frontend/src/pages/inventory/ProcessingPage.tsx)

*Parent: [`.ai/initiatives/_index.md`](_index.md).*
