# R-005 result · Processing velocity and backlog

**Status:** done. Read-only, dev DB, as of 2026-09-23 12:59 America/Chicago. Queries: `workspace/runner/R-005/query.py` and `followup.py`.

## 1. Timestamps

There is no `shelved_at`. Check-in is the shelf step in the current processor: it sets `status='on_shelf'`, `checked_in_at`, `listed_at`, and an `ItemHistory` row with `new_value='on_shelf'` in the same action (`apps/inventory/processing_ops.py:567-586` and `:1820-1837`).

**Purchase order** (`apps/inventory/models.py`)

| Field | Lines | Filled (of 349 POs) |
|---|---|---|
| `ordered_date` | 89 | 349 |
| `paid_date` | 90 | 243 |
| `shipped_date` | 91 | 20 |
| `expected_delivery` | 92 | not counted |
| `delivered_date` | 93 | 341 |
| `status` | 88 | 349 |
| `receiving_status` | 178 | 349 (mostly `not_started`) |
| `receiving_started_at` | 183 | 29 |
| `receiving_done_at` | 184 | 18 |
| `processing_status` | 185 | 349 (7 are `done`) |
| `processing_started_at` | 190 | 7 |
| `processing_done_at` | 191 | 7 |
| `standardized_at` | 214 | 34 |
| `ai_cleaned_at` | 215 | 34 |
| `review_saved_at` | 216 | not counted |
| `finalized_at` | 217 | 34 |
| `closed_at` | 218 | 0 |
| `created_at` / `updated_at` | 239-240 | set by Django |

Receiving session, one per PO (`apps/inventory/models.py:2288`): `received_date` 2302, `start_time` 2303, `end_time` 2304, `completed_at` 2313, `created_at` 2322.

Processing run timestamps: `ProcessingBatch.started_at` / `completed_at` (`:2083-2084`); `ProcessingDataBuild.started_at` / `completed_at` (`:2049-2051`).

**Item** (`apps/inventory/models.py:1776`)

| Field | Lines | What it records |
|---|---|---|
| `created_at` | 1889 | Row created |
| `checked_in_at` / `checked_in_by` | 1846-1853 | Check-in |
| `listed_at` | 1845 | Set with check-in in the processor |
| `label_printed_at` | 1854 | Shelf label printed |
| `sold_at` | 1859 | Sold |
| `status` | 1841 | `intake`, `processing`, `on_shelf`, `sold`, `returned`, `scrapped`, `lost` |
| `ItemCheckIn.created_at` | 864 | The check-in batch |
| `ItemHistory.created_at` | 2125 | `status_change` to `on_shelf` (`:2101`, `:2117`) |

`checked_in_at` is filled on 26,454 of 31,128 `on_shelf` items, 17,771 of 122,617 `sold`, 1 of 83,506 `scrapped`, 3 of 290 `intake`, and 0 of 148 `lost`. No items currently have status `processing` or `returned`.

## 2. Weekly velocity

**Processed** = `Item.checked_in_at` in that week (America/Chicago, Monday week start). That is the check-in which puts the item on the shelf.

Last 26 weeks with any check-ins: week of **2026-03-30** through week of **2026-09-21**. The window filter was `checked_in_at >= 2026-03-25 12:59 CT`. Nothing was checked in 2026-03-25 through 2026-03-29. The week of 2026-09-21 is partial (through 2026-09-23).

**44,229** items checked in. `ItemHistory` rows with `event_type='status_change'` and `new_value='on_shelf'` in the same window: **43,790**.

Top 8 categories are `Product.category.name` among those check-ins. Through the week of 2026-06-08, almost every check-in is **Mixed lots & uncategorized**. Named categories show up in volume the week of 2026-06-15.

| Week of | Checked in | Mixed lots & uncategorized | Apparel & accessories | Kitchen & dining | Health, beauty & personal care | Party, seasonal & novelty | Household & cleaning | Office & school supplies | Tools & hardware |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-03-30 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-04-06 | 253 | 253 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-04-13 | 189 | 189 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-04-20 | 337 | 337 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-04-27 | 287 | 210 | 1 | 40 | 7 | 0 | 3 | 1 | 1 |
| 2026-05-04 | 795 | 795 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-05-11 | 537 | 537 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-05-18 | 1,620 | 1,620 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-05-25 | 1,454 | 1,454 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-06-01 | 793 | 793 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-06-08 | 272 | 272 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2026-06-15 | 6,348 | 902 | 529 | 249 | 1,375 | 54 | 1,060 | 245 | 605 |
| 2026-06-22 | 4,031 | 1,077 | 672 | 37 | 606 | 17 | 247 | 102 | 517 |
| 2026-06-29 | 1,152 | 150 | 32 | 231 | 8 | 50 | 59 | 267 | 28 |
| 2026-07-06 | 490 | 59 | 0 | 1 | 0 | 0 | 51 | 0 | 10 |
| 2026-07-13 | 870 | 167 | 21 | 29 | 19 | 0 | 25 | 34 | 43 |
| 2026-07-20 | 2,006 | 56 | 183 | 70 | 52 | 28 | 108 | 369 | 68 |
| 2026-07-27 | 1,892 | 120 | 477 | 55 | 36 | 235 | 69 | 43 | 77 |
| 2026-08-03 | 1,588 | 117 | 351 | 100 | 53 | 90 | 61 | 273 | 65 |
| 2026-08-10 | 4,960 | 68 | 2,036 | 422 | 286 | 291 | 134 | 472 | 319 |
| 2026-08-17 | 2,299 | 19 | 580 | 153 | 152 | 450 | 76 | 41 | 20 |
| 2026-08-24 | 3,726 | 25 | 1,036 | 282 | 249 | 360 | 461 | 5 | 10 |
| 2026-08-31 | 449 | 105 | 1 | 27 | 2 | 22 | 14 | 0 | 2 |
| 2026-09-07 | 1,945 | 162 | 292 | 331 | 588 | 29 | 78 | 96 | 1 |
| 2026-09-14 | 5,209 | 31 | 849 | 1,711 | 196 | 999 | 180 | 423 | 40 |
| 2026-09-21 | 726 | 5 | 7 | 113 | 18 | 204 | 48 | 16 | 0 |
| **Total** | **44,229** | **9,524** | **7,067** | **3,851** | **3,647** | **2,829** | **2,674** | **2,387** | **1,806** |

Category columns are the top 8 only. They do not add up to the weekly total.

## 3. Backlog now

`delivered_date` is set on 341 of 349 POs, including `ordered` and `paid`, so it was not used as the arrival test. `processing_status='done'` is set on **7** POs. `status='complete'` (189 POs) still has `processing_status='not_started'`.

**Open by status fields:** `status` in (`delivered`, `processing`) or `receiving_status` in (`active`, `done`), and `status` not in (`complete`, `cancelled`), and `processing_status != 'done'`.

| | |
|---|---:|
| POs | 148 |
| Items on those POs | 108,844 |
| Inventory manifest rows | 63,645 |
| Oldest `delivered_date` | 2025-05-05 |

Those 148 POs:

| status | processing_status | receiving_status | POs |
|---|---|---|---:|
| delivered | not_started | not_started | 65 |
| processing | not_started | not_started | 60 |
| delivered | not_started | done | 14 |
| delivered | not_started | active | 5 |
| paid | not_started | active | 2 |
| processing | not_started | active | 2 |

Item status on those same 148 POs: sold 53,439, scrapped 31,576, on_shelf 23,826, intake 3.

**Items whose status is not `on_shelf`.** Age is days from `created_at` to 2026-09-23 12:59 CT (median).

| status | count | median age (days) |
|---|---:|---:|
| sold | 122,617 | 164.5 |
| scrapped | 83,506 | 164.5 |
| intake | 290 | 140.1 |
| lost | 148 | 128.1 |

Intake is the status still before the shelf. 254 of the 290 sit on POs with `processing_status='done'`. 3 sit on `delivered` POs with `processing_status='not_started'`. 33 have no PO. `created_at` on intake runs from 2026-05-02 to 2026-06-22. Distinct `purchase_order_id` groups, including the blank: 6.

## 4. Per truck

Fully processed = `processing_status='done'` and `processing_done_at >= 2026-03-24`. That is all 7 POs that have ever reached `processing_status='done'`. All 7 have `delivered_date` and manifest rows.

| | |
|---|---:|
| POs | 7 |
| Median days, `delivered_date` to local date of `processing_done_at` | 1 |
| Range of those days | -4 to 19 |
| Negative day-counts | 2 |
| Median manifest rows (live `ManifestRow` count, and the `manifest_row_count` field) | 525 |

`status='complete'` has no `processing_done_at` (0 of 189). Days from delivered to processing done for those POs: **UNKNOWN**.

## 5. Staff time

**No.** Nothing stores hours against a PO, a manifest row, or items processed.

- `hr.TimeEntry` (`apps/hr/models.py:69-87`) is employee, clock in/out, `total_hours`, and a `shift` string. 221 rows. `shift='processing'` on 24 of them. No FK to inventory.
- `Item.checked_in_by` is set on the 44,229 checked-in items. That is a person, not hours.
- No routine has "process" in `title`, `intro`, or `system_key`. `section_tally` / `work_cycle` store shelf category counts (`apps/routines/definition.py:12-26`), not truck processing.
