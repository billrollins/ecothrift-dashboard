<!-- Last updated: 2026-04-09T18:30:00-05:00 -->
# Initiatives index

**Initiatives** are bounded pieces of work (often **hours to a few days**), tracked as **one markdown file** each—separate from month/year **roadmap** strategy, from **projects** (roughly week-scale), and from an AI’s internal **plan** / TODO execution.

**`CHANGELOG.md` (`[Unreleased]`)** and the current session message also drive priorities.

---

## Active initiatives

Initiative files **not** under [`_archived/`](./_archived/ARCHIVE.md) (live at `.ai/initiatives/*.md`):

| Initiative | Notes |
|------------|--------|
| [bstock_auction_intelligence.md](./bstock_auction_intelligence.md) | B-Stock: Phases **1–4** + **4.1A** + **4.1B** complete (**v2.7.0** — AI template creation, AI key mapping, upload progress UI, usage logging, **`DELETE …/manifest/`**); **Phase 5** auction valuation **blocked on** [historical sell-through](./historical_sell_through_analysis.md) Phase **3** output; then outcomes (**Phase 6**). |
| [historical_sell_through_analysis.md](./historical_sell_through_analysis.md) | Per-category sell-through (`sum(sold_price)/sum(retail_value)` per **`fast_cat_value`**) from V1/V2/V3 + historical manifests via fast-cat pipeline; **feeds Phase 5** pricing rules. **Shipped:** multi-DB PO extract → **`workspace/notes/to_consultant/purchase_orders_all_details.csv`** (**v2.7.1**; see initiative **Delivered tooling**). |

**Archived initiatives** (completed, pending, backlog, abandoned) are listed only in [`_archived/ARCHIVE.md`](./_archived/ARCHIVE.md). Start there with **[TOC — `_completed/`](./_archived/ARCHIVE.md#toc-completed)**; the same file has the other disposition tables. Recent completions: [category intelligence / taxonomy](./_archived/_completed/category_sales_inventory_and_taxonomy.md) (2026-04-06). Recent POS work: [cart totals v2.2.7](./_archived/_completed/pos_cart_total_stale_prefetch_bug.md), [sold-SKU / audit v2.2.8](./_archived/_completed/pos_sold_item_scan_ux_and_audit_trail.md), [unscannable manual line v2.2.9](./_archived/_completed/pos_unscannable_manual_line.md).

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
- **On release:** follow [`.ai/protocols/review_bump.md`](../protocols/review_bump.md) (bump `.version`, root `package.json`, new `CHANGELOG` section). **Patch vs minor** follows user-visible/API semver for the app—not “one minor bump per initiative.”

---

## How to create a new initiative

1. Add `descriptive_snake_name.md` under **`.ai/initiatives/`**.
2. Include context, objectives, acceptance, and “See also” links.
3. Add a row to **Active initiatives** above.
4. Update the `<!-- Last updated: ... -->` timestamp on this file when you change the index.

---

## How to archive (short)

1. **Confirm with the user** that the initiative should leave the active index.
2. Follow [`.ai/initiatives/_archived/ARCHIVE.md`](./_archived/ARCHIVE.md) — disposition, `git mv`, archive marker, update **`ARCHIVE.md`** and **this** `_index.md` in one pass.
3. Prefer the matching file under [`.ai/initiatives/_archived/_protocols/`](./_archived/_protocols/README.md) (`move_initiative_to_*`, `activate_initiative`) plus [`.ai/protocols/review_bump.md`](../protocols/review_bump.md) so **`.ai/context.md`** and **`CHANGELOG.md`** stay aligned.

---

*Parent: [`.ai/context.md`](../context.md).*
