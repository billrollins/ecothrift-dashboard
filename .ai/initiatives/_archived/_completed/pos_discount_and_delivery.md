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

## Sessions

### Session 1
- **Goal:** Ship discount + delivery on POS terminal and the three printables.
- **Finish line:** Cashier can add discount/delivery on a live cart and open/print the three HTML tools.
- **Scope:** `apps/pos` cart lines + terminal UI + `frontend/public/pos/` printables + Cashier nav. Out of scope: full delivery scheduling DB, refunds, loyalty.
- **est** 3h
- **Started:** 2026-07-13T15:05:00-05:00
- **Session updates:**
  - Migration `pos.0010` `CartLine.line_kind` + `meta`; APIs `add-discount` / `add-delivery`; terminal dialogs; Cashier Printables hub; EN+es-MX policy + sell + driver HTML; tests green for discount/delivery.
- **Result:** Session 1 deliverables in working tree (not yet released).

### Session 2
- **Goal:** Delivery dates + Dash Deliveries board (available slots + job list).
- **Finish line:** Cashiers pick a date when adding delivery; managers set available dates (who/times/crew) and see booked deliveries/items.
- **Scope:** `DeliveryAvailability` / `DeliveryJob` (`pos.0011`); terminal date select; `/pos/deliveries`; cancel job on void/line remove.
- **est** 2h
- **Started:** 2026-07-13T16:20:00-05:00
- **Session updates:**
  - Models + APIs for availabilities/jobs; `add-delivery` requires `availability_id`; Deliveries page + Cashier nav; cart-line multi-select for items (default **none** selected); Google Maps multi-stop URL for a route day; tests green.
- **Result:** Scheduling path shipped in **v2.50.0** (local bump). Optional next: Directions API waypoint optimize.

## See also

- [`.ai/extended/pos-system.md`](../../../extended/pos-system.md)
- [`.ai/reference/pos_terminal_cart_scroll/`](../../../reference/pos_terminal_cart_scroll/)
- [`.ai/initiatives/_index.md`](../../_index.md)
