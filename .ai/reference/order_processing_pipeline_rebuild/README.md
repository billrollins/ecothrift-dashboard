# Order / processing pipeline rebuild — reference

Supporting material for initiative [`order_processing_pipeline_rebuild`](../../initiatives/order_processing_pipeline_rebuild.md). **Scope and execution steps live in the initiative file**, not here.

| Doc | Role |
|-----|------|
| [`intake_field_map.md`](intake_field_map.md) | Authoritative field names, NULL semantics, API shapes |
| [`data_flow_plan.md`](data_flow_plan.md) | Design draft (table roster, open questions) — partial supersession by shipped code |
| [`order_dashboard_surfaces.md`](order_dashboard_surfaces.md) | Orders list/detail surfaces |
| [`2026.05.08_intake_updates.md`](2026.05.08_intake_updates.md) | Data-flow effort supplement + SQL pointers |
| [`_sql/README.md`](_sql/README.md) | Order API SQL snippets (keep [`extended/sql/schema.csv`](../../extended/sql/schema.csv) in sync on schema changes) |
| [`_recon/README.md`](_recon/README.md) | Premigrate/postmigrate recon + `repair_intake_pipeline_pos` runbook |

Operational repair: `python manage.py repair_intake_pipeline_pos` (`--verify` / `--apply`).
