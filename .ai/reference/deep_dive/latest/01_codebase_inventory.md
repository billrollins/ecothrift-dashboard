# Codebase Inventory — 2026-05-18 (summary)

## Executive Summary

Inventory intake rebuild **shipped** at **`v2.24.0`** (migrations **`0045–0051`**, disputes, repair command, orders/receiving/processing hardening). **`v2.24.1`** patch: Processing gate decoupled from Receiving; structured validation on build-processing-data.

## Inventory (inbound)

| Area | Key symbols |
|---|---|
| Models | `PurchaseOrder` intake rails, `PreprocessingRow` on PO, `Dispute`, `ProcessingRow` |
| Services | `intake_gates`, `intake_po_repair`, `intake_undo`, `disputes`, `manifest_meta` |
| Command | `repair_intake_pipeline_pos` |
| FE | `OrderDetailPage`, `PreprocessingPage`, `ReceivingOrderPage`, `ProcessingWorkspacePage` |

## Preprocessing → Final Review

- `download-cleanup-csv` / `apply-cleanup-csv` / `preprocessing-review` / `finalize-preprocessing`
- **Pending:** visual rebuild ([`fix_this.md`](../../fix_this.md))

## Tests (spot-check)

- `test_intake_po_repair`, `test_disputes_api`, `test_preprocessing_redesign`, `test_receiving_api` — see **`CHANGELOG [2.24.0]`** / **`[2.24.1]`** for matrices run at release.

## Confidence

High for shipped intake; Medium without a full pytest run this steering-only pass.
