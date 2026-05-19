# Reference (`.ai/reference/`)

Purpose-organized artifacts that support initiatives and implementation. **Not** a second changelog, plan store, or version registry.

| Area | Path | Purpose |
|------|------|---------|
| Inbound intake rebuild | [`order_processing_pipeline_rebuild/`](order_processing_pipeline_rebuild/README.md) | Field map, data-flow draft, [`_sql/`](order_processing_pipeline_rebuild/_sql/README.md), [`_recon/`](order_processing_pipeline_rebuild/_recon/README.md) — supports [`order_processing_pipeline_rebuild`](../initiatives/order_processing_pipeline_rebuild.md) |
| Final Review UI | [`fix_this.md`](fix_this.md), [`final_review_visual_rebuild_directive.md`](final_review_visual_rebuild_directive.md), [`final_review_visual_pass_plan.md`](final_review_visual_pass_plan.md), [`final_review_ui_rebuild_plan.md`](final_review_ui_rebuild_plan.md), [`consult_design_final_review.md`](consult_design_final_review.md) | Visual rebuild + behavior notes |
| Preprocessing CSV | [`cleanup_csv_contract.md`](cleanup_csv_contract.md) | `apply-cleanup-csv` / upload contract |
| Design mockups | [`Mockups/`](Mockups/) | JSX/markdown for preprocessing and receiving while UI still aligned |
| Audits | [`deep_dive/`](deep_dive/latest/) | Ephemeral `latest/` reports + stable [`_report-templates/`](deep_dive/_report-templates/) |
| Large diffs | [`diffs/`](diffs/) | Optional human summaries of big merges |

**Plans and sessions** live in [`.ai/initiatives/`](../initiatives/). **Releases** live in repo root [`CHANGELOG.md`](../../CHANGELOG.md).
