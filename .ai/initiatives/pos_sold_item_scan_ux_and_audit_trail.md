<!-- initiative: slug=pos-sold-item-scan-audit status=shipped updated=2026-04-06 -->
<!-- Last updated: 2026-04-06T18:30:00-05:00 -->
# Initiative: POS — sold-item scan UX + audit trail

**Priority:** **Shipped** in **v2.2.8** (confirm then archive per user). Core UX, audit, resale copy API, and staff-only transaction captions are in production notes below.

---

## Context

- Cashiers scan SKUs at the POS terminal. When the underlying inventory `Item` is already **`sold`**, the sale cannot proceed, but the experience is poor: the terminal effectively treats it like a missing SKU (“can’t find item” / generic not-found messaging).
- Operations need **clear feedback** that the barcode resolved and inventory **reports the item as already sold**, not that the system failed to look up the code.
- Separately, the business needs a **defensible audit trail** when a physical tag is scanned after a sale (mis-tagged shelf, return-to-floor, theft concern, duplicate sale attempt, etc.) — without guessing implementation in this doc beyond options to decide.

**Known backend behavior (verify during implementation):** `CartViewSet.add_item` resolves `Item` by SKU; if `item.status == 'sold'` it returns **400** with detail **`Item already sold.`** The terminal client currently collapses errors into a generic snackbar (e.g. “Item not found”), which misleads staff and hides the real reason.

---

## Objectives

1. **Staff-facing UX** — On scan of a sold item, show an explicit message such as: inventory indicates this item is **already sold** (not “unknown SKU”). Optionally distinguish **404** (no row) vs **400 sold** vs other validation errors.
2. **Operational clarity** — Message copy should be calm, actionable (e.g. verify tag, check floor, involve a lead); avoid blaming the cashier.
3. **Audit trail (backend plan)** — Decide and document how to record “sold item scanned at POS” events so reporting and investigations are possible:
   - **Option A — Event-only:** append-only log (e.g. extend or align with existing `ItemScanHistory` / POS logging) with `item_id`, `sku`, `user`, `register/drawer`, `timestamp`, `outcome=sold_blocked`, optional `notes`.
   - **Option B — Inventory action:** manager flow to **duplicate for resale** or **mark on shelf** (reuse patterns from inventory / Quick Reprice / `duplicate_item_for_resale`-style flows) with a clear **caveat** on the new or updated row (e.g. source = POS, “second physical scan after recorded sale”).
   - **Option C — Hybrid:** always log the scan; optional guided next steps only for roles that may create/adjust inventory.

**Open product questions (resolve with stakeholders):** Should a second sale ever auto-create stock, or must every resale be an explicit inventory action? What retention and who can view audit entries?

---

## Workstreams (implementation order TBD)

| Step | Action |
|------|--------|
| W1 | Trace end-to-end: `TerminalPage` scan handler → `addItemToCart` API → `apps/pos/views.py` `add_item`; map status codes and error bodies. |
| W2 | **Frontend:** Parse API errors; show distinct copy for sold vs missing SKU; keep a11y (announce errors for screen readers if applicable). |
| W3 | **Backend audit:** Confirm whether `ItemScanHistory` (or successor) should record failed adds; avoid double-writing if scan logging already exists for successful adds only. |
| W4 | If product chooses duplicate/resale path: align with inventory rules (single source of truth for SKU, consignment, receipts); document migration/reporting impact. |

---

## Risks / constraints

- **Sales integrity:** Any “create item from POS” path must not silently rewrite history or completed sale lines.
- **Performance:** Extra logging per failed scan must be cheap (indexed fields if queried often).

---

## Related code (starting points — verify in repo)

- Backend: `apps/pos/views.py` — `CartViewSet.add_item`; `Item` status checks; `ItemScanHistory` creation on successful add.
- Frontend: `frontend/src/pages/pos/TerminalPage.tsx` — `handleScanInput` error handling; `frontend/src/hooks/usePOS.ts` — `useAddItemToCart`; `frontend/src/api/pos.api.ts` — `addItemToCart`.

---

## Acceptance

- [x] Scanning a **sold** SKU shows inventory-specific messaging (not generic “not found”).
- [x] Missing SKU still shows a clear “not found” (or equivalent) path.
- [x] Documented decision on **audit trail** (event log vs inventory action vs hybrid) and any schema/API follow-ups listed for a second PR if split.

**Shipped (implementation):**

- **Audit:** `ItemScanHistory` with `outcome` (`added_to_cart` | `pos_blocked_sold` | `public_lookup` | `audit_scan`), optional `cart`, `created_by`. Failed `add-item` on sold SKU logs `pos_blocked_sold` before the 400.
- **Staff-only disclosure (not customer-facing):** Internal resale context appears in three places: (1) cashier **modal** on [`TerminalPage`](../../frontend/src/pages/pos/TerminalPage.tsx) after a sold scan — Cancel vs **Create copy and add to cart**; (2) **`Item` / DB** — duplicate-for-resale notes on the new unit as today; (3) **Transactions** detail on [`/pos/transactions`](../../frontend/src/pages/pos/TransactionListPage.tsx) — caption when `resale_source_sku` is set. **Receipts / print:** line items use normal product **description** only — no resale provenance on what the customer sees; **print server** not modified for this.
- **API:** `add-item` returns `ITEM_ALREADY_SOLD` + `item_id`, `sku`, `title`. **`POST /pos/carts/{id}/add-resale-copy/`** duplicates atomically via [`apps/inventory/services/resale_duplicate.py`](../../apps/inventory/services/resale_duplicate.py). **`CartLine`** stores `resale_source_sku` / `resale_source_item_id` for staff/history, not for customer receipt text.
- **Tests:** [`apps/pos/tests/test_cart_add_item_audit.py`](../../apps/pos/tests/test_cart_add_item_audit.py), [`apps/pos/tests/test_cart_add_resale_copy.py`](../../apps/pos/tests/test_cart_add_resale_copy.py).

---

## See also

- `.ai/initiatives/_index.md` — initiative registry.
- Archived initiative notes on duplicate / mark-on-shelf / Quick reprice: `.ai/initiatives/_archived/_completed/e2e_retag_quick_reprice_fixes.md` (patterns may apply; confirm current APIs).
