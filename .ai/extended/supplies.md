<!-- Last updated: 2026-10-26 (first release: lists, weekly count, order by rule, owner order page) -->
# Supplies

The store's supply lists, the weekly count, and the week's order. Owner design, approved 2026-10-26. App:
`apps.supplies`, API `/api/supplies/`, pages `/supplies` (sidebar Essentials, every staff login).

## Who does what

| Who | Can |
|-----|-----|
| Every staff login | See every list, count any list |
| Manager, Admin, owner | Make, rename and archive lists; add, edit, remove items; import a CSV; AI fill from a link |
| Owner (superuser) | See the order, tick Ordered, Build now |

## Models

| Model | Role |
|-------|------|
| `SupplyList` | A department's list (`department`, optional) or a named list. `is_active` false = archived. |
| `SupplyItem` | `name`, `description`, `vendor`, `vendor_url`, `url` (the item's page), `vendor_item_id` (Amazon ASIN), `unit` (what staff count), `pack_size` (units in one pack bought), `min_qty`, `max_qty` (in units), `price` (one pack). Remove = `is_active` false; past counts and orders keep it. |
| `SupplyCount` + `SupplyCountLine` | One list's count for one cycle (`week_start`), every active item's `on_hand`. Counting again before the deadline replaces it. |
| `SupplyOrder` + `SupplyOrderLine` | The cycle's order, built once. Lines copy the item's facts, the count, `packs`, `reason`, `link_status`, and `ordered_at` / `ordered_by`. `missed_lists` names lists not counted. |

## The count

- Due **Monday 15:00 store time** by default: Settings → Store → Supplies (`supplies.count_weekday`, 0 = Monday; `supplies.count_due_time`, `HH:MM`).
- A cycle is named by the Monday of its deadline's week (`services/schedule.py`). A count made now belongs to the next deadline at or after now.
- Every item needs a typed number (0 if none). Last cycle's count shows greyed beside the box, for reference only; it is never filled in.
- Not Routines: the store is closed Monday, and Routines makes no runs on closed days. The count is its own page, linked from Supplies and from the Me page (a "Supply count" block while a list still needs counting).

## The order rule (no AI)

`services/rules.py`: on hand at or under min → order up to max, rounded up to whole packs; else 0. Each line says why, e.g. "On hand 3 is at or under min 4: up to max 12 needs 9 roll, so order 2 packs of 6 (12 in all)."

## The overnight build

- `services/orders.run_due` runs first in the hourly `scheduled_sweep` (inside a try; `--skip-supplies` skips it). No new Scheduler job. After a deadline passes it builds that cycle's order once; it never builds an older week, and does nothing while no list existed before the deadline.
- Lists with items and no count are named on the order and on the Owner page; they add no lines.
- Link check (`supplies.check_links`, on): each non-Amazon link is opened once (HEAD, 5 s); 404 / 410 flags the line "Link gone". Amazon links are never opened. No price check: that needs scraping.
- Owner page Needs you: **Supply counts missed** (lists not counted by the last deadline) and **Supply order ready** (lines not yet ticked).

## The order page (`/supplies/order`, owner)

Vendor by vendor, each line with its link (new tab), packs, price, line total; the vendor total. Amazon: **Add all to Amazon cart** opens `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=…&Quantity.1=…` with every ASIN and pack count; Bill checks out himself. Lines with no ASIN are named, not in the button. Tick Ordered per line or **All ordered** per vendor (who and when kept). **Build now** builds the order for the deadline that passed, if the hourly job has not.

## Making lists

- By hand: Add item.
- CSV: Import CSV on the list (template: `GET /api/supplies/import-template/`; columns `name, description, vendor, vendor_url, url, vendor_item_id, pack_size, unit, min, max, price`). All or nothing: any bad row saves nothing and the rows are named. A name already on the list updates that item. An Amazon link fills the ASIN.
- From a link: paste it in Add item and **Fill with AI** (purpose `SUPPLY_FILL` in Settings → AI). The server never opens the page (Amazon's terms forbid scraping): the AI reads the link (its words, the ASIN) and, for the price, page text the person copies from their own browser. The person checks every field and saves.

## Later (not built)

Received ticks and spend tracking; staff "We need ___" requests.
