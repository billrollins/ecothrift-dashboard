<!-- initiative: slug=pos-cart-total-stale-prefetch status=shipped updated=2026-04-06 -->
<!-- Last updated: 2026-04-06T18:30:00-05:00 -->
# Initiative: POS — cart total out of sync with line totals

**Priority:** **Fixed** in **v2.2.7** (see `CHANGELOG.md`). **Scope:** diagnostic + acceptance; confirm then archive per user.

---

## Context (reported behavior)

Symptoms observed on the POS terminal after launch:

- First line shows a **line total** (e.g. $7.50) but **cart subtotal/total** stay at **$0**.
- Adding the same SKU again: line total updates (e.g. $15) but **cart total** reflects the **previous** step (e.g. $7.50).
- Adding another SKU: line totals look consistent for each row, but **cart total** appears **one update behind** (e.g. new lines sum in the UI but header/footer totals lag).

Hard refresh does **not** fix the mismatch — suggests **server-computed** cart aggregates or **consistent stale reads**, not only client cache.

**Hypothesis (verify first):** `Cart.recalculate()` sums `self.lines.all()`. `CartViewSet` uses **`prefetch_related('lines')`**. In Django, summing related lines **after** mutating a `CartLine` can read a **stale prefetch cache**, so `subtotal` / `tax_amount` / `total` saved on `Cart` may be **one mutation behind** while serialized `lines` are refetched or refreshed separately — producing exactly “lines correct, totals wrong by one step.”

Relevant code paths:

- `apps/pos/models.py` — `Cart.recalculate()`, `CartLine.save()` (recalculates `line_total`).
- `apps/pos/views.py` — `CartViewSet.get_queryset()` prefetch; `add_item` calls `cart.recalculate()` then reloads cart for response.

---

## Objectives

1. **Reproduce** with the same SKUs in dev/staging; capture API JSON for `POST .../carts/:id/add-item/` showing `lines[].line_total` vs `subtotal` / `total` on the **same** response.
2. **Root-cause** prefetch vs fresh queryset vs transaction ordering; confirm or reject the hypothesis above.
3. **Fix** so `subtotal`, `tax_amount`, and `total` always match the sum of persisted line totals after any line mutation (add, update qty/price, remove) — preferably one clear pattern (e.g. recalculate from DB without stale prefetch, or `refresh_from_db` / `prefetch_related` invalidation, or avoid prefetch on write paths).
4. **Regression tests** — backend tests for add-item (new line, increment quantity, multiple SKUs) asserting totals match line sums at each step.

---

## Workstreams

| Step | Action |
|------|--------|
| P1 | Reproduce + log response bodies; check `CartViewSet` list/retrieve vs mutation querysets. |
| P2 | Implement fix in **models** and/or **view** (minimal change; avoid broad refactors). |
| P3 | Add tests under `apps/pos/tests/` (or existing POS test module). |
| P4 | Smoke-test `TerminalPage` cart panel: totals match after each scan and after edit/remove. |

---

## Risks / constraints

- **Tax rounding:** totals must stay consistent with `tax_rate` and per-line math already in `Cart.recalculate()`.
- **No double-save side effects:** ensure drawer/cashier rules unchanged.

---

## Related code (starting points)

- `apps/pos/views.py` — `CartViewSet`, `add_item` (and any other line-mutating actions).
- `apps/pos/models.py` — `Cart`, `CartLine`, `recalculate`.
- `apps/pos/serializers.py` — `CartSerializer` / nested lines.
- Frontend: `frontend/src/pages/pos/TerminalPage.tsx` — displays `cart?.subtotal`, `cart?.total`, `line.line_total` (confirm no separate bug after backend fix).

---

## Acceptance

- [x] After each add-item (and line edit/remove), **subtotal/tax/total** equal the sum of **current** line totals (within tax rounding rules).
- [x] Automated test(s) cover the regression that caused “one step behind.”
- [ ] Manual smoke on hardware scanner path optional but recommended before closing.

---

## See also

- `.ai/initiatives/pos_sold_item_scan_ux_and_audit_trail.md` — separate POS launch issue (sold SKU messaging).
