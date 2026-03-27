<!-- Archived 2026-03-28: disposition=completed shipped=dashboard v2.2.3 initiative=e2e-retag-quick-reprice -->
<!-- initiative: slug=e2e-retag-quick-reprice status=completed updated=2026-03-28 -->
<!-- Last updated: 2026-03-28T12:45:00-05:00 -->
# Initiative: E2E — Retag history + Quick reprice (inventory)

**Priority:** **Completed** (2026-03-28). Archived per user request; release **v2.2.3** documents remaining UX (label reminder, Quick Reprice defaults + session persistence). Restored to the main index 2026-03-27 after a prior archive without explicit user approval; scope extended with Quick Reprice session UX and item detail actions.

**Receipt format:** [Print server — receipt format](../_pending/print_server_receipt_format.md) is **archived (pending)** for future polish.

---

## Context

- **Tested:** Retag flow and POS (open drawer, checkout) — core sale path works.
- **Shipped (earlier tranche):** Retag history UI, Quick reprice SKU filter, sold-item duplicate / mark-on-shelf — see `CHANGELOG` and `QuickRepricePage.tsx`, `ItemViewSet`, `duplicate_item_for_resale_view`, `mark_sold_item_on_shelf_view`.

---

## Objectives

1. **Retag history loads reliably** — History endpoint + UI show events; empty/error states are clear.
2. **“This session only” filter** — Toggle behaves predictably (correct query params, client state, no double-fetch bugs).
3. **Quick reprice finds every item** — Scanning or searching an item that was **just retagged** or **sold** must not fail with “not found” when a repricing workflow is still valid.
4. **Inventory truth on the row** — Results include **status** (Item is unit-level). Sold-edge: duplicate for resale, manager mark-on-shelf when no completed POS sale.
5. **Quick Reprice “This Session”** — Expandable list (chevron) of **all** items repriced this visit; each row links to **`/inventory/items/:id`**.
6. **Item detail** — **`/inventory/items/:id`**: **Print tag** and **Reprice** (deep-link to Quick Reprice with `?sku=`).

---

## Workstream A — Retag history

| Step | Action |
|------|--------|
| A1 | Trace `RetagPage` (or equivalent) history panel: API calls, params (`session`, date range, pagination). |
| A2 | Verify backend `retag_v2_history` (or named view): queryset, filters, permissions, serializer shape. |
| A3 | Fix client: loading state, error handling, toggle wiring for “This session only”. |
| A4 | Manual test: fresh session, toggle on/off, pagination if any. |

**Done when:** History lists events after retag; toggle matches spec; no silent empty list on success responses.

---

## Workstream B — Quick reprice (`/inventory/quick-reprice`)

| Step | Action |
|------|--------|
| B1 | **Reproduce** — Retag item → sell in POS → scan on Quick reprice; capture network + backend filter (likely excludes zero-qty, `sold`, or `is_active=false`). |
| B2 | **Inventory model rules** — Document how `Item` (or related) represents quantity, status, and sales lines; what must **not** change when fixing search (audit trail, `CartLine`, receipts). |
| B3 | **Search/list API design** — Extend or add query so **all** relevant `Item` rows are discoverable by SKU/barcode with **qty + status** in the payload. Distinguish: *findable for repricing* vs *eligible to print/sell*. |
| B4 | **UX** — If `quantity == 0` or status implies fully sold: show clear copy; optional **add quantity** (if allowed) vs **edit price on record** without implying phantom stock. Avoid breaking POS or duplicate SKU rules. |
| B5 | **Regression** — Normal on-shelf repricing unchanged; POS checkout unchanged; no accidental exposure of deleted/archived rows if business rules forbid. |
| B6 | **Session list + item page** — This Session expandable list with links to item detail; item detail **Print tag** + **Reprice**. |

**Done when:** User can open Quick reprice for any scanned SKU that still exists in DB with correct qty/status; edge cases (sold-through) have a defined, safe action; session list and item detail actions behave as acceptance.

---

## Risks / constraints

- **Sales integrity:** Repricing must not rewrite historical sale lines or back-date inventory in ways that break reporting.
- **Performance:** Broadening search must stay indexed (SKU/barcode) and paginated if list views grow.
- **Retag scaffolding:** `TempLegacyItem` / `RetagLog` are temporary per `.ai/extended/retag-operations.md` — fixes should not assume they live forever; prefer stable `Item`/POS APIs for Quick reprice.

---

## Related code (starting points — verify in repo)

- Frontend: `frontend/src/pages/inventory/QuickRepricePage.tsx`, `ItemDetailPage.tsx`, `RetagPage.tsx`, inventory API modules.
- Backend: `apps/inventory/views.py` (retag v2 + item search/list filters + duplicate/mark-on-shelf), serializers, `Item` queryset defaults.

---

## Acceptance (plan-level)

- [x] Retag history populates; “This session only” matches backend filter.
- [x] Quick reprice resolves items by exact SKU; status shown; sold flows (duplicate / manager mark-on-shelf) as implemented.
- [x] Quick Reprice **This Session**: expandable full list with links to `/inventory/items/:id`.
- [x] Item detail: **Print tag** and **Reprice** (`?sku=` to Quick Reprice).
- [x] Manual smoke: session links, print from item detail, reprice deep link *(accepted as complete for initiative closure; spot-check in browser as needed).*

---

## See also

- [`.ai/initiatives/_index.md`](../../_index.md)
- [Print server — receipt format](../_pending/print_server_receipt_format.md) *(archived — pending)*
- [`.ai/extended/retag-operations.md`](../../extended/retag-operations.md), [`.ai/extended/inventory-pipeline.md`](../../extended/inventory-pipeline.md)
