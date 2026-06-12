# Product identity — reference project

Landmark design and handoff docs for **Product matching / creation** across the intake pipeline (manifest → preprocessing → processing → check-in). Implementation phases live in [`intake_processing_improvements`](../../initiatives/intake_processing_improvements.md).

| Doc | Role |
|-----|------|
| [`product_identity_design.md`](./product_identity_design.md) | **Target design** — three rules, confidence ladder, field precedence, collapse/split, schema delta |
| [`session_4_handoff_questions.md`](./session_4_handoff_questions.md) | **Session 4 (P2)** — Fable 5 answers; Final Decisions UI spec (shipped) |
| [`session_5_questions.md`](./session_5_questions.md) | **Session 5 (P3)** — Composer self-answered; precedence reads + check-in ladder + stop manifest writes |
| [`session_6_questions.md`](./session_6_questions.md) | **Session 6 (P4)** — Composer working log; split / N-products chip / remap (shipped) |
| [`session_7_questions.md`](./session_7_questions.md) | **Session 7 (P5)** — Composer working log; collapse / group-by-product / check in together (shipped) |
| [`session_8_questions.md`](./session_8_questions.md) | **Session 8 (P6)** — Composer working log; manifest match deprecation / merge retirement / assign shared product (shipped) |
| [`sessions_4_8_verification_checklist.md`](./sessions_4_8_verification_checklist.md) | **QA / review** — exhaustive automated + manual + grep gates for Sessions 4–8 |
| [`sessions_4_8_audit_log.md`](./sessions_4_8_audit_log.md) | **Audit record** — 2026-06-09 walkthrough results + fixes applied |
| [`fable_product_matching_review.md`](./fable_product_matching_review.md) | **Fable handoff** — owner questions on how matching works, correctness audit, staff verification playbook |
| [`fable_product_matching_audit.md`](./fable_product_matching_audit.md) | **Fable 5 audit (2026-06-10)** — answers Q1+Q2; 1 Rule-1 violation (F1 manifest sync), prioritized fixes, owner rulings on undo + Collapse rows wizard (P7) |
| [`../item_product_creation_fields.md`](../item_product_creation_fields.md) | Field-by-field cross-surface matrix (audit aid) |

**Shipped code pointers:** `apps/inventory/services/product_matching.py`, `PreprocessingRow.final_matched_product` / `match_candidates` / `match_source`, finalize carry in `processing_finalize.py`; P4 split in `processing_workspace.py` (`distinct_product_count`), `processing_ops.py` (mixed guard, `remap_check_in_batch_product`).

**Parent index:** [`.ai/reference/README.md`](../README.md).
