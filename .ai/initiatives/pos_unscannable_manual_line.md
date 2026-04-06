<!-- initiative: slug=pos-unscannable-manual-line status=active updated=2026-04-06 -->
<!-- Last updated: 2026-04-06T20:30:00-05:00 -->

# POS — Unscannable (pink tag) manual cart line

## Outcome

Cashiers can add **inventory-free** cart lines for unscannable merchandise (e.g. pink tags) without a SKU: **`POST /api/pos/carts/{id}/add-manual-line/`** creates a `CartLine` with `item=null`, `description`, `unit_price` (default 0.50), `quantity` (default 1). Terminal: **Unscannable item** button, dialog with defaults **Pink Tag Item** / **0.50**, focus+select on description, Enter submits; cart list shows a **Pink tag** chip when `item` is null.

## Acceptance

- [x] Backend action validates open cart; no `ItemScanHistory` for manual lines
- [x] Completion/void behavior unchanged for lines without inventory (`item` null)
- [x] Tests: `apps/pos/tests/test_cart_manual_line.py`
- [x] Frontend: `addManualLineToCart`, `useAddManualLineToCart`, `TerminalPage` dialog

## See also

- [CHANGELOG](../../CHANGELOG.md) **v2.2.9**
- `apps/pos/views.py` — `add_manual_line`
- `frontend/src/pages/pos/TerminalPage.tsx`
