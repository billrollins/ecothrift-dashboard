<!-- initiative: slug=pos-labor-day-summer-sale status=active updated=2026-09-05 -->
<!-- Last updated: 2026-09-05 — Phase 1 implemented -->

# Initiative: POS Labor Day and Summer Sale

**Status:** **Active** — Phase 1 shipped **v2.88.0** (2026-09-05).

**Objective:** Cashiers on POS Terminal can ring Labor Day (10% off merchandise by default) and Summer (50% off selected lines). Assembly is $35. Assembly and Delivery never get sale discounts. Labor Day is date-driven with a manual on/off for edge cases.

**Compass:** this file is the compass.

---

## Finish line

A cashier on **POS Terminal** sees Labor Day identity when the sale is on, scanned merchandise is 10% off unless marked Summer (50%) or it is Assembly/Delivery (full price), can add Assembly at $35, and can toggle Labor Day off.

---

## Out of scope

- Do not tag items as “summer” in inventory/backend (floor-marked; cashier selects on the cart).
- Do not change delivery fee amounts.
- Existing Discount (store credit / Google Review) stays as-is and stacks on sale `line_total`.
- Public site / shelf tags / Quick Reprice.

---

## Sale rules

| Line | Labor Day ON | Labor Day OFF |
|------|--------------|---------------|
| Merchandise | 10% off | list price |
| Summer (cashier-marked) | 50% off | 50% off (stays) |
| Assembly | $35, no sale | $35, no sale |
| Delivery | existing $50 / $75, no sale | unchanged |

**Labor Day window (default ON):** first Monday of September through +5 days (Saturday). **2026:** Mon 2026-09-07 through Sat 2026-09-12. Toggle writes `override` only; calendar default survives.

---

## POS needs

1. Assembly button ($35).
2. Assembly and Delivery excluded from 10% and 50%.
3. Summer button — mark a checkout line as summer (not a backend flag).
4. Rest of merchandise 10% off by default while Labor Day is on; terminal shows Labor Day sale identity.
5. Labor Day toggle on/off for edge cases; default is date-driven.

---

## Phases

### Phase 1 — Sale terminal
Terminal can run the sale rules above.
**Gated by:** none.

Acceptance:
- [x] Labor Day ON 2026-09-07 through 2026-09-12 unless toggled off
- [x] Merchandise 10%; Summer-marked 50%; Assembly and Delivery never discounted
- [x] Assembly button adds a $35 line
- [x] Terminal shows Labor Day sale identity; toggle overrides calendar
- [x] Summer stays 50% when Labor Day is off
- [x] Existing Discount stacks on sale prices

### Phase 2+ — TBD
**Gated by:** Phase 1.
Detail when Phase 1 is built.

---

## Acceptance

- [x] Phase 1 acceptance above
- [x] Out-of-scope items stay out

---

## Record

**2026-09-05 — Opened.** Skeleton from owner sale rules.
**2026-09-05 — Phase 1 coded.** Per-line `sale_label`/`sale_percent`, assembly kind, `pos.labor_day_sale` + `/api/pos/sale-mode/`, terminal chip/toggle/Assembly/Summer. Shipped **v2.88.0** same day.

---

## See also

- Index: [`_index.md`](./_index.md)
- Prior POS discount/delivery: [`_archived/_completed/pos_discount_and_delivery.md`](./_archived/_completed/pos_discount_and_delivery.md)
- Domain: [`.ai/extended/pos-system.md`](../extended/pos-system.md)
