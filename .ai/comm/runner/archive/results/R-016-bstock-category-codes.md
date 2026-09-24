# R-016 result · Every B-Stock category code we have seen, and where it lands

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 15:58 · **Finished:** 2026-09-23 16:05

Read-only, local database after the 2026-09-23 production pull. Scratch CSVs: `workspace/runner/R-016/`.

How a code "lands" here:

- **`canonical_category_name()`** (`apps/inventory/canonical_categories.py:88`). A taxonomy name stays itself. Anything else is looked up by slug. Unknown slugs become Mixed lots. `appliances` is forced to Kitchen (`:34`). `automotive` is forced to Mixed (`:69`).
- **CategoryMapping majority.** The app's own rule (`apps/buying/services/category_stats_sql.py:172`) looks for `source_key` containing `-api-{slug}`, and accepts a winner only with at least 2 keys and 60%. **None of the 2,279 mapping keys contain `-api-`**, so that rule matches nothing and the caller leaves the code out (Mixed). The votes below use the same 2-and-60% bar, but on the keys we actually have: vendor prefix, then a tail that equals the code slug or starts with it (`tgt-toys`, `tgt-toys-action-figures`). A second target is listed when it has at least 20% of those keys.
- **`final_category`.** One value per PO line: the max non-blank `PreprocessingRow.final_category` for that `inventory.ManifestRow`. The percent is that value's share of the code's units.

Last 12 months means `PurchaseOrder.ordered_date >= 2025-09-23`. Every non-blank PO category code has all of its rows inside that window, so the units and retail below are the last 12 months. Retail is `quantity * unit_retail` (PO lines) or the stored `retail_value` sum (buying rows).

## 1. Every code

### PO lines (`inventory.ManifestRow.category`)

159,561 lines. 143,969 are blank (268,114 units, $9,067,425 all-time; 27,484 of those rows, 45,416 units, $1,461,380 fall in the last 12 months). The other 15,592 lines use 93 codes. 18 of those codes are already one of the 19 taxonomy names (they have no preprocessing `final_category`). `Books & media` is the taxonomy name that never appears as a stored PO category. The help text on the field says it holds a taxonomy name (`apps/inventory/models.py:459`); on these rows it mostly still holds the B-Stock code, which matches register PO-03.

| Code | Units | Retail $ | canonical_category_name | CategoryMapping | final_category |
|---|---:|---:|---|---|---|
| MIXED_LOTS | 13667 | 203,373 | Mixed lots & uncategorized | Health, beauty & personal care 72/165 (44%) no | Apparel & accessories 35% |
| OUTDOOR_LIVING_AND_GARDEN | 9433 | 39,562 | Mixed lots & uncategorized | Outdoor & patio furniture 8/20 (40%) no; 2nd Sports & outdoors 6 | Home décor & lighting 70% |
| MIXED_HOME_AND_GARDEN | 2511 | 62,387 | Mixed lots & uncategorized | Outdoor & patio furniture 3/5 (60%) agree; 2nd Home décor & lighting 2 | Home décor & lighting 34% |
| OFFICE_SUPPLIES | 1790 | 28,436 | Mixed lots & uncategorized | Office & school supplies 7/9 (78%) agree | Office & school supplies 91% |
| Sports & outdoors | 1659 | 62,232 | Sports & outdoors | none | (none) 100% |
| Kitchen & dining | 1425 | 32,117 | Kitchen & dining | none | (none) 100% |
| MIXED_HEALTH_AND_BEAUTY | 1410 | 26,129 | Mixed lots & uncategorized | Health, beauty & personal care 180/188 (96%) agree | Health, beauty & personal care 98% |
| KITCHEN_AND_DINING | 1391 | 34,926 | Mixed lots & uncategorized | Kitchen & dining 134/142 (94%) agree | Kitchen & dining 73% |
| HOUSEHOLD_ESSENTIALS | 1306 | 8,185 | Mixed lots & uncategorized | Household & cleaning 86/200 (43%) no | Household & cleaning 60% |
| PERSONAL_CARE | 1197 | 16,913 | Mixed lots & uncategorized | Health, beauty & personal care 27/28 (96%) agree | Health, beauty & personal care 98% |
| Toys & games | 1126 | 16,743 | Toys & games | none | (none) 100% |
| TOYS | 901 | 23,910 | Mixed lots & uncategorized | Toys & games 142/155 (92%) agree | Toys & games 54% |
| BEDDING | 822 | 49,635 | Mixed lots & uncategorized | Bedding & bath 18/20 (90%) agree | Bedding & bath 99% |
| HAIR_CARE | 726 | 16,333 | Mixed lots & uncategorized | Health, beauty & personal care 33/34 (97%) agree | Health, beauty & personal care 97% |
| Home décor & lighting | 718 | 75,810 | Home décor & lighting | none | (none) 100% |
| PET_SUPPLIES | 638 | 12,158 | Mixed lots & uncategorized | Pet supplies 6/6 (100%) agree | Pet supplies 99% |
| GAMING | 521 | 14,459 | Mixed lots & uncategorized | Electronics 1/2 (50%) no; 2nd Toys & games 1 | Books & media 39% |
| HOME_DECOR | 480 | 23,818 | Mixed lots & uncategorized | Home décor & lighting 54/71 (76%) agree | Home décor & lighting 78% |
| OUTDOOR_FURNITURE | 451 | 32,855 | Mixed lots & uncategorized | Outdoor & patio furniture 27/40 (68%) agree | Outdoor & patio furniture 95% |
| MIXED_APPAREL | 429 | 5,275 | Mixed lots & uncategorized | Apparel & accessories 4/5 (80%) agree; 2nd Electronics 1 | Apparel & accessories 92% |
| Bedding & bath | 373 | 15,232 | Bedding & bath | none | (none) 100% |
| Tools & hardware | 328 | 40,745 | Tools & hardware | none | (none) 100% |
| ARTS_AND_CRAFTS | 268 | 12,883 | Mixed lots & uncategorized | Office & school supplies 7/19 (37%) no | Office & school supplies 68% |
| MIXED_ELECTRONICS | 234 | 7,111 | Mixed lots & uncategorized | Electronics 3/4 (75%) agree; 2nd Tools & hardware 1 | Electronics 92% |
| BAGS_AND_LUGGAGE | 197 | 5,397 | Mixed lots & uncategorized | Apparel & accessories 4/5 (80%) agree; 2nd Storage & organization 1 | Apparel & accessories 86% |
| BUILDING_AND_HARDWARE | 195 | 3,447 | Mixed lots & uncategorized | Tools & hardware 55/96 (57%) no; 2nd Home décor & lighting 20 | Tools & hardware 86% |
| MIXED_SPORTS_AND_OUTDOORS | 189 | 10,375 | Mixed lots & uncategorized | Sports & outdoors 1/2 (50%) no; 2nd Toys & games 1 | Sports & outdoors 86% |
| SKIN_CARE | 164 | 1,968 | Mixed lots & uncategorized | Health, beauty & personal care 3/3 (100%) agree | Health, beauty & personal care 99% |
| MIXED_FURNITURE | 161 | 6,027 | Mixed lots & uncategorized | Furniture 9/16 (56%) no | Furniture 37% |
| MIXED_OFFICE_SUPPLIES_AND_EQUIPMENT | 160 | 1,192 | Mixed lots & uncategorized | Office & school supplies 1/1 (100%) no | Office & school supplies 96% |
| AUTOMOTIVE_ACCESSORIES | 153 | 1,871 | Mixed lots & uncategorized | Tools & hardware 10/12 (83%) agree | Tools & hardware 64% |
| MIXED_SHOES | 137 | 3,526 | Mixed lots & uncategorized | Apparel & accessories 1/1 (100%) no | Apparel & accessories 98% |
| MIXED_BUILDING_AND_INDUSTRIAL | 133 | 9,317 | Mixed lots & uncategorized | Tools & hardware 26/61 (43%) no | Health, beauty & personal care 41% |
| BABY_ESSENTIALS | 123 | 1,399 | Mixed lots & uncategorized | Baby & kids 102/132 (77%) agree | Baby & kids 76% |
| HEATING_COOLING_AND_AIR_QUALITY | 113 | 14,878 | Mixed lots & uncategorized | Tools & hardware 5/9 (56%) no | Household & cleaning 44% |
| MENS_APPAREL | 100 | 744 | Mixed lots & uncategorized | Apparel & accessories 7/8 (88%) agree | Health, beauty & personal care 72% |
| MIXED_SMALL_APPLIANCES | 96 | 14,463 | Mixed lots & uncategorized | Kitchen & dining 36/42 (86%) agree | Kitchen & dining 94% |
| SPORTS_EQUIPMENT | 93 | 689 | Mixed lots & uncategorized | Sports & outdoors 5/8 (62%) agree; 2nd Toys & games 2 | Sports & outdoors 73% |
| PET_FOODS_AND_TREATS | 88 | 640 | Mixed lots & uncategorized | Pet supplies 3/3 (100%) agree | Pet supplies 100% |
| PARTY_SUPPLIES | 86 | 220 | Mixed lots & uncategorized | Party, seasonal & novelty 6/7 (86%) agree | Party, seasonal & novelty 96% |
| Furniture | 83 | 12,044 | Furniture | none | (none) 100% |
| MIXED_AUTOMOTIVE_SUPPLIES | 79 | 2,229 | Mixed lots & uncategorized | Tools & hardware 5/6 (83%) agree | Tools & hardware 72% |
| OUTDOOR_SPORTS | 64 | 1,431 | Mixed lots & uncategorized | Sports & outdoors 123/179 (69%) agree | Sports & outdoors 100% |
| STORAGE | 59 | 1,492 | Mixed lots & uncategorized | Storage & organization 99/126 (79%) agree | Storage & organization 100% |
| Household & cleaning | 59 | 3,719 | Household & cleaning | Household & cleaning 1/1 (100%) no | (none) 100% |
| EQUIPMENT_AND_TOOLS | 56 | 3,760 | Mixed lots & uncategorized | Tools & hardware 30/36 (83%) agree | Tools & hardware 54% |
| VACUUMS | 56 | 15,202 | Mixed lots & uncategorized | Household & cleaning 5/5 (100%) agree | Household & cleaning 100% |
| Baby & kids | 50 | 3,220 | Baby & kids | none | (none) 100% |
| INFANT_APPAREL | 46 | 453 | Mixed lots & uncategorized | Baby & kids 2/5 (40%) no; 2nd Apparel & accessories 2 | Apparel & accessories 59% |
| MEDICATION | 46 | 272 | Mixed lots & uncategorized | Health, beauty & personal care 1/1 (100%) no | Health, beauty & personal care 100% |
| Health, beauty & personal care | 45 | 4,116 | Health, beauty & personal care | none | (none) 100% |
| PANTRY | 44 | 334 | Mixed lots & uncategorized | Kitchen & dining 2/5 (40%) no; 2nd Household & cleaning 2 | Kitchen & dining 93% |
| Storage & organization | 40 | 1,889 | Storage & organization | Storage & organization 13/15 (87%) agree | (none) 100% |
| Apparel & accessories | 35 | 1,374 | Apparel & accessories | none | (none) 100% |
| MIXED_MAJOR_APPLIANCES | 35 | 5,525 | Mixed lots & uncategorized | Mixed lots & uncategorized 1/1 (100%) no | Kitchen & dining 43% |
| CAMERAS | 34 | 1,336 | Mixed lots & uncategorized | Electronics 1/1 (100%) no | Electronics 97% |
| Mixed lots & uncategorized | 33 | 4,695 | Mixed lots & uncategorized | none | (none) 100% |
| KIDS_FURNITURE | 28 | 1,736 | Mixed lots & uncategorized | Furniture 10/32 (31%) no; 2nd Bedding & bath 9 | Furniture 25% |
| GRILLS | 26 | 4,014 | Mixed lots & uncategorized | Health, beauty & personal care 1/2 (50%) no; 2nd Outdoor & patio furniture 1 | Outdoor & patio furniture 92% |
| MIXED_GROCERIES | 26 | 141 | Mixed lots & uncategorized | none | Kitchen & dining 50% |
| RUGS | 19 | 2,400 | Mixed lots & uncategorized | Home décor & lighting 6/8 (75%) agree; 2nd Outdoor & patio furniture 2 | Home décor & lighting 74% |
| KITCHEN_APPLIANCES | 19 | 6,654 | Mixed lots & uncategorized | Kitchen & dining 3/3 (100%) agree | Kitchen & dining 100% |
| WOMENS_APPAREL | 18 | 197 | Mixed lots & uncategorized | Apparel & accessories 11/11 (100%) agree | Apparel & accessories 94% |
| OUTDOOR_POWER_EQUIPMENT | 17 | 4,769 | Mixed lots & uncategorized | Tools & hardware 7/9 (78%) agree | Tools & hardware 82% |
| SEASONAL | 13 | 39 | Mixed lots & uncategorized | Office & school supplies 68/190 (36%) no | Party, seasonal & novelty 92% |
| MIXED_PETS | 13 | 445 | Mixed lots & uncategorized | none | Pet supplies 100% |
| Office & school supplies | 13 | 593 | Office & school supplies | none | (none) 100% |
| CELL_PHONE_ACCESSORIES | 12 | 202 | Mixed lots & uncategorized | Electronics 2/2 (100%) agree | Electronics 50% |
| CELL_PHONES | 11 | 356 | Mixed lots & uncategorized | Electronics 1/1 (100%) no | Electronics 100% |
| BOOKS | 11 | 140 | Mixed lots & uncategorized | Books & media 3/3 (100%) agree | Books & media 73% |
| MUSIC | 10 | 721 | Mixed lots & uncategorized | none | Books & media 60% |
| PLUMBING | 9 | 156 | Mixed lots & uncategorized | Tools & hardware 3/3 (100%) agree | Tools & hardware 56% |
| MOVIES | 9 | 241 | Mixed lots & uncategorized | Books & media 1/1 (100%) no | Books & media 100% |
| SMART_HOME | 6 | 337 | Mixed lots & uncategorized | Electronics 4/7 (57%) no; 2nd Tools & hardware 2 | Outdoor & patio furniture 83% |
| Party, seasonal & novelty | 6 | 816 | Party, seasonal & novelty | none | (none) 100% |
| HOME_ENTERTAINMENT | 6 | 982 | Mixed lots & uncategorized | Electronics 2/2 (100%) agree | Health, beauty & personal care 50% |
| FRAGRANCES | 6 | 48 | Mixed lots & uncategorized | Health, beauty & personal care 1/1 (100%) no | Health, beauty & personal care 100% |
| MATTRESSES | 5 | 358 | Mixed lots & uncategorized | Bedding & bath 3/3 (100%) agree | Bedding & bath 60% |
| Outdoor & patio furniture | 5 | 704 | Outdoor & patio furniture | none | (none) 100% |
| FLOORING_AND_FLOOR_CARE | 5 | 131 | Mixed lots & uncategorized | Tools & hardware 1/3 (33%) no; 2nd Furniture 1 | Household & cleaning 100% |
| BATHROOM_ACCESSORIES | 5 | 51 | Mixed lots & uncategorized | Bedding & bath 5/7 (71%) agree | Bedding & bath 80% |
| JEWELRY | 4 | 14 | Mixed lots & uncategorized | Bedding & bath 1/2 (50%) no; 2nd Apparel & accessories 1 | Apparel & accessories 100% |
| NAILS | 3 | 78 | Mixed lots & uncategorized | Health, beauty & personal care 1/2 (50%) no; 2nd Tools & hardware 1 | Home décor & lighting 100% |
| Electronics | 3 | 200 | Electronics | none | (none) 100% |
| KIDS_APPAREL | 2 | 18 | Mixed lots & uncategorized | Apparel & accessories 5/5 (100%) agree | Apparel & accessories 100% |
| AUTOMOTIVE_FILTERS | 2 | 46 | Mixed lots & uncategorized | Tools & hardware 3/3 (100%) agree | Household & cleaning 100% |
| LAUNDRY_APPLIANCES | 2 | 392 | Mixed lots & uncategorized | Household & cleaning 2/2 (100%) agree | Household & cleaning 100% |
| HOME_AUDIO | 1 | 20 | Mixed lots & uncategorized | Electronics 1/1 (100%) no | Electronics 100% |
| BATHROOM_FIXTURES | 1 | 150 | Mixed lots & uncategorized | Bedding & bath 2/5 (40%) no; 2nd Tools & hardware 2 | Tools & hardware 100% |
| ENGINE | 1 | 23 | Mixed lots & uncategorized | Tools & hardware 2/2 (100%) agree | Tools & hardware 100% |
| MAKEUP | 1 | 11 | Mixed lots & uncategorized | Health, beauty & personal care 2/2 (100%) agree | Health, beauty & personal care 100% |
| WATCHES | 1 | 8 | Mixed lots & uncategorized | none | Apparel & accessories 100% |
| Pet supplies | 1 | 13 | Pet supplies | Pet supplies 6/6 (100%) agree | (none) 100% |

`(none)` means no preprocessing row carried a `final_category`. A mapping of `1/1` cannot agree, because the bar is 2 keys.

### Buying API rows (`raw_data.categories` and `customAttributes.subCategory`)

16,725 buying manifest rows. 2,210 are API rows (those JSON keys). 14,515 are CSV rows and do not have them; their codes are in the next section. API `categories` has 3 values. Each row's `subCategory` is a lot theme, not a department. `canonical_category_name` returns Mixed for every one of these except `TABLETS` (Electronics).

| categories[0] | subCategory | Rows | Units | Retail $ |
|---|---|---:|---:|---:|
| SEASONAL | RIBBON | 663 | 46,631 | 619,905 |
| BEDDING | HOLIDAY FLANNEL | 442 | 38,454 | 15,470 |
| HOUSEHOLD_ESSENTIALS | TOYS | 221 | 9,724 | 220,779 |
| SEASONAL | DEWDROPS | 221 | 9,724 | 110,500 |
| SEASONAL | FORMAL BAGS | 221 | 10,829 | 37,570 |
| SEASONAL | CLASSIC VAL ENTER | 221 | 9,724 | 110,500 |
| HOUSEHOLD_ESSENTIALS | TABLETS | 221 | 11,271 | 3,313 |

`BEDDING` / `HOLIDAY FLANNEL` retail is the stored sum ($0.40 a unit). Not recomputed.

### CSV buying rows (the other 14,515)

These columns are what `fast_cat_key` is built from (`apps/buying/services/manifest_template.py:64`). Distinct values: Category 102, Seller Category 209, Subcategory 1,466, Product Class 79. Full lists: `workspace/runner/R-016/csv_category_fields.csv`.

Largest Category values: `OUTDOOR_SPORTS` 1,718 rows, `HOUSEHOLD_ESSENTIALS` 1,673, `BUILDING_AND_HARDWARE` 1,270, `EQUIPMENT_AND_TOOLS` 1,031, `MIXED_HEALTH_AND_BEAUTY` 960, `KITCHEN_AND_DINING` 885, `TOYS` 663.

31 Category values never appear on a PO line. The larger ones: `LIGHTING` 243 rows (14 of 17 mapping keys that contain "lighting" go to Home décor & lighting), `DOORS_AND_WINDOWS` 54, `ACTIVEWEAR` 49, `KITCHEN_AND_DINING_FURNITURE` 42, `SWIMWEAR` 40, `TOWING` 38, `EXERCISE_AND_FITNESS_EQUIPMENT` 28, `SAFETY_WEAR` 26. Automotive parts that show up here and not on PO lines: `TOWING`, `BRAKING` (4 rows), `STEERING_AND_CHASSIS` (2).

### CategoryMapping.source_key

2,279 keys. Every `rule_origin` is `ai`. Prefixes: `tgt` 1,598, `wal` 425, `amz` 144, `hdp` 112. No Costco prefix. Shape is `{prefix}-{slug-path}` (`apps/buying/models.py:69`), for example `amz-building-and-hardware-air-conditioners` → Tools & hardware.

2,268 distinct `fast_cat_key` values sit on buying rows; 2,259 of them have a mapping. Nine do not:

| fast_cat_key | Rows | Units |
|---|---:|---:|
| wal-grills-grills-outdoor-cooking | 20 | 49 |
| wal-outdoor-living-and-garden-movies | 1 | 1 |
| wal-outdoor-living-and-garden-books-magazines | 1 | 1 |
| wal-sports-equipment-medical-aids-equipment | 1 | 1 |
| wal-outdoor-living-and-garden-furniture | 1 | 1 |
| wal-outdoor-sports-electrical | 1 | 2 |
| wal-outdoor-living-and-garden-clothing | 1 | 1 |
| wal-mattresses-tools-hardware-other | 1 | 1 |
| wal-outdoor-living-and-garden-art-craft | 1 | 1 |

The full key list with canonical target and buying-row units is `workspace/runner/R-016/category_mapping.csv`.

### Auction.category

17,188 auctions. 7 blank. 3,774 distinct strings, almost all comma-joined combinations of the tokens below. `canonical_category_name` returns a real taxonomy name for four of them (Furniture, Sports & Outdoors, Electronics, Health & Beauty). The rest, including Home & Garden, return Mixed. Truncated tokens (`Jewel`, `Majo`, `Books Mo`, `Furnitur`, and the other short cuts) are clipped strings, 134 mentions together, not extra departments.

| Token | Auction mentions | canonical_category_name |
|---|---:|---|
| Home & Garden | 8,065 | Mixed lots & uncategorized |
| Apparel Shoes & Accessories | 5,000 | Mixed lots & uncategorized |
| Furniture | 4,904 | Furniture |
| Sports & Outdoors | 4,463 | Sports & outdoors |
| Mixed Lots | 4,137 | Mixed lots & uncategorized |
| Toys Kids & Baby | 3,951 | Mixed lots & uncategorized |
| Building & Industrial | 3,597 | Mixed lots & uncategorized |
| Electronics | 3,020 | Electronics |
| Health & Beauty | 2,978 | Health, beauty & personal care |
| Major Appliances | 2,656 | Mixed lots & uncategorized |
| Automotive Supplies | 2,328 | Mixed lots & uncategorized |
| Pets | 2,256 | Mixed lots & uncategorized |
| Small Appliances | 2,161 | Mixed lots & uncategorized |
| Office Supplies & Equipment | 1,988 | Mixed lots & uncategorized |
| Books Movies & Music | 1,434 | Mixed lots & uncategorized |
| Groceries | 999 | Mixed lots & uncategorized |
| Cell Phones | 731 | Mixed lots & uncategorized |
| Jewelry & Watches | 714 | Mixed lots & uncategorized |

## 2. Where each one lands

The PO-line table is the landing for each code we have bought. Three patterns:

- **Already a taxonomy name** (Sports & outdoors, Kitchen & dining, and the other 16 in that table). The function returns that name. There is no preprocessing `final_category`.
- **B-Stock code the mapping agrees on, and `final_category` agrees too.** Examples: `OFFICE_SUPPLIES` → Office, `KITCHEN_AND_DINING` → Kitchen, `PET_SUPPLIES` → Pet supplies, `BEDDING` → Bedding & bath, `HOME_DECOR` → Home décor, `OUTDOOR_FURNITURE` → Outdoor furniture, `MIXED_HEALTH_AND_BEAUTY` and `PERSONAL_CARE` and `HAIR_CARE` → Health & beauty. The function still returns Mixed for every one of these, because their slugs are not in `SLUG_TO_CANONICAL`.
- **No agreed home.** Listed in the next section.

`MIXED_LOTS` is the large one that is Mixed by name (13,667 units, $203,373). The function agrees. The mapping keys under `tgt-mixed-lots-*` do not: 72/165 go to Health & beauty. The preprocessing pass then spreads the units across 20 taxonomy names, led by Apparel (35%). The most common titles on that code are women's shirts and dresses, which matches that apparel share.

## 3. Weak fits

Units and retail are the last 12 months (the whole history of these codes).

**The function sends all 75 B-Stock codes to Mixed**, including ones the mapping and the preprocessing pass place cleanly (Kitchen, Toys, Pets, Bedding, Office). That is the slug list, not the goods.

**Codes that split, or whose agreed target is a poor description of the titles:**

| Code | Units | Retail $ | Where it is put | Why it is weak |
|---|---:|---:|---|---|
| OUTDOOR_LIVING_AND_GARDEN | 9,433 | 39,562 | Mapping: Outdoor furniture 40% vs Sports 30%. Final: Home décor 70%. | Titles are hedge shears, a pruner, a wheelbarrow, a sprinkler, a fire-pit cover. |
| MIXED_HOME_AND_GARDEN | 2,511 | 62,387 | Mapping agrees Outdoor furniture 60%, with Home décor second. Final: Home décor 34% across 19 targets. | Same garden-vs-furniture split, and the two systems disagree. |
| VACUUMS | 56 | 15,202 | Household & cleaning, 5/5 keys and 100% of units. | Titles are upright vacuums, a carpet cleaner, a shop vac. |
| HEATING_COOLING_AND_AIR_QUALITY | 113 | 14,878 | No mapping agreement (Tools 5/9). Final: Household 44%. | Titles are a portable AC, an attic fan, a dehumidifier, pedestal fans. |
| MIXED_SMALL_APPLIANCES | 96 | 14,463 | Kitchen, 36/42 keys and 94% of units. | Titles are countertop ovens, toasters, ice makers. |
| GAMING | 521 | 14,459 | No agreement (Electronics 1, Toys 1). Final: Books & media 39%, then Toys, then Electronics. | Titles are Xbox games and amiibo. |
| ARTS_AND_CRAFTS | 268 | 12,883 | No agreement (Office 7/19). Final: Office 68%, and 29 units left as the raw code. | Titles are crayons, glue sticks, a rotary cutter. |
| KITCHEN_APPLIANCES | 19 | 6,654 | Kitchen, 3/3 and 100% of units. | Titles are a range hood, a cooktop, an under-cabinet hood, a beverage fridge. |
| MIXED_MAJOR_APPLIANCES | 35 | 5,525 | The one mapping key is Mixed. Final: Kitchen 43%, Household 40%. | Titles are a chest freezer, a portable washer, a dryer seal, a robot vacuum. |
| OUTDOOR_POWER_EQUIPMENT | 17 | 4,769 | Tools, 7/9 and 82% of units. | Titles are pressure washers and fans. |
| GRILLS | 26 | 4,014 | Mapping does not agree (2 keys). Final: Outdoor furniture 92%. | Titles are charcoal grills, a griddle, a pizza oven. One buying key for grills (`wal-grills-grills-outdoor-cooking`, 49 units) has no mapping at all. |
| AUTOMOTIVE_ACCESSORIES | 153 | 1,871 | Tools, 10/12 and 64% of units. Function would send the slug `automotive` to Mixed. | Titles are grease, gear oil, fuel treatment, motor oil. |
| MIXED_AUTOMOTIVE_SUPPLIES | 79 | 2,229 | Tools, 5/6 and 72% of units. | Same family as the row above. |
| AUTOMOTIVE_FILTERS | 2 | 46 | Tools on the keys. Final: Household 100%. | Two units; the two systems disagree. |
| ENGINE | 1 | 23 | Tools, 2/2. | One unit. |
| LAUNDRY_APPLIANCES | 2 | 392 | Household, 2/2 and 100% of units. | Title is a top-load washer. |
| PANTRY | 44 | 334 | No agreement (Kitchen 2/5). Final: Kitchen 93%. | Food, filed under Kitchen & dining. |
| MIXED_GROCERIES | 26 | 141 | No mapping key. Final: Kitchen 50%, Mixed 46%. | Same. |
| SEASONAL | 13 | 39 | Mapping keys scatter (Office 36%). Final: Party, seasonal & novelty 92%. | The PO lines found a home. The 190 `*-seasonal-*` keys do not. |
| HOUSEHOLD_ESSENTIALS | 1,306 | 8,185 | Mapping 43% Household (not enough to agree). Final: Household 60%. | Titles are mops, trash bags, bleach. Household is a fair home; the keys are too spread to clear 60%. |
| MENS_APPAREL | 100 | 744 | Mapping: Apparel 7/8. Final: Health & beauty 72%. | Titles include pocket tees and a BIC pack. The code fits Apparel; the cleanup put most of the units in Health. |
| BUILDING_AND_HARDWARE | 195 | 3,447 | Tools 57%, just under 60%. Final: Tools 86%. | Close. Not a new category. |
| MIXED_BUILDING_AND_INDUSTRIAL | 133 | 9,317 | Tools 43%. Final: Health & beauty 41%. | The code and the cleanup disagree. What those units actually are was not title-checked. |
| KIDS_FURNITURE | 28 | 1,736 | Furniture 31% vs Bedding 28%. Final: Furniture 25%. | Split, small. |
| JEWELRY | 4 | 14 | Mapping split (Bedding vs Apparel). Final: Apparel 100%. | Four units. Auction text "Jewelry & Watches" is 714 mentions and the function returns Mixed. |
| SMART_HOME | 6 | 337 | Electronics 57%. Final: Outdoor furniture 83%. | Six units. The two systems disagree. Not title-checked. |
| NAILS | 3 | 78 | Mapping split (Health vs Tools). Final: Home décor 100%. | Three units. UNKNOWN which nails these are. |

Garden on the mapping keys, not only the PO code: 40 keys whose tail contains `garden`, 18/40 mapped to Outdoor & patio furniture. `lawn`: 10 keys, 4/10 Sports & outdoors. `appliance`: 65 keys, 42/65 Kitchen, 901 buying-row units, $32,993 stored retail. `automotive`: 28 keys, 22/28 Tools, 894 buying-row units, $12,540.

## 4. Suggested new top-level categories

Five. Gaming is a sixth only if a subcategory under Electronics or Toys is not enough. Jewelry stays under Apparel: 5 PO units, and the auction token is large but we have barely bought it.

| New category | Codes it would take | PO units | PO retail $ | Also |
|---|---|---:|---:|---|
| Lawn & garden | `OUTDOOR_LIVING_AND_GARDEN`, `GRILLS`, `OUTDOOR_POWER_EQUIPMENT`, and the garden/lawn/grill mapping keys | 9,476 | 48,345 | Auction token Home & Garden is 8,065 mentions and currently becomes Mixed, but that token is wider than the yard (it also covers décor). Do not pour the whole token in. |
| Appliances | `VACUUMS`, `MIXED_SMALL_APPLIANCES`, `KITCHEN_APPLIANCES`, `MIXED_MAJOR_APPLIANCES`, `HEATING_COOLING_AND_AIR_QUALITY`, `LAUNDRY_APPLIANCES` | 321 | 57,114 | Auction tokens Major Appliances 2,656 and Small Appliances 2,161, both currently Mixed. The slug `appliances` is hardcoded to Kitchen. |
| Arts & crafts | `ARTS_AND_CRAFTS` | 268 | 12,883 | Office is where it goes today. One unmapped key is `wal-outdoor-living-and-garden-art-craft`. |
| Automotive | `AUTOMOTIVE_ACCESSORIES`, `MIXED_AUTOMOTIVE_SUPPLIES`, `AUTOMOTIVE_FILTERS`, `ENGINE`, plus CSV-only `TOWING`, `BRAKING`, `STEERING_AND_CHASSIS` | 235 | 4,169 | Auction token Automotive Supplies is 2,328 mentions and becomes Mixed. Learned keys send the same goods to Tools. |
| Groceries | `PANTRY`, `MIXED_GROCERIES` | 70 | 475 | Auction token Groceries is 999 mentions and becomes Mixed. Purchased volume is small. |

Gaming, if it is kept separate rather than split across Books, Toys, and Electronics: `GAMING`, 521 units, $14,459.

## Observations

- The gap that puts bought lines in Mixed is `canonical_category_name`, not the learned `CategoryMapping` table. Most high-volume codes already have a 60% mapping home. The function never sees it, and the function that was supposed to (`category_code_to_taxonomy`) searches for an `-api-` key shape this table does not use.
- `MIXED_LOTS` on recent PO lines is not one kind of product. After preprocessing it is mostly apparel, then party, then health and beauty.
