<!-- Last updated: 2026-07-14 (personal app stack mirror handoff pack) -->
# Reference (`.ai/reference/`)

Purpose-organized artifacts that support initiatives and implementation. **Not** a second changelog, plan store, or version registry.

| Area | Path | Purpose |
|------|------|---------|
| **Personal app stack mirror** | [`personal_app_stack_mirror/`](./personal_app_stack_mirror/README.md) | Handoff pack for another AI: local Postgres + Django/DRF + Vite/React/TS + LLM router patterns; start [`00_stack_mirror_brief.md`](./personal_app_stack_mirror/00_stack_mirror_brief.md) |
| **POS terminal cart scroll QA** | [`pos_terminal_cart_scroll/`](./pos_terminal_cart_scroll/README.md) | Seeded `POSTEST##` SKUs + scenarios for cart visibility / auto-scroll ([`testing_skus.md`](./pos_terminal_cart_scroll/testing_skus.md)); `seed_pos_terminal_test_items` |
| **Online Sales Workspace** | [`online_sales_workspace/`](./online_sales_workspace/README.md) | Phase 0 accepted contract — nav/policy/data/security + Phase 1 brief ([`phase_0_contract.md`](./online_sales_workspace/phase_0_contract.md)); initiative [`online_sales_workspace`](../initiatives/online_sales_workspace.md) |
| **Product identity (landmark design)** | [`product_identity/`](./product_identity/README.md) | Target design + Session handoffs — [`product_identity_design.md`](./product_identity/product_identity_design.md), [`session_4_handoff_questions.md`](./product_identity/session_4_handoff_questions.md); phases in [`intake_processing_improvements`](../initiatives/intake_processing_improvements.md) |
| **TARS process + guidance** | [`TARS Restoration Processing App/`](./TARS%20Restoration%20Processing%20App/) | Standalone Studio [`product/technical contract`](./TARS%20Restoration%20Processing%20App/standalone_studio_contract.md); original prototype; Phase 0 [`discovery workbook`](./TARS%20Restoration%20Processing%20App/phase_0_discovery_workbook.md) + [`process canon`](./TARS%20Restoration%20Processing%20App/phase_0_process_canon.md); Phase 1 [`pilot record`](./TARS%20Restoration%20Processing%20App/phase_1_pilot_record.md); phases in [`tars_full_instruction_wizard_guidance`](../initiatives/tars_full_instruction_wizard_guidance.md) |
| Product / Item field cleanup planning | [`product_item_field_audit/`](./product_item_field_audit/README.md) | Phase 3 planning pack: decisions, target schema, lineage, code audit, migration/backfill, implementation plan, testing, ready-to-code gate |
| Item/Product field matrix | [`item_product_creation_fields.md`](item_product_creation_fields.md) | Field-by-field cross-surface matrix (preprocessing / processing / Add Item / check-in) |
| Inbound intake (archived initiative) | [`order_processing_pipeline_rebuild/`](order_processing_pipeline_rebuild/README.md) | Field map, data-flow draft, [`_sql/`](order_processing_pipeline_rebuild/_sql/README.md), [`_recon/`](order_processing_pipeline_rebuild/_recon/README.md) — initiative archived [`_completed/`](../initiatives/_archived/_completed/order_processing_pipeline_rebuild.md) |
| Preprocessing CSV / cleanup | [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) | Step 2 offline CSV + legacy `ai-cleanup-rows`; initiative [`preprocessing_ai_cleanup_review`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md); Fable handoff `workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md` |
| Audits | [`deep_dive/`](deep_dive/latest/) | Ephemeral `latest/` reports + stable [`_report-templates/`](deep_dive/_report-templates/) |
| Large diffs | [`diffs/`](diffs/) | Optional human summaries of big merges |
| Shopify site copy | [`shopify-site-copy/`](shopify-site-copy/README.md) | Text scraped from ecothrift.us for public-site rebuild |

**Plans and sessions** live in [`.ai/initiatives/`](../initiatives/). **Releases** live in repo root [`CHANGELOG.md`](../../CHANGELOG.md).
