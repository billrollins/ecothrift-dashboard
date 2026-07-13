<!-- Last updated: 2026-07-13 -->
# POS terminal — testing SKUs

Seeded by `python manage.py seed_pos_terminal_test_items`.  
Use these at **`/pos/terminal`** after opening a drawer. Prefer **Void** so SKUs stay on shelf.

---

## Quick paste list (on-shelf)

```
POSTEST01
POSTEST02
POSTEST03
POSTEST04
POSTEST05
POSTEST06
POSTEST07
POSTEST08
POSTEST09
POSTEST10
POSTEST11
POSTEST12
POSTEST13
POSTEST14
POSTEST15
POSTEST16
POSTEST17
POSTEST18
POSTEST19
POSTEST20
POSTEST21
POSTEST22
POSTEST23
POSTEST24
POSTEST25
```

**Sold (resale / already-sold modal):** `POSTESTSOLD`

---

## Catalog

| SKU | Price | Title (cart description) | Status |
|-----|------:|--------------------------|--------|
| POSTEST01 | 0.50 | POS QA 01 Floor Lamp | on_shelf |
| POSTEST02 | 0.75 | POS QA 02 Fire Pit | on_shelf |
| POSTEST03 | 1.00 | POS QA 03 Air Fryer | on_shelf |
| POSTEST04 | 1.25 | POS QA 04 Coffeemaker | on_shelf |
| POSTEST05 | 1.50 | POS QA 05 Pitcher Set | on_shelf |
| POSTEST06 | 1.75 | POS QA 06 Table Pack | on_shelf |
| POSTEST07 | 2.00 | POS QA 07 Throw Pillow | on_shelf |
| POSTEST08 | 2.25 | POS QA 08 Desk Fan | on_shelf |
| POSTEST09 | 2.50 | POS QA 09 Board Game | on_shelf |
| POSTEST10 | 2.75 | POS QA 10 Picture Frame | on_shelf |
| POSTEST11 | 3.00 | POS QA 11 Kitchen Scale | on_shelf |
| POSTEST12 | 3.25 | POS QA 12 Storage Bin | on_shelf |
| POSTEST13 | 3.50 | POS QA 13 Bluetooth Speaker | on_shelf |
| POSTEST14 | 3.75 | POS QA 14 Yoga Mat | on_shelf |
| POSTEST15 | 4.00 | POS QA 15 Mug Set | on_shelf |
| POSTEST16 | 4.25 | POS QA 16 LED Bulb 4pk | on_shelf |
| POSTEST17 | 4.50 | POS QA 17 Throw Blanket | on_shelf |
| POSTEST18 | 4.75 | POS QA 18 Wall Clock | on_shelf |
| POSTEST19 | 5.00 | POS QA 19 Plant Pot | on_shelf |
| POSTEST20 | 5.25 | POS QA 20 Cutting Board | on_shelf |
| POSTEST21 | 5.50 | POS QA 21 Power Strip | on_shelf |
| POSTEST22 | 5.75 | POS QA 22 Laundry Basket | on_shelf |
| POSTEST23 | 6.00 | POS QA 23 Vacuum Filter | on_shelf |
| POSTEST24 | 6.25 | POS QA 24 Candle Holder | on_shelf |
| POSTEST25 | 6.50 | POS QA 25 Tool Kit | on_shelf |
| POSTESTSOLD | 1.00 | POS QA Sold Sample (resale path) | sold |

---

## Scenarios (cart scroll / space)

### A — Fill past the fold (newest must stay visible)

1. Open terminal with drawer open; start/scan into a cart.
2. Scan **POSTEST01** through **POSTEST15** (or more).
3. **Expect:** each new line is visible without manually scrolling the page; newest line is in view after every add. Cart totals stay visible under the scrolling list.

### B — Qty bump mid-list (not only “scroll to bottom”)

1. Scan **POSTEST01** … **POSTEST08**.
2. Scan **POSTEST03** again (same SKU → quantity increments on an existing mid-list line).
3. **Expect:** the **POSTEST03** line stays/comes into view (not only the bottom of the list).

### C — Viewport / space use

1. With ~12+ lines in the cart, check whether the cart panel uses leftover screen height (list scrolls inside the cart) vs growing the whole page.
2. Totals should remain readable (pinned under the line list when the list scrolls).

### D — Unscannable + void

1. Add a few POSTEST lines, then **Unscannable item** (pink-tag line).
2. Confirm newest manual line is visible.
3. **Void** the cart (do not Complete) so POSTEST SKUs remain on shelf.

### E — Sold path (optional)

1. Scan **POSTESTSOLD** → already-sold modal.
2. If you use resale-copy and complete a sale, run:

```bat
venv\Scripts\python.exe manage.py seed_pos_terminal_test_items --reset
```

---

## Reset after Complete sale

```bat
venv\Scripts\python.exe manage.py seed_pos_terminal_test_items --reset
```

---

## Fallback: live on-shelf ITMs (no seed)

If seed was not run, any local `on_shelf` `ITM#######` works. Example from a typical local DB (status may change — verify first):

```
ITM0146862
ITM0146901
ITM0146902
ITM0146948
```

Do **not** Complete sale on real inventory unless you intend to.
