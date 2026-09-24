# R-028 result · Size the free-copy tier for Mixed products

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:34 · **Finished:** 2026-09-23 17:40

Mixed means the product's category name is missing or not one of the 22 real taxonomy names (R-021 bucket). Era is the R-021 tag: V1/V2 when at least half of the items with `sold_for > 0` are `BACKFILL:`. A V1/V2 product's own category is not used as a source (ITM-13). Sold dollars are `sold_for > 0` on the product's items.

122,478 Mixed products have at least one item.

## Source × era

| Source | Era | Products | Items | Sold $ |
|---|---|---:|---:|---:|
| Manifest name (already one of the 23, not Mixed) | V3 | 2,820 | 6,146 | 66,174 |
| Manifest code (`BSTOCK_CODE_TO_CANONICAL`, not Mixed) | V3 | 289 | 2,045 | 6,977 |
| Preprocessing `final_category` | V3 | 370 | 2,272 | 8,333 |
| Processing `category` | V3 | 3,174 | 8,372 | 73,932 |
| V3 sibling, same normalized title, not Mixed | V3 | 427 | 732 | 2,423 |
| Any of those | V3 | 3,516 | 8,877 | 74,487 |
| None of those | V3 | 48,037 | 64,762 | 55,683 |
| All Mixed products | V3 | 51,553 | 73,639 | 130,170 |
| Manifest name | V1/V2 | 1 | 11 | 47 |
| Manifest code | V1/V2 | 246 | 788 | 8,951 |
| Preprocessing `final_category` | V1/V2 | 325 | 1,047 | 12,364 |
| Processing `category` | V1/V2 | 326 | 1,058 | 12,411 |
| V3 sibling | V1/V2 | 902 | 1,723 | 25,322 |
| Any of those | V1/V2 | 1,224 | 2,769 | 37,597 |
| None of those | V1/V2 | 69,701 | 116,318 | 1,425,407 |
| All Mixed products | V1/V2 | 70,925 | 119,087 | 1,463,004 |

A product can hit more than one source, so the rows do not add to "any".

## Conflicts

132 products have two or more different non-Mixed names across sources. The pattern in the sample: the B-Stock code map names a new category, and preprocessing/processing still name one of the old 19.

| Product | Code map | Preprocessing and processing |
|---|---|---|
| Full/Queen Box Stitch Microfiber Quilt - Navy | Home décor | Bedding & bath |
| Laugh & Learn Smart Stages Puppy Walker | Toys & games | Baby & kids |
| Mobil 1 High Mileage 0W-20 … 5qt | Automotive | Tools & hardware |
| 5qt Mobil 1 Advanced 5W-20 | Automotive | Tools & hardware |
| Diesel Exhaust Fluid - 2.5 Gallon | Automotive | Tools & hardware |
| Dyson V11 Animal Cordless Stick Vacuum | Appliances | Household & cleaning |
| Extended Performance Oil Filter | Automotive | Tools & hardware |
| Warm Moisture Humidifier - White/Blue | Health & beauty (and Household on some rows) | same split |
| Coffee Mug Warmer with 3 Temperature Settings | Appliances | Kitchen & dining |
| 13.75in Patriotic Star Tinsel Wreath | Toys & games | Party, seasonal & novelty |

## Which source to trust

For V3, processing `category` carries almost all of the free-copy dollars ($73,932 of $74,487) and it matches preprocessing. The code map is the source that disagrees, and the disagreements are the new rulings (oil and filters to Automotive, the Dyson to Appliances, the mug warmer to Appliances). Use the code map when the manifest code is in `BSTOCK_CODE_TO_CANONICAL`; otherwise use the processing category. V1/V2 has almost no manifest name (1 product), which matches R-027: backfill items are not linked to manifest rows. A V3 sibling covers 902 of those old products and $25,322, a small slice of the $1.46M.
