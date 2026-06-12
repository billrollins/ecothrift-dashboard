<!-- Last updated: 2026-06-10 -->
# Reference (`.ai/reference/`)

Purpose-organized artifacts that support initiatives and implementation. **Not** a second changelog, plan store, or version registry.

| Area | Path | Purpose |
|------|------|---------|
| **Product identity (landmark design)** | [`product_identity/`](./product_identity/README.md) | Target design + Session handoffs — [`product_identity_design.md`](./product_identity/product_identity_design.md), [`session_4_handoff_questions.md`](./product_identity/session_4_handoff_questions.md); phases in [`intake_processing_improvements`](../initiatives/intake_processing_improvements.md) |
| Item/Product field matrix | [`item_product_creation_fields.md`](item_product_creation_fields.md) | Field-by-field cross-surface matrix (preprocessing / processing / Add Item / check-in) |
| Inbound intake (archived initiative) | [`order_processing_pipeline_rebuild/`](order_processing_pipeline_rebuild/README.md) | Field map, data-flow draft, [`_sql/`](order_processing_pipeline_rebuild/_sql/README.md), [`_recon/`](order_processing_pipeline_rebuild/_recon/README.md) — initiative archived [`_completed/`](../initiatives/_archived/_completed/order_processing_pipeline_rebuild.md) |
| Preprocessing CSV / cleanup | [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) | Step 2 offline CSV + legacy `ai-cleanup-rows`; initiative [`preprocessing_ai_cleanup_review`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md); Fable handoff `workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md` |
| Audits | [`deep_dive/`](deep_dive/latest/) | Ephemeral `latest/` reports + stable [`_report-templates/`](deep_dive/_report-templates/) |
| Large diffs | [`diffs/`](diffs/) | Optional human summaries of big merges |
| Shopify site copy | [`shopify-site-copy/`](shopify-site-copy/README.md) | Text scraped from ecothrift.us for public-site rebuild |

**Plans and sessions** live in [`.ai/initiatives/`](../initiatives/). **Releases** live in repo root [`CHANGELOG.md`](../../CHANGELOG.md).
