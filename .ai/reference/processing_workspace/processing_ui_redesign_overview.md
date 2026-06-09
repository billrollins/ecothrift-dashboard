<!-- Last updated: 2026-06-08 (processing UI redesign demo overview) -->

# Processing UI Redesign Overview

## Owner Goals

Processing should feel like a high-confidence warehouse command surface, not a dense admin table. The order-level facts that drive decisions must stay visible while processors move between queue search, staged row details, and item check-in.

## Vocabulary

| Term | Meaning |
|------|---------|
| **Order** | Purchase order being processed. Carries vendor, delivery date, paid/cost context, total retail, and dispute deadline. |
| **Manifest Row** | Permanent evidence of what was known at auction/bid and manifest standardization time. Not the primary editing mental model during processing. |
| **Processing Row** | The staged row processors use to create Product and Item records at check-in. Edits here affect future check-ins from that row. |
| **Checked-in Item** | A real physical Item created during check-in. It owns final SKU, price, status, dispatch/location, condition, and dispute information. |

## Persistent Header Model

Every variant keeps order context and BAN cards visible:

- Order selector and current order number.
- Vendor and order description/load type.
- Delivery date and dispute deadline.
- `% done` and `% left`.
- Items left and retail left.
- Dispute status and likelihood the order must be disputed.
- Pricing totals and projection status against the 2x target.

The queue/search/table is part of queue mode only. When a processing row is selected, the row detail should use the full workspace beneath the persistent header.

## Current DTO Coverage

Available today from `ProcessingWorkspaceDTO`:

- Order number, vendor, vendor code, load type, expected delivery, ordered date, paid date, delivered date, status, total manifest qty, total retail.
- Expected, dispositioned, remaining, overage, on-shelf, sold, lost, scrapped, pending, unmanifested quantities.
- Expected retail, on-shelf value, sold value.
- Processing rows with row quantities, unit retail, shelf/default price, category, status, and checked-in item details where loaded.
- Item dispute type, dispute percent loss, and description in row detail payloads.

## Data Gaps

The demos should show these as explicit `Needs data` states rather than inventing numbers:

- Pallet counts left.
- Order purchase cost / paid amount needed for exact 2x target math.
- Total staged shelf price for every remaining row.
- Checked-in priced retail percent across the whole order.
- Shrink-adjusted projection at 5% and 10%.
- Order-level disputed retail and disputed percent rollup.
- Business-day dispute deadline status from backend.

## Metric Rules

| Metric | Demo behavior |
|--------|---------------|
| `% done` | `dispositioned_qty / expected_qty` from rollups, falling back to manifest disposition count if needed. |
| Items left | `remaining_qty` from rollups. |
| Retail left | `expected_retail - on_shelf_value - sold_value` when values exist; otherwise show `Needs retail rollup`. |
| Last day to dispute | Delivery date + 4 business days, shown as the operational deadline for a 5-business-day window. |
| Dispute trigger | Flag at disputed retail >= 5% of total order retail once disputed retail is available. |
| Total priced | Checked-in/on-shelf value plus sold value when available. |
| Extrapolated price | Based on checked-in priced value divided by checked-in retail, then projected to total retail; show as `Needs checked-in retail` until exposed. |
| No-change price | Based on all current staged row prices; show as `Needs staged price rollup` until exposed. |
| 2x target | Compare projected price to 2x purchase cost; show as `Needs cost` until exposed. |

## Demo Strategy

The design lab should reuse live workspace data, but it must remain isolated from production processing. The first pass can use read-only row detail mockups and existing row table data. Production check-in mutations should not be moved into the demos until a design is selected.
