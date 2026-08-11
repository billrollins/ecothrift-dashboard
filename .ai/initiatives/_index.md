<!-- Last updated: 2026-08-11 (online_sales_mvp → _completed/; Active empty) -->
# Initiatives index

Bounded work (hours–days), one `.md` per initiative. Not roadmap strategy, not week-scale projects, not an AI plan/TODO list.

**Releases:** [`.version`](../.version) + [`CHANGELOG.md`](../../CHANGELOG.md) only. Every production push → semver + changelog.

Session details live **only** in each file under **`## Sessions`**.

---

## Active

*(none — start a new initiative with [`session.0.Create.md`](../protocols/session.0.Create.md) / [`code.0.Startup.md`](../protocols/code.0.Startup.md))*

---

## Pending

Paused to resume later. Full checklists and sessions are in each file.

| Initiative | Description | Pending since | Why / resume |
|------------|-------------|---------------|--------------|
| [online_sales_workspace](./_archived/_pending/online_sales_workspace.md) | Online Sales workspace long-term vision (channels, marketing, P&L). Phase 0 contract retained. | 2026-07-21 | MVP shipped via completed [online_sales_mvp](./_archived/_completed/online_sales_mvp.md) **v2.69.0**. **Resume:** only for scope beyond MVP (FB automation, contribution, B2B, etc.). |
| [tars_full_instruction_wizard_guidance](./_archived/_pending/tars_full_instruction_wizard_guidance.md) | TARS decision guardrails / worksheet / guidance (process canon + Bill-managed catalogs + improvement loop). Phase 1.5 Studio (`/restoration/tars`) shipped. | 2026-07-21 | Deferred for Deliveries release. **Resume:** owner/Mike floor validation → Phase 2 catalogs → Phase 3 improvement loop. |
| [tars_restoration_workspace](./_archived/_pending/tars_restoration_workspace.md) | TARS Restoration transactional product: queue + live bench. Phases 0–2 + hardening shipped (**~v2.39.0**). | 2026-07-09 | Bench live; execution/steering deferred. **Resume:** Phase 3 (verb panels, complete → location/dispatch) + Phase 4 (time premium / `AppSetting` steering). |
| [public_website](./_archived/_pending/public_website.md) | Public storefront rebuild (hostname split, curated catalog, shop UX). Engineering Phases 0–4 + polish shipped **v2.26.0**. | 2026-05-30 | Launch ops largely covered by Online Sales MVP go-live. **Resume:** Helcim/pay-online only if policy changes (MVP is pickup-only). |
| [historical_sell_through_analysis](./_archived/_pending/historical_sell_through_analysis.md) | Historical sell-through by category; PO extract + manual `PricingRule` seeds shipped. | 2026-04-10 | Deeper legacy DB / CSV / sales-join phases deferred until needed. |
| [print_server_receipt_format](./_archived/_pending/print_server_receipt_format.md) | GDI receipt layout + `receipt_data` parity; workspace tooling for reference. | 2026-03-28 | Paused pre-production. |
| [create_location_label](./_archived/_pending/create_location_label.md) | Inventory-scan thermal location label (3×2, QR + aisle/shelf/category). | 2026-03-28 | Product integration deferred. |
| [historical_data_export](./_archived/_pending/historical_data_export.md) | Legacy → V3 data path. Phase 1 (pickles + manifest) done. | 2026-03-28 | Phase 2 (seed, reporting, DS/embeddings) paused. |
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
| **Active** | Row in **Active**; update checklists/acceptance while working. |
| **Pending** | Off Active; listed in **Pending**; resume later. |
| **Backlog** | Future / not started; listed in **Backlog**. |
| **Completed** | Scope delivered; move to **Completed** list. |
| **Abandoned** | Will not pursue; move to **Abandoned** list. |

**Human gate:** do not move an initiative out of Active without explicit user approval.

Optional file header:

```html
<!-- initiative: slug=my-feature status=active updated=2026-03-27 -->
```

---

## Releases vs initiative docs

| Do | Don't |
|----|-------|
| Add `[Unreleased]` when **shipping code** that fulfills an initiative | Bump `.version` / `CHANGELOG` only because an initiative `.md` changed |
| Follow [`session.9.Close.md`](../protocols/session.9.Close.md) on release | Treat “one initiative” as “one minor bump” |

---

## Create / move

**Create:** add `descriptive_snake_name.md` → context, objectives, acceptance, `## Sessions`, See also → Active row → bump this file’s `Last updated`.

**Move** (pending / backlog / completed / abandoned): confirm with user → matching protocol under [`_protocols/`](./_archived/_protocols/README.md) → update **this** `_index.md` in one pass.

---

*Parent: [`.ai/context.md`](../context.md).*
