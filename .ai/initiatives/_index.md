<!-- Last updated: 2026-09-02 (v2.77.0 Retail QA stabilize) -->
# Initiatives index

Bounded work (hours–days), one `.md` per initiative. Not a session log.

**Releases:** [`.version`](../../.version) + [`CHANGELOG.md`](../../CHANGELOG.md) only. GitHub: [`ship-push-git.md`](../protocols/ship-push-git.md). Heroku: [`ship-push-heroku.md`](../protocols/ship-push-heroku.md).

**Create:** [`initiative-create.md`](../protocols/initiative-create.md). **Review:** [`initiative-review.md`](../protocols/initiative-review.md). Filing / moves: [`.ai/extended/initiatives.md`](../extended/initiatives.md). **Human gate:** do not archive without explicit approval.

---

## Active

| Initiative | Phase | Notes |
|------------|-------|-------|
| [routines_and_documents](./routines_and_documents.md) | **Active** | Routines + Retail QA shipped **v2.76.0**, stabilized **v2.77.0**. Documents API in-tree; staff page parked for a later tune. |
| [admin_workspace_overhaul](./admin_workspace_overhaul.md) | **Active** | Phases 1–3 shipped **v2.74.0**. Grants deferred. |
| [universal_object_surfaces](./universal_object_surfaces.md) | **Design only** | Permissioned ObjectChip → ObjectSurface. No code scheduled. |

---

## Pending

Paused to resume later. Checklists live in each file.

| Initiative | Description | Pending since | Why / resume |
|------------|-------------|---------------|--------------|
| [online_sales_workspace](./_archived/_pending/online_sales_workspace.md) | Online Sales long-term vision (channels, marketing, P&L). | 2026-07-21 | MVP shipped via [online_sales_mvp](./_archived/_completed/online_sales_mvp.md) **v2.69.0**. Resume only for scope beyond MVP. |
| [tars_full_instruction_wizard_guidance](./_archived/_pending/tars_full_instruction_wizard_guidance.md) | TARS process canon / guardrails. | 2026-07-21 | **Superseded — closed to new work.** Scope is [finalize_tars_app](./_archived/_completed/finalize_tars_app.md). |
| [tars_restoration_workspace](./_archived/_pending/tars_restoration_workspace.md) | TARS queue + live bench (Phases 0–2 + hardening ~v2.39.0). | 2026-07-09 | **Superseded — closed to new work.** Scope is [finalize_tars_app](./_archived/_completed/finalize_tars_app.md). |
| [public_website](./_archived/_pending/public_website.md) | Public storefront rebuild. Phases 0–4 shipped **v2.26.0**. | 2026-05-30 | Launch ops covered by Online Sales MVP. Resume: Helcim/pay-online only if policy changes. |
| [historical_sell_through_analysis](./_archived/_pending/historical_sell_through_analysis.md) | Historical sell-through by category; PO extract + `PricingRule` seeds shipped. | 2026-04-10 | Deeper legacy DB / CSV / sales-join deferred. |
| [print_server_receipt_format](./_archived/_pending/print_server_receipt_format.md) | GDI receipt layout + `receipt_data` parity. | 2026-03-28 | Paused pre-production. |
| [create_location_label](./_archived/_pending/create_location_label.md) | Inventory-scan thermal location label (3×2, QR + aisle/shelf/category). | 2026-03-28 | Product integration deferred. |
| [historical_data_export](./_archived/_pending/historical_data_export.md) | Legacy → V3 data path. Phase 1 done. | 2026-03-28 | Phase 2 paused. |
| [bstock_scraper](./_archived/_pending/bstock_scraper.md) | B-Stock notebook scraper; Phase 1 package in place. | 2026-03-27 | Manifests/pipeline deferred. |

---

## Backlog

Not started / future; not scheduled.

| Initiative | Notes |
|------------|-------|
| [vendor_avatars](./_archived/_backlog/vendor_avatars.md) | Upload image per vendor; show on PO dashboard + Create PO. |
| [item_retail_price_on_instance](./_archived/_backlog/item_retail_price_on_instance.md) | Retail/estimated retail on `Item` (not Product). |
| [category_taxonomy_from_sales_history](./_archived/_backlog/category_taxonomy_from_sales_history.md) | Derive canonical categories from historical sales/inventory. |
| [schema_public_to_ecothrift](./_archived/_backlog/schema_public_to_ecothrift.md) | Move V3 Django tables from `public` to schema `ecothrift`. |

---

## Completed

Name only. Details in each file.

- [finalize_tars_app](./_archived/_completed/finalize_tars_app.md)
- [enhancement_requests](./_archived/_completed/enhancement_requests.md)
- [online_sales_mvp](./_archived/_completed/online_sales_mvp.md)
- [retail_qa_submission_reliability](./_archived/_completed/retail_qa_submission_reliability.md)
- [delivery_mobile_operations_completion](./_archived/_completed/delivery_mobile_operations_completion.md)
- [pos_discount_and_delivery](./_archived/_completed/pos_discount_and_delivery.md)
- [custom_label_studio](./_archived/_completed/custom_label_studio.md)
- [floorplan_builder](./_archived/_completed/floorplan_builder.md)
- [retail_quality_audit](./_archived/_completed/retail_quality_audit.md)
- [hr_time_clock_mvp](./_archived/_completed/hr_time_clock_mvp.md)
- [product_item_crud_and_processing](./_archived/_completed/product_item_crud_and_processing.md)
- [intake_processing_improvements](./_archived/_completed/intake_processing_improvements.md)
- [preprocessing_ai_cleanup_review](./_archived/_completed/preprocessing_ai_cleanup_review.md)
- [blog_studio](./_archived/_completed/blog_studio.md)
- [web_ui_cleanup](./_archived/_completed/web_ui_cleanup.md)
- [order_processing_pipeline_rebuild](./_archived/_completed/order_processing_pipeline_rebuild.md)
- [staff_nav_redesign](./_archived/_completed/staff_nav_redesign.md)
- [ui_ux_polish](./_archived/_completed/ui_ux_polish.md)
- [bstock_auction_intelligence](./_archived/_completed/bstock_auction_intelligence.md)
- [data_backfill_initiative](./_archived/_completed/data_backfill_initiative.md)
- [docs_restructure](./_archived/_completed/docs_restructure.md)
- [category_sales_inventory_and_taxonomy](./_archived/_completed/category_sales_inventory_and_taxonomy.md)
- [pos_unscannable_manual_line](./_archived/_completed/pos_unscannable_manual_line.md)
- [pos_sold_item_scan_ux_and_audit_trail](./_archived/_completed/pos_sold_item_scan_ux_and_audit_trail.md)
- [pos_cart_total_stale_prefetch_bug](./_archived/_completed/pos_cart_total_stale_prefetch_bug.md)
- [django_admin_legacy_navigation](./_archived/_completed/django_admin_legacy_navigation.md)
- [add_item_dialog_and_sources](./_archived/_completed/add_item_dialog_and_sources.md)
- [e2e_retag_quick_reprice_fixes](./_archived/_completed/e2e_retag_quick_reprice_fixes.md)
- [retag_cutover](./_archived/_completed/retag_cutover.md)
- [codebase_organization](./_archived/_completed/codebase_organization.md)
- [print_server_v3_testing_and_migration](./_archived/_completed/print_server_v3_testing_and_migration.md)
- [print_server_label_price_layout](./_archived/_completed/print_server_label_price_layout.md)
- [print_server_label_design](./_archived/_completed/print_server_label_design.md)

---

## Abandoned

- [inventory_intake_pipeline](./_archived/_abandoned/inventory_intake_pipeline.md)

---

## Lifecycle

| Phase | Action |
|-------|--------|
| **Draft** | File may exist unlisted until scope is clear. |
| **Active** | Row in **Active**. |
| **Pending** | Paused off Active; listed above; files in `_archived/_pending/`. |
| **Backlog** | Future / not started; `_archived/_backlog/`. |
| **Completed** | Scope delivered; `_archived/_completed/`. |
| **Abandoned** | Will not pursue; `_archived/_abandoned/`. |

Create / move: [`extended/initiatives.md`](../extended/initiatives.md). Same pass updates this file and [`ARCHIVE.md`](./_archived/ARCHIVE.md).

*Parent: [`.ai/context.md`](../context.md).*
