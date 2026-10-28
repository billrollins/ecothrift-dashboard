<!-- Last updated: 2026-10-28 (supplies.load_lists request: the PR Supply List sheet) -->
# Supplies

The store's supply lists, the weekly count, and the week's order. Owner design, approved 2026-10-26. App:
`apps.supplies`, API `/api/supplies/`, pages `/supplies` (sidebar Essentials, every staff login).

## Who does what

| Who | Can |
|-----|-----|
| Every staff login | See every list, count any list, tick deliveries in (Receive), ask "We need ___" and see the answer |
| Manager, Admin, owner | Make, rename and archive lists; add, edit, remove items; import a CSV; AI fill from a link; approve or decline requests |
| Owner (superuser) | See the order and spend, tick Ordered, Build now |

## Models

| Model | Role |
|-------|------|
| `SupplyList` | A department's list (`department`, optional) or a named list. `is_active` false = archived. |
| `SupplyItem` | `name`, `description`, `vendor`, `vendor_url`, `url` (the item's page), `vendor_item_id` (Amazon ASIN), `unit` (what staff count), `pack_size` (units in one pack bought), `min_qty`, `max_qty` (in units), `price` (one pack). Remove = `is_active` false; past counts and orders keep it. |
| `SupplyCount` + `SupplyCountLine` | One list's count for one cycle (`week_start`), every active item's `on_hand`. Counting again before the deadline replaces it. |
| `SupplyOrder` + `SupplyOrderLine` | The cycle's order, built once. Lines copy the item's facts, the count, `packs`, `reason`, `link_status`, `ordered_at` / `ordered_by`, and `received_qty` (packs in so far) / `received_at` / `received_by`. `missed_lists` names lists not counted. |
| `SupplyReceipt` | One change to a line's packs in: `change` (negative = a correction), `received_qty` after it, `by`, `at`. |
| `SupplyRequest` | A "We need ___": `name`, optional `url`, `photo` (2048 px JPEG), `note`, `supply_list` (optional), `requested_by`; `status` pending / approved / declined, `decided_by` / `decided_at`, `decline_reason`, and the `item` an approval made. |

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

## Received (`/supplies/receive`, everyone)

Lines the owner ticked Ordered in the last 8 weeks that are not all in, vendor by vendor, with no prices. **All here** takes the rest; the box takes the packs in so far (0 to the packs ordered), so a part delivery and a correction both work. Every change is a `SupplyReceipt`. The order page shows each ordered line as "All in" or "2 of 3 in" (who and when on hover). `services/receiving.py`.

## Spend

Spend is packs times price of each line ticked Ordered, on the store day it was ticked (`services/spend.py`). The order page's **Spend** table shows it per vendor or per list, by week (8 weeks) or month (6 months), with a total row; lines with no price are counted, not added. The Owner page shows the small number: this week and this month.

## Requests: "We need ___"

Anyone taps **We need…** on Supplies: what, which list (or Not sure), an optional link, note and photo (the phone camera opens). It lands on **Requests** (`/supplies/requests`) for managers and the owner, waiting first; the Supplies button shows the waiting count and the Owner page Needs you shows **Supply requests to answer**. **Approve** puts it on a list as an item (min and max needed; vendor, link, pack, unit and price optional, the link's ASIN is kept). **Decline** needs a reason. The requester sees the answer under **My requests** on Supplies (their last 10). `services/requests.py`.

## Making lists

- From a data file, approved in production: the Requests kind `supplies.load_lists` (`approval_kinds.py`) reads `apps/supplies/data/<file>.json` (lists, each with a department name and items; same checks as a CSV row). Staged with `stage_request supplies.load_lists --params '{"file": "pr_supply_list_2026-10-28.json"}'`. A list is matched by name, an item by name (update) or added. `last_count` numbers become the count for the week whose deadline last passed: grey on the next count, and they order nothing. Undo deletes the lists it made. The first file is the owner's PR Supply List sheet (Retail 16, Processing 21, Restoration 4, all Amazon, no prices yet).

- By hand: Add item.
- CSV: Import CSV on the list (template: `GET /api/supplies/import-template/`; columns `name, description, vendor, vendor_url, url, vendor_item_id, pack_size, unit, min, max, price`). All or nothing: any bad row saves nothing and the rows are named. A name already on the list updates that item. An Amazon link fills the ASIN.
- From a link: paste it in Add item and **Fill with AI** (purpose `SUPPLY_FILL` in Settings → AI). The server never opens the page (Amazon's terms forbid scraping): the AI reads the link (its words, the ASIN) and, for the price, page text the person copies from their own browser. The person checks every field and saves.

