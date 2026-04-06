<!-- Last updated: 2026-03-30T15:00:00-05:00 -->
# Archive index — initiatives

## What this is

This folder, **`.ai/initiatives/_archived/`**, holds initiative markdown files that are **no longer tracked** on the [main initiatives index](../_index.md): work that is **done**, **parked**, **paused off the main list**, or **abandoned**. Files are grouped into subfolders by **disposition** so you can find them later without mixing “completed” with “we might never do this.”

**`ARCHIVE.md`** (this file) is the **table of contents** for all archived files and the **procedure** for archiving and maintaining the archive.

### Initiative lifecycle protocols (`_protocols/`)

Step-by-step protocols (which files to edit, `git mv`, `review_bump.md`) live in **[`_protocols/README.md`](./_protocols/README.md)** — **`activate_initiative`**, **`move_initiative_to_pending`**, **`move_initiative_to_backlog`**, **`move_initiative_to_completed`**, **`move_initiative_to_abandoned`**. Use those when the user drops a protocol into chat with an initiative name.

---

## How to archive

**Human gate:** An initiative is moved here only when the **user explicitly** approves archiving (or gives a direct instruction). Assistants should **ask** before `git mv` to `_archived/`; do not archive silently.

### 1. Choose a disposition

| Bucket | Use when |
|--------|----------|
| **`_completed/`** | The initiative’s stated scope was **delivered** (~100%). Note in the file or in `CHANGELOG` `[Unreleased]` / release notes when code shipped. |
| **`_pending/`** | Work is **paused** and you are **removing it from the main index** (not the same as **on hold** at the initiatives root—see below). Record what would resume it. |
| **`_backlog/`** | **Future** work that is **not started**, or intentionally **parked** here instead of cluttering the main backlog table. |
| **`_abandoned/`** | You **will not** pursue (or will not finish); keep the file for archaeology. One-line **why** in the TOC below. |

**On hold (root) vs `_archived/_pending/`:** **On hold** initiatives stay as **files in `.ai/initiatives/`** with a row in the main index. Move to **`_archived/_pending/`** only when you want the initiative **off the main index** but not deleted.

### 2. Mechanics

1. `git mv .ai/initiatives/<file>.md .ai/initiatives/_archived/_<bucket>/<file>.md`
2. At the top of the moved file, ensure an archive marker exists, e.g.  
   `<!-- Archived YYYY-MM-DD: disposition=completed ... -->`
3. Update **[`.ai/initiatives/_index.md`](../_index.md)** — remove the initiative from Active / On hold / Backlog.
4. Update **this file** (`ARCHIVE.md`) — add a row to the matching TOC section below.
5. Prefer **one pass** that moves the file and updates **both** the main **`_index.md`** and **`ARCHIVE.md`**.

### 3. How to update **ARCHIVE.md**

Whenever you **add**, **remove**, or **move** an archived initiative: edit the **TOC tables** in this file and bump the `<!-- Last updated: ... -->` timestamp. If the initiative was listed on the main index, that index must stay in sync in the **same update pass**.

---

<a id="toc-completed"></a>

## TOC — `_completed/`

| File | Summary | Archived |
|------|---------|----------|
| [print_server_label_design.md](./_completed/print_server_label_design.md) | Print server label “Concept C” side-stripe design; shipped **v1.2.x**. | 2026-03-27 (migration) |
| [print_server_label_price_layout.md](./_completed/print_server_label_price_layout.md) | Price fit scale grid, sub-dollar layout, `big_base` by digit count, fringe harness; shipped **v1.2.35–v1.2.38**. | 2026-03-28 |
| [print_server_v3_testing_and_migration.md](./_completed/print_server_v3_testing_and_migration.md) | V3 testing, V2 migration, installer/distribution validation. | 2026-03-27 (migration) |
| [codebase_organization.md](./_completed/codebase_organization.md) | Codebase organization plan; completed 2026-03-24. | 2026-03-27 (migration) |
| [retag_cutover.md](./_completed/retag_cutover.md) | Retag + old-dash cutover checklist; superseded by ops docs. | 2026-03-27 (migration) |
| [e2e_retag_quick_reprice_fixes.md](./_completed/e2e_retag_quick_reprice_fixes.md) | E2E retag history + Quick reprice (SKU filter, sold flows, session list, item Print/Reprice); label reminder + Quick Reprice 10% / session persistence — shipped **dashboard v2.2.3**. | 2026-03-28 |
| [add_item_dialog_and_sources.md](./_completed/add_item_dialog_and_sources.md) | Add Item flow (Items panel + `ItemForm`), AI suggest, misc/PO/consignment sources, hierarchical dev logging (`LOG_ADD_ITEM_*`). Estimated retail left for a future product decision. | 2026-03-28 |
| [django_admin_legacy_navigation.md](./_completed/django_admin_legacy_navigation.md) | Django **`contrib.admin`** at **`/db-admin/`**; React **`/admin/*`** no longer collides — hard refresh loads SPA; Vite proxies **`/db-admin`** only. Shipped 2026-03-30 (`CHANGELOG` `[Unreleased]`). | 2026-03-30 |

---

## TOC — `_backlog/`

| File | Summary | Archived |
|------|---------|----------|
| [schema_public_to_ecothrift.md](./_backlog/schema_public_to_ecothrift.md) | Move V3 Django tables from `public` to schema `ecothrift` for shared Postgres with `darkhorse`. | 2026-03-28 |
| [category_taxonomy_from_sales_history.md](./_backlog/category_taxonomy_from_sales_history.md) | Derive canonical category set from historical sales/inventory; map legacy labels → V3 seeds. | 2026-03-28 |

---

## TOC — `_pending/`

| File | Summary | Archived |
|------|---------|----------|
| [bstock_scraper.md](./_pending/bstock_scraper.md) | B-Stock notebook scraper; Phase 1 package in place; manifests/pipeline deferred (moved from `_backlog` 2026-03-27). | 2026-03-27 |
| [historical_data_export.md](./_pending/historical_data_export.md) | **Phase 1 done** (pickles + manifest). **Phase 2** (seed V3, reporting slice, DS/embeddings) paused off main index. | 2026-03-28 |
| [create_location_label.md](./_pending/create_location_label.md) | **Inventory-scan** thermal location label (3×2, QR + aisle/shelf/category) per `workspace/notes/ecothrift_label_spec.txt`. Workspace render/CLI exists; **product integration** deferred. | 2026-03-28 |
| [print_server_receipt_format.md](./_pending/print_server_receipt_format.md) | GDI receipt layout, `receipt_data` parity, PNG vs plain-text paths; **paused** off main index pre-production (2026-03-28); `render_scale` + workspace GDI tooling shipped for reference. | 2026-03-28 |

---

## TOC — `_abandoned/`

| File | Summary | Archived |
|------|---------|----------|
| — | *None yet.* | — |

---

*Parent: [`.ai/initiatives/_index.md`](../_index.md).*
