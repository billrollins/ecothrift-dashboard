# workspace/testing

Manual E2E checklists and test-run templates (tracked). Fill in results locally; add more `.md` files here as needed.

- **`e2e_retag_pos_sales_verification.md`** — Retag → labels → POS → reprice → SQL verification.
- **`data/`** — `retag_e2e_10_items.json` / `.csv`, generator script, and **`print_e2e_retag_labels.bat`** (one level up) — prints labels with **plain QR** and legacy footer `ecothrift_logo_bw.png`.
- **Plain QR (smoke test)** — `branded_qr_smoke_test.py` writes **`plain_qr_website.png`** + **`plain_qr_sku.png`** to `output/` (gitignored), using the same `_make_qr` as labels. Optional: `pip install pyzbar` to verify decode.

Referenced from `.ai/extended/retag-operations.md`.
