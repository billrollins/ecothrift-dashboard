<!-- Last updated: 2026-04-15T12:00:00-05:00 -->
# Initiatives index

**Initiatives** are bounded pieces of work (often **hours to a few days**), tracked as **one markdown file** each—separate from month/year **roadmap** strategy, from **projects** (roughly week-scale), and from an AI’s internal **plan** / TODO execution.

**`CHANGELOG.md` (`[Unreleased]`)** and the current session message also drive priorities.

---

## Active initiatives

Initiative files **not** under [`_archived/`](./_archived/ARCHIVE.md) (live at `.ai/initiatives/*.md`):

| Initiative | Phase | Notes |
|------------|-------|-------|
| [bstock_auction_intelligence.md](./bstock_auction_intelligence.md) | Phase 6 next | **v2.13.0** — fast parallel sweep + raw SQL upsert + optional SOCKS5 for search; Phase 5 complete on production; outcome tracking next. |
| [ui_ux_polish.md](./ui_ux_polish.md) | Phase 3A shipped (**v2.12.1**) | Session 4 closed; buying list/detail Phase 3A in **CHANGELOG [2.12.1]**; **Phase 3B** (watch/thumbs, top categories, etc.) next when scheduled. |
| Groq / alternative AI cost optimization (parked) | Parked | See **Parking lot** in [bstock_auction_intelligence.md](./bstock_auction_intelligence.md). |

**Current session details** (goal, finish line, updates) live **only** in each initiative file under **`## Sessions`** — not duplicated here.

**Archived initiatives** (completed, pending, backlog, abandoned) are listed only in [`_archived/ARCHIVE.md`](./_archived/ARCHIVE.md). Start there with **[TOC — `_completed/`](./_archived/ARCHIVE.md#toc-completed)**; the same file has the other disposition tables. Recent completions: [data_backfill_initiative](./_archived/_completed/data_backfill_initiative.md) (2026-04-11; v2.10.0), [docs_restructure](./_archived/_completed/docs_restructure.md) (2026-04-10), [category intelligence / taxonomy](./_archived/_completed/category_sales_inventory_and_taxonomy.md) (2026-04-06). Recent pending: [historical_sell_through_analysis](./_archived/_pending/historical_sell_through_analysis.md) (2026-04-10).

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
- **On release:** follow [`.ai/protocols/session_close.md`](../protocols/session_close.md) (bump `.version`, root `package.json`, new `CHANGELOG` section). **Patch vs minor** follows user-visible/API semver for the app—not “one minor bump per initiative.”

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
3. Prefer the matching file under [`.ai/initiatives/_archived/_protocols/`](./_archived/_protocols/README.md) (`move_initiative_to_*`, `activate_initiative`) plus [`.ai/protocols/session_close.md`](../protocols/session_close.md) so **`.ai/context.md`** and **`CHANGELOG.md`** stay aligned.

---

*Parent: [`.ai/context.md`](../context.md).*
