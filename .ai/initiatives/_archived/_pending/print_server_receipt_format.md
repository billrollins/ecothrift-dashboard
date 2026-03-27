<!-- Archived 2026-03-27: disposition=pending paused off main initiatives index; resume when ready to ship receipt layout/width/GDI polish. -->
<!-- Last updated: 2026-03-27T14:00:00-05:00 -->
# Initiative: Print server — receipt format (V3)

**Status: ARCHIVED — pending (off main index).** Priority was [E2E — Retag history + Quick reprice](../_completed/e2e_retag_quick_reprice_fixes.md) (completed 2026-03-28) until inventory/retag/POS paths are fully reliable end-to-end. Resume this initiative when ready to ship receipt layout/width/GDI polish.

---

Improve **POS receipt** output from the local print server: layout, typography, width, and alignment on **Windows GDI** (`send_text`), while keeping the HTTP contract stable unless we intentionally version.

**Current behavior (baseline):**

- **`POST /print/receipt`** — `ReceiptPrintRequest.receipt_data` dict → `format_receipt_text()` in [`printserver/services/receipt_printer.py`](../../../../printserver/services/receipt_printer.py) → plain text → [`printer_manager.send_text`](../../../../printserver/services/printer_manager.py) (GDI monospace, `RECEIPT_WIDTH_CHARS`-wide logic).
- **`POST /print/test-receipt`** — `format_test_receipt_text()`.
- **ESC/POS** helpers still exist in the same module (`format_receipt` bytes) for reference/raw paths; production path is **GDI text** today.
- **Drawer kick** uses receipt printer role via `resolve_printer(..., role="receipt")`.

**AI context:** [`.ai/extended/print-server.md`](../../../extended/print-server.md).

---

## Objectives

1. **Readability** — clearer hierarchy (header, line items, totals, payment), consistent spacing, truncation/wrap rules for long product names.
2. **Width & alignment** — match real 80mm (or configured) paper; verify `RECEIPT_WIDTH_CHARS` in [`printserver/config.py`](../../../../printserver/config.py) vs `send_text` font sizing in `printer_manager`.
3. **Parity** — dashboard/POS payload fields in `receipt_data` match what formatters expect; document any new keys.
4. **Regression** — no breakage on **Test Receipt** from print server `/manage` or Settings; POS complete sale / reprint still work.

---

## Implementation map

| Area | File(s) |
|------|---------|
| Plain-text layout | [`printserver/services/receipt_printer.py`](../../../../printserver/services/receipt_printer.py) — `format_receipt_text`, `_txt_lr`, helpers; optional refactor into sections |
| GDI rendering | [`printserver/services/printer_manager.py`](../../../../printserver/services/printer_manager.py) — `send_text` (font face, size, printable width) |
| Width constant | [`printserver/config.py`](../../../../printserver/config.py) — `RECEIPT_WIDTH_CHARS` |
| API models | [`printserver/models.py`](../../../../printserver/models.py) — `ReceiptPrintRequest` |
| Routes | [`printserver/routers/receipts.py`](../../../../printserver/routers/receipts.py) |
| POS → print server | [`frontend/src/services/localPrintService.ts`](../../../../frontend/src/services/localPrintService.ts) — payload shape for `printReceipt` |
| Backend receipt payload | Django POS serializers/views that build `receipt_data` (discover via grep `receipt_data` / `printReceipt`) |

---

## Phases

1. **Audit** — Print sample receipts (test + real sale); capture paper width and font metrics; list gaps vs desired mockup.
2. **Spec (product)** — Lock line width, required fields, and optional sections (logo text, slogan, return policy).
3. **Implement** — Update `format_receipt_text` (+ `send_text` if needed); adjust POS payload if new fields required.
4. **Test** — `/print/test-receipt`, POS sale, reprint; thermal + PDF printer sanity check.
5. **Ship** — Bump `printserver/config.py` `VERSION` / `CHANGELOG`; `distribute.bat`; `PrintServerRelease` (and coordinate dashboard changes if any).

---

## Acceptance criteria

- Test receipt and live sale receipts print without error on assigned **receipt** printer.
- No regression on **label** or **drawer** endpoints.
- Documented `receipt_data` keys in this plan or `.ai/extended/print-server.md` when stable.

---

## Related

- [`printserver/routers/receipts.py`](../../../../printserver/routers/receipts.py)
- [`.ai/initiatives/_index.md`](../../_index.md)
- **Archived:** [label design](../_completed/print_server_label_design.md)
