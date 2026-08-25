<!-- initiative: slug=pos_discount_and_delivery status=completed updated=2026-07-21 -->
<!-- Archived 2026-07-21: disposition=completed shipped v2.50.0 (discount + delivery board + printables) -->
<!-- Last updated: 2026-07-21 (completed → _completed/; v2.50.0) -->
# POS — discount (store credit) + delivery fees + appliance printables

**Status:** **Completed** (2026-07-21) — shipped in **[`CHANGELOG`](../../../../CHANGELOG.md) v2.50.0**. Optional later: Directions API waypoint optimize.

## Context

Cashiers need terminal actions for **in-store credit discounts** (returns) and **appliance delivery fees** with customer contact/address capture and a **scheduled delivery date**. Staff also need printable **bilingual warranty/delivery policy**, **sell log**, and **Saturday delivery driver log** (browser print; no in-app print chrome). Managers need a Dash **Deliveries** board to set available dates and see booked jobs.

## Objectives

1. Terminal **Discount** — cart-wide or per existing line; negative cart line; reason defaults to in-store credit / return.
2. Terminal **Delivery** — `$50` (≤5 mi) / `$75` (5–10 mi); capture name, phone, address, Apt? + Unit #, **what is delivered**, **delivery date** from available slots; persist on the line; show on receipt description.
3. Printables (static HTML, landscape where logs): appliance warranty+delivery policy (EN + Mexican Spanish), sell log, delivery driver log (≤15 stops).
4. Dash **Deliveries** — list all deliveries/dates; managers configure available dates (date, times, who, 1 vs 2 person) with counts of items and deliveries already booked.

## Acceptance

- [x] Discount and delivery add lines via dedicated API; cart totals recalculate; discount cannot drive subtotal below $0.
- [x] Terminal buttons + dialogs; delivery requires an available date; affected line auto-scroll still works.
- [x] Policy / sell log / driver log open from Cashier nav and print from the browser.
- [x] Policy content matches owner rules (no fridge/freezer; delivery fees excluded from warranty/75%; unified apt/home process; signature; no driveway drive-on).
- [x] Deliveries page lists jobs; managers CRUD available dates with booking counts.

## Operating contract (v2.50.0)

| Rule | Decision |
|------|----------|
| Fridge / freezer warranty | **Excluded** — EN + es-MX policy states refrigerators/freezers are not covered and not accepted for warranty claims. |
| Driver printable | **Saturday Delivery Log** — 15 stops + signature; print a second sheet when needed. |
| Distance tiers | Prefer Google driving miles when `GOOGLE_MAPS_API_KEY` is set; otherwise **straight-line fallback is allowed** and shown in the Terminal quote. |
| Maps route URL | Cap ~10 stops per URL; warn and use a second route/log sheet above 10. Directions API waypoint optimize **deferred**. |

## See also

- [`.ai/extended/pos-system.md`](../../../extended/pos-system.md)
- `.ai/reference/pos_terminal_cart_scroll/`
- [`.ai/initiatives/_index.md`](../../_index.md)
