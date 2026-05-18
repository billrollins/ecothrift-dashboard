<!-- Last updated: 2026-05-18 (**v2.24.1** patch bookkeeping; production pushes require semver bump) -->
# Initiatives index

**Initiatives** are bounded pieces of work (often **hours to a few days**), tracked as **one markdown file** each—separate from month/year **roadmap** strategy, from **projects** (roughly week-scale), and from an AI’s internal **plan** / TODO execution.

**`CHANGELOG.md`** latest dated **`## [2.24.1]`** (processing gate hotfix: Processing decoupled from Receiving; structured processing-data validation). **`## [2.24.0]`** is the inbound intake stabilization release. **Rule:** every production push warrants a semver bump and changelog entry. Session message drives day-to-day priorities.

---

## Active initiatives

| Initiative | Phase | Notes |
|------------|-------|-------|
| [order_processing_pipeline_rebuild](./order_processing_pipeline_rebuild.md) | Active | **Inbound:** **Orders** + preprocessing + Processing are usable after **v2.24.1**; Receiving/Disputes remain operationally independent until staff are trained. **v2.24.0:** intake schema/repair/disputes/timeline stabilization. **v2.23.0:** persisted **`ProcessingRow.search_string`** + list **`searchString`** + **`rebuild_processing_search_string`**. Ref: **[Current Execution Steps](order_processing_pipeline_rebuild.md#current-execution-steps)** and **[Preprocessing — target UX](order_processing_pipeline_rebuild.md#preprocessing--target-ux)**. Supporting refs: [`_sql`](../reference/order_processing_pipeline_rebuild/_sql/README.md), [`_recon`](../reference/order_processing_pipeline_rebuild/_recon/README.md), [`2026.05.08_intake_updates.md`](../reference/order_processing_pipeline_rebuild/2026.05.08_intake_updates.md). |

Other `.md` files in this folder (e.g. buying or UI polish history) stay for **session logs and reference** until archived; they are **not** active initiatives until listed above.

**Current session details** (goal, finish line, updates) live **only** in each initiative file under **`## Sessions`** — not duplicated here.

**Archived initiatives** (completed, pending, backlog, abandoned) are listed only in [`_archived/ARCHIVE.md`](./_archived/ARCHIVE.md). Start there with **[TOC — `_completed/`](./_archived/ARCHIVE.md#toc-completed)**; the same file has the other disposition tables. Recent completions: [data_backfill_initiative](./_archived/_completed/data_backfill_initiative.md) (2026-04-11; v2.10.0), [docs_restructure](./_archived/_completed/docs_restructure.md) (2026-04-10), [category intelligence / taxonomy](./_archived/_completed/category_sales_inventory_and_taxonomy.md) (2026-04-06). Recent pending: [historical_sell_through_analysis](./_archived/_pending/historical_sell_through_analysis.md) (2026-04-10). Recent backlog: [vendor_avatars](./_archived/_backlog/vendor_avatars.md) (2026-04-29).

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
