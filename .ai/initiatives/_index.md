<!-- Last updated: 2026-07-13 (v2.50.0 POS delivery scheduling shipped) -->
# Initiatives index

**Initiatives** are bounded pieces of work (often **hours to a few days**), tracked as **one markdown file** each—separate from month/year **roadmap** strategy, from **projects** (roughly week-scale), and from an AI’s internal **plan** / TODO execution.

**Version / releases:** repo root [`.version`](../.version) and [`CHANGELOG.md`](../CHANGELOG.md) only — do not duplicate release history in initiative files. **Rule:** every production push warrants a semver bump and changelog entry.

---

## Active initiatives

| Initiative | Phase | Notes |
|------------|-------|-------|
| [online_sales_workspace](./online_sales_workspace.md) | **One-shot ship — v2.50.0** | Listing Studio + holds + POS guard + full Slot C Online Sales nav. Contract: [phase_0_contract.md](../reference/online_sales_workspace/phase_0_contract.md). |
| [tars_full_instruction_wizard_guidance](./tars_full_instruction_wizard_guidance.md) | **1.5 — Standalone Studio validation** | Full-screen new-tab TARS with one owned Bench item, Item State, focused actions, durable Restoration log, and idle-safe labor timer. Next: owner/Mike floor validation, then Phase 2 catalogs. |
| [pos_discount_and_delivery](./pos_discount_and_delivery.md) | **Scheduling board shipped — v2.50.0** | Discount + delivery fees + printables + **Deliveries** available-dates board; cart-line item select; Maps multi-stop URL. Optional: Directions API optimize. |

**Parked (off this index):** [tars_restoration_workspace](./_archived/_pending/tars_restoration_workspace.md) — Phases 0–2 + bench live; resume **Phase 3–4**. [public_website](./_archived/_pending/public_website.md) — storefront rebuild **shipped in code** (**v2.26.0**); resume for Heroku deploy, `seed_shop_categories`, Helcim + email wiring.

Other `.md` files in this folder (e.g. buying or UI polish history) stay for **session logs and reference** until archived; they are **not** active initiatives until listed above.

**Current session details** (goal, finish line, updates) live **only** in each initiative file under **`## Sessions`** — not duplicated here.

**Archived initiatives** (completed, pending, backlog, abandoned) are listed only in [`_archived/ARCHIVE.md`](./_archived/ARCHIVE.md). Start there with **[TOC — `_completed/`](./_archived/ARCHIVE.md#toc-completed)**; the same file has the other disposition tables. Recent completions: [custom_label_studio](./_archived/_completed/custom_label_studio.md) (2026-07-10; Label Studio + print-server **1.4.1**, **v2.48.0**–**v2.48.2**), [floorplan_builder](./_archived/_completed/floorplan_builder.md) (2026-07-09; editor + DB kinds + walls/cut **v2.39.0**–**v2.47.0**), [retail_quality_audit](./_archived/_completed/retail_quality_audit.md) (2026-07-09; Retail QA MVP + forms **v2.38.0** / **v2.43.0**), [hr_time_clock_mvp](./_archived/_completed/hr_time_clock_mvp.md) (2026-06-23; time clock + Time & payroll + Employees, **v2.33.0**–**v2.33.1**), [product_item_crud_and_processing](./_archived/_completed/product_item_crud_and_processing.md) (2026-06-22; catalog + processing integration **v2.29.0–v2.32.0**), [preprocessing_ai_cleanup_review](./_archived/_completed/preprocessing_ai_cleanup_review.md) (2026-06-10; Step 2 web AI cleanup review + implementation, **v2.28.0**), [blog_studio](./_archived/_completed/blog_studio.md) (2026-06-06; Blog Studio + DB-backed public blog, **v2.27.0**–**v2.27.2**). Recent pending: [tars_restoration_workspace](./_archived/_pending/tars_restoration_workspace.md) (2026-07-09; resume Phase 3–4), [public_website](./_archived/_pending/public_website.md) (2026-05-30; v2.26.0 code shipped), [historical_sell_through_analysis](./_archived/_pending/historical_sell_through_analysis.md) (2026-04-10). Recent backlog: [vendor_avatars](./_archived/_backlog/vendor_avatars.md) (2026-04-29).

---

## What an initiative is

- A **single outcome** or coherent slice of work with acceptance-style notes and links into the repo (apps, `printserver/`, `frontend/`, etc.).
- **One file per initiative** at the initiatives root while it is **live** (active, on hold, or not yet archived).
- Optional machine-readable line (HTML comment) at the top of the file:

```html
<!-- initiative: slug=my-feature status=active updated=2026-03-27 -->
```

---

## Lifecycle (keep the `.md` current)

| Phase | What to do |
|-------|------------|
| **Draft** | File may exist unlisted until scope is clear. |
| **Active** | Listed in the **Active initiatives** table above; update checklists and acceptance as you work. |
| **On hold** | Status banner at top of file **and** keep the file at the initiatives root until you archive or reactivate. |
| **Archived** | Move under `_archived/<bucket>/` per [`ARCHIVE.md`](./_archived/ARCHIVE.md). **Human gate:** do **not** archive unless the **user explicitly** approves (or confirms when asked). |

---

## CHANGELOG, `.version`, and releases

- **Do not** bump repo root [`.version`](../.version) or [CHANGELOG.md](../../CHANGELOG.md) **only** because an initiative file was added, edited, or archived. That keeps **product semver** separate from **steering docs**.
- **Do** add **`[Unreleased]`** bullets when **shipping code** that fulfills an initiative; you may cite the initiative filename for traceability.
- **On release:** follow [`.ai/protocols/session.9.Close.md`](../protocols/session.9.Close.md) (bump `.version`, root `package.json`, new `CHANGELOG` section). **Patch vs minor** follows user-visible/API semver for the app—not “one minor bump per initiative.”

---

## How to create a new initiative

1. Add `descriptive_snake_name.md` under **`.ai/initiatives/`**.
2. Include context, objectives, acceptance, **`## Sessions`** (when work starts), and “See also” links.
3. Add a row to **Active initiatives** above.
4. Update the `<!-- Last updated: ... -->` timestamp on this file when you change the index.

---

## How to archive (short)

1. **Confirm with the user** that the initiative should leave the active index.
2. Follow [`.ai/initiatives/_archived/ARCHIVE.md`](./_archived/ARCHIVE.md) — disposition, `git mv`, archive marker, update **`ARCHIVE.md`** and **this** `_index.md` in one pass.
3. Prefer the matching file under [`.ai/initiatives/_archived/_protocols/`](./_archived/_protocols/README.md) (`move_initiative_to_*`, `activate_initiative`) plus [`.ai/protocols/session.9.Close.md`](../protocols/session.9.Close.md) so **`.ai/context.md`** and **`CHANGELOG.md`** stay aligned.

---

*Parent: [`.ai/context.md`](../context.md).*
