# R-017 · What is inside Mixed lots (titles and brands)
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 15:58 CT · **Finished:** 2026-09-23 16:07 CT · **Status:** done

Dev database, read 2026-09-23. Read-only. Queries: `workspace/runner/R-017/analyze.py`.

Population: items with `status` `sold` or `on_shelf` whose product category is `Mixed lots & uncategorized` (`apps/buying/taxonomy_v1.py:35`, `apps/inventory/models.py:1783-1790`). One item is one unit. **115,396** items: 107,129 sold, 8,267 on shelf.

A **real category** is a taxonomy v1 name other than Mixed lots (`apps/buying/taxonomy_v1.py:9-28`). Match is the trimmed string. Vendor codes such as `TOYS` or `KITCHEN_AND_DINING` are not real categories (ITM-11, R-012).

**Normalized title** is `lower(btrim(title))`. That is the fold R-006 used for duplicate titles, and the same case-fold as `apps/inventory/services/product_matching.py:158`. There is no title-normalizer function in the app.

**Era** is the item `notes` prefix (`apps/inventory/models.py:1861`), per the register eras (`.ai/extended/data-quality.md:50-59`): `BACKFILL:v1` → V1, `BACKFILL:v2` → V2, `RETAGGED_FROM_DB2:` → V3 retag, anything else → V3 native. V3 below is retag plus native.

| Era | Sold | On shelf | Items |
|---|---:|---:|---:|
| V1 | 60,401 | 0 | 60,401 |
| V2 | 36,218 | 5 | 36,223 |
| V3 retag | 4,537 | 4,669 | 9,206 |
| V3 native | 5,973 | 3,593 | 9,566 |
| V3 | 10,510 | 8,262 | 18,772 |
| All | 107,129 | 8,267 | 115,396 |

Agreement for brands, keywords, and same-title rules uses **every non-mixed item**, every status: 45,465 items (sold 15,637, on shelf 23,214, scrapped 6,612, lost 2).

---

## 1. Free copies

Each source is a count of population items that could take a real category from that source. The union is items with at least one source. Same-title here is any other product with that normalized title and a real category, even when those products disagree.

| Source | Items | Share |
|---|---:|---:|
| Manifest line category is a real taxonomy name | 5,650 | 4.9% |
| Another product with the same normalized title has a real category | 1,737 | 1.5% |
| …and those non-mixed items agree at 90% or more | 1,708 | 1.5% |
| Preprocessing `final_category` is a real taxonomy name | 2,446 | 2.1% |
| Union | 9,607 | 8.3% |

The manifest category is `Item.manifest_row` (`apps/inventory/models.py:1815-1820`). All 5,650 are on the item's own manifest row. The check-in manifest row added none. Preprocessing `final_category` (`apps/inventory/models.py:520`) is the preprocessing row on that manifest row (`apps/inventory/models.py:486-493`, unique at `:598-600`). 2,524 population items had a `final_category` that way. 1 item had one only through its check-in's processing row. 2,446 items had a real taxonomy name from either path.

Manifest and preprocessing barely overlap: **1** item has a real category on both. Same-title overlaps the manifest on 211 items and preprocessing on 14. No item has all three.

| Era | Manifest | Same title | Preprocessing | Union | Items |
|---|---:|---:|---:|---:|---:|
| V1 | 0 | 1,091 | 0 | 1,091 | 60,401 |
| V2 | 0 | 364 | 0 | 364 | 36,223 |
| V3 retag | 0 | 43 | 0 | 43 | 9,206 |
| V3 native | 5,650 | 239 | 2,446 | 8,109 | 9,566 |
| V3 | 5,650 | 282 | 2,446 | 8,152 | 18,772 |
| All | 5,650 | 1,737 | 2,446 | 9,607 | 115,396 |

V1, V2, and V3 retag have no manifest or preprocessing category on these items. Their free copies are same-title matches only.

Manifest text that is not a taxonomy name is not in the manifest count. Largest vendor codes on this population: `OUTDOOR_LIVING_AND_GARDEN` 828, `KITCHEN_AND_DINING` 220, `HOUSEHOLD_ESSENTIALS` 194, `PERSONAL_CARE` 193, `PET_SUPPLIES` 176, `MIXED_LOTS` 134, `HOME_DECOR` 128. Single-word codes include `TOYS` 76, `BEDDING` 59, `PANTRY` 25.

---

## 2. Brands

Brand key: the product brand (`apps/inventory/models.py:1552`), lower-cased, trimmed, internal space collapsed. If that value is junk, the key is the first title token of at least 2 characters that is not a pure number and not a function word. Junk values: generic, unbranded, unknown, n/a, na, none, no brand, not specified, unspecified, misc, miscellaneous, various, assorted, mixed, null, brand, see title, see description, tbd, other, no name, noname.

Junk brands on this population, so the key is the first title token: Generic 3,473, Unbranded 1,465, NA 239, Unknown 239, N/A 170, No Brand 33. Every population item got a key.

The top 100 keys cover **52,027** mixed units (45.1%). A key is a rule candidate when its non-mixed items are at least 90% one category. **24** of the 100 are candidates. **12** of those 24 have at least 5 non-mixed items.

The four largest brands are not candidates. Threshold is 38.7% Bedding & bath (974 non-mixed items), Room Essentials 49.3% Outdoor & patio furniture (367), Hearth & Hand with Magnolia 38.0% Home décor & lighting (108), Brightroom 27.6% Toys & games (29). Amazon Basics is 85.1% Electronics (941), under 90%.

The first-token key `st` is rank 12 (771 mixed units), almost all titles starting `St. Jude`. Its 2 non-mixed items are both Tools & hardware, so those 771 units qualify for Tools & hardware under the 90% brand rule. It drops out when a candidate needs at least 5 non-mixed items.

Candidates (90% or more). `n` is non-mixed items. `n≥5` is whether that support is at least 5.

| # | Brand | From | Mixed units | n | Top category | Share | n≥5 |
|---:|---|---|---:|---:|---|---:|---|
| 5 | LEGO | field | 1,267 | 12 | Toys & games | 91.7% | yes |
| 12 | st | first token | 771 | 2 | Tools & hardware | 100.0% |  |
| 20 | Owala | field | 489 | 25 | Kitchen & dining | 96.0% | yes |
| 23 | Ridgid | field | 416 | 3 | Tools & hardware | 100.0% |  |
| 33 | FAO Schwarz | field | 356 | 3 | Electronics | 100.0% |  |
| 34 | Pen+Gear | field | 350 | 252 | Office & school supplies | 100.0% | yes |
| 39 | Milwaukee | field | 331 | 3 | Tools & hardware | 100.0% |  |
| 42 | Crayola | field | 304 | 107 | Office & school supplies | 95.3% | yes |
| 47 | Nerf | field | 282 | 16 | Toys & games | 93.8% | yes |
| 58 | Made By Design | field | 217 | 6 | Toys & games | 100.0% | yes |
| 66 | Adidas | field | 192 | 10 | Health, beauty & personal care | 90.0% | yes |
| 74 | Bullseye's Playground | field | 182 | 39 | Electronics | 92.3% | yes |
| 77 | Pokemon | field | 179 | 302 | Toys & games | 98.3% | yes |
| 79 | Jurassic World | field | 177 | 1 | Health, beauty & personal care | 100.0% |  |
| 86 | Holmes | field | 163 | 2 | Household & cleaning | 100.0% |  |
| 87 | Embark | field | 158 | 1 | Toys & games | 100.0% |  |
| 90 | Learning Resources | field | 154 | 1 | Office & school supplies | 100.0% |  |
| 91 | Tonies | field | 154 | 10 | Electronics | 90.0% | yes |
| 93 | Best Pet Supplies | field | 152 | 12 | Pet supplies | 100.0% | yes |
| 94 | Munchkin | field | 152 | 1 | Baby & kids | 100.0% |  |
| 95 | McFarlane Toys | field | 149 | 1 | Household & cleaning | 100.0% |  |
| 96 | Kohler | field | 148 | 1 | Bedding & bath | 100.0% |  |
| 99 | LeapFrog | field | 142 | 3 | Tools & hardware | 100.0% |  |
| 100 | Hefty | field | 141 | 8 | Household & cleaning | 100.0% | yes |

Of Bullseye's Playground's 39 non-mixed items, 36 are Electronics (35 `scrapped`, 1 sold). FAO Schwarz's 3 non-mixed items are Electronics (2 scrapped, 1 sold).

Those 24 keys cover 7,026 mixed units. Brand rules in section 4 use only these 24, not brands outside the top 100.

All 100:

| # | Brand | From | Mixed units | Non-mixed | Top category | Share | ≥90% |
|---:|---|---|---:|---:|---|---:|---|
| 1 | Threshold | field | 10,099 | 974 | Bedding & bath | 38.7% |  |
| 2 | Room Essentials | field | 3,714 | 367 | Outdoor & patio furniture | 49.3% |  |
| 3 | Hearth & Hand with Magnolia | field | 3,442 | 108 | Home décor & lighting | 38.0% |  |
| 4 | Brightroom | field | 2,271 | 29 | Toys & games | 27.6% |  |
| 5 | LEGO | field | 1,267 | 12 | Toys & games | 91.7% | yes |
| 6 | Casaluna | field | 1,177 | 67 | Bedding & bath | 70.1% |  |
| 7 | Husky | field | 1,116 | 28 | Tools & hardware | 46.4% |  |
| 8 | up&up | field | 1,098 | 50 | Toys & games | 48.0% |  |
| 9 | Figmint | field | 1,043 | 45 | Toys & games | 40.0% |  |
| 10 | Threshold Designed W/Studio Mcgee | field | 960 | 137 | Bedding & bath | 34.3% |  |
| 11 | Mainstays | field | 885 | 398 | Bedding & bath | 35.9% |  |
| 12 | st | first token | 771 | 2 | Tools & hardware | 100.0% | yes |
| 13 | Pillowfort | field | 760 | 83 | Bedding & bath | 51.8% |  |
| 14 | Funko | field | 653 | 10 | Kitchen & dining | 70.0% |  |
| 15 | Stanley | field | 643 | 71 | Toys & games | 42.3% |  |
| 16 | Amazon Basics | field | 552 | 941 | Electronics | 85.1% |  |
| 17 | Zak Designs | field | 547 | 7 | Toys & games | 28.6% |  |
| 18 | Melissa & Doug | field | 541 | 14 | Toys & games | 71.4% |  |
| 19 | OXO | field | 498 | 42 | Toys & games | 47.6% |  |
| 20 | Owala | field | 489 | 25 | Kitchen & dining | 96.0% | yes |
| 21 | Disney | field | 485 | 44 | Apparel & accessories | 50.0% |  |
| 22 | Dewalt | field | 458 | 14 | Household & cleaning | 42.9% |  |
| 23 | Ridgid | field | 416 | 3 | Tools & hardware | 100.0% | yes |
| 24 | Ryobi | field | 415 | 13 | Household & cleaning | 38.5% |  |
| 25 | Better Homes & Gardens | field | 402 | 73 | Home décor & lighting | 34.2% |  |
| 26 | Sun Squad | field | 398 | 9 | Health, beauty & personal care | 44.4% |  |
| 27 | Wondershop | field | 384 | 59 | Toys & games | 37.3% |  |
| 28 | Star Wars | field | 383 | 6 | Toys & games | 83.3% |  |
| 29 | Cuisinart | field | 380 | 55 | Kitchen & dining | 61.8% |  |
| 30 | Ello | field | 378 | 18 | Toys & games | 61.1% |  |
| 31 | Squishmallows | field | 372 | 10 | Toys & games | 60.0% |  |
| 32 | All In Motion | field | 371 | 24 | Electronics | 62.5% |  |
| 33 | FAO Schwarz | field | 356 | 3 | Electronics | 100.0% | yes |
| 34 | Pen+Gear | field | 350 | 252 | Office & school supplies | 100.0% | yes |
| 35 | Speedo | field | 344 | 0 |  | — |  |
| 36 | Kwikset | field | 338 | 0 |  | — |  |
| 37 | Barbie | field | 332 | 9 | Toys & games | 88.9% |  |
| 38 | Schwinn | field | 332 | 3 | Sports & outdoors | 66.7% |  |
| 39 | Milwaukee | field | 331 | 3 | Tools & hardware | 100.0% | yes |
| 40 | Gigglescape | field | 321 | 3 | Baby & kids | 66.7% |  |
| 41 | kids | first token | 319 | 46 | Electronics | 84.8% |  |
| 42 | Crayola | field | 304 | 107 | Office & school supplies | 95.3% | yes |
| 43 | Boots & Barkley | field | 302 | 17 | Toys & games | 47.1% |  |
| 44 | Unbraded | field | 298 | 26 | Electronics | 46.2% |  |
| 45 | VTech | field | 288 | 50 | Electronics | 84.0% |  |
| 46 | Sterilite | field | 285 | 74 | Storage & organization | 81.1% |  |
| 47 | Nerf | field | 282 | 16 | Toys & games | 93.8% | yes |
| 48 | Fisher-Price | field | 273 | 55 | Toys & games | 81.8% |  |
| 49 | Marvel | field | 268 | 14 | Toys & games | 57.1% |  |
| 50 | Hasbro Gaming | field | 242 | 0 |  | — |  |
| 51 | Ozark Trail | field | 240 | 52 | Sports & outdoors | 51.9% |  |
| 52 | Iris | field | 234 | 3 | Home décor & lighting | 66.7% |  |
| 53 | Mr. Clean | field | 229 | 2 | Household & cleaning | 50.0% |  |
| 54 | Dash | field | 226 | 11 | Kitchen & dining | 81.8% |  |
| 55 | Franklin Sports | field | 221 | 5 | Sports & outdoors | 60.0% |  |
| 56 | Foundry Candle Co. | field | 219 | 0 |  | — |  |
| 57 | Opalhouse Designed With Jungalow | field | 219 | 5 | Furniture | 40.0% |  |
| 58 | Made By Design | field | 217 | 6 | Toys & games | 100.0% | yes |
| 59 | Hamilton Beach | field | 213 | 9 | Home décor & lighting | 33.3% |  |
| 60 | Hot Wheels | field | 211 | 7 | Toys & games | 71.4% |  |
| 61 | Grand Tongo | field | 209 | 0 |  | — |  |
| 62 | CharCharms | field | 203 | 42 | Books & media | 38.1% |  |
| 63 | Intex | field | 200 | 10 | Health, beauty & personal care | 70.0% |  |
| 64 | Reduce | field | 200 | 5 | Toys & games | 40.0% |  |
| 65 | Simple Modern | field | 196 | 14 | Kitchen & dining | 35.7% |  |
| 66 | Adidas | field | 192 | 10 | Health, beauty & personal care | 90.0% | yes |
| 67 | Honeywell | field | 192 | 6 | Home décor & lighting | 66.7% |  |
| 68 | Buffalo Games | field | 189 | 0 |  | — |  |
| 69 | Sun Zero | field | 187 | 0 |  | — |  |
| 70 | Black+Decker | field | 186 | 6 | Household & cleaning | 66.7% |  |
| 71 | Little Tikes | field | 186 | 18 | Toys & games | 61.1% |  |
| 72 | Blue Ridge Tools | field | 183 | 0 |  | — |  |
| 73 | Tupperware | field | 183 | 22 | Toys & games | 59.1% |  |
| 74 | Bullseye's Playground | field | 182 | 39 | Electronics | 92.3% | yes |
| 75 | Hydro Flask | field | 182 | 5 | Toys & games | 80.0% |  |
| 76 | Superity Linen | field | 182 | 0 |  | — |  |
| 77 | Pokemon | field | 179 | 302 | Toys & games | 98.3% | yes |
| 78 | Conair | field | 178 | 36 | Toys & games | 47.2% |  |
| 79 | Jurassic World | field | 177 | 1 | Health, beauty & personal care | 100.0% | yes |
| 80 | Gourmia | field | 175 | 11 | Toys & games | 36.4% |  |
| 81 | Clorox | field | 172 | 20 | Household & cleaning | 45.0% |  |
| 82 | Eclipse | field | 170 | 4 | Apparel & accessories | 50.0% |  |
| 83 | MGA's Miniverse | field | 168 | 0 |  | — |  |
| 84 | Farberware | field | 163 | 6 | Kitchen & dining | 33.3% |  |
| 85 | Finish | field | 163 | 0 |  | — |  |
| 86 | Holmes | field | 163 | 2 | Household & cleaning | 100.0% | yes |
| 87 | Embark | field | 158 | 1 | Toys & games | 100.0% | yes |
| 88 | Tramontina | field | 158 | 8 | Kitchen & dining | 87.5% |  |
| 89 | Harbortown | field | 156 | 0 |  | — |  |
| 90 | Learning Resources | field | 154 | 1 | Office & school supplies | 100.0% | yes |
| 91 | Tonies | field | 154 | 10 | Electronics | 90.0% | yes |
| 92 | Brita | field | 153 | 4 | Kitchen & dining | 75.0% |  |
| 93 | Best Pet Supplies | field | 152 | 12 | Pet supplies | 100.0% | yes |
| 94 | Munchkin | field | 152 | 1 | Baby & kids | 100.0% | yes |
| 95 | McFarlane Toys | field | 149 | 1 | Household & cleaning | 100.0% | yes |
| 96 | Kohler | field | 148 | 1 | Bedding & bath | 100.0% | yes |
| 97 | Hasbro | field | 145 | 4 | Toys & games | 50.0% |  |
| 98 | Universal Music Group | field | 143 | 0 |  | — |  |
| 99 | LeapFrog | field | 142 | 3 | Tools & hardware | 100.0% | yes |
| 100 | Hefty | field | 141 | 8 | Household & cleaning | 100.0% | yes |

---

## 3. Keywords

A title word is a run of letters and digits, lower-cased, counted once per item. Dropped: function words (the list is `STOP` in `analyze.py`), tokens shorter than 2 characters, and pure numbers. The top 200 are by mixed units. The share is the top category among non-mixed items whose title contains that word.

**8** of the 200 are at 90% or more. All 8 have at least 5 non-mixed items. `Placed items` is from section 4: population items that were placed and whose title contains the word. A title with two of these words is on both rows.

| # | Word | Mixed units | Non-mixed | Top category | Share | Placed items |
|---:|---|---:|---:|---|---:|---:|
| 94 | comforter | 1,084 | 441 | Bedding & bath | 98.9% | 1,077 |
| 129 | 3pk | 876 | 60 | Electronics | 90.0% | 800 |
| 148 | pro | 781 | 1,510 | Electronics | 91.0% | 637 |
| 162 | trash | 751 | 323 | Household & cleaning | 97.5% | 605 |
| 183 | brightroom | 685 | 7 | Storage & organization | 100.0% | 548 |
| 184 | fresh | 683 | 695 | Health, beauty & personal care | 91.9% | 599 |
| 193 | building | 662 | 48 | Toys & games | 97.9% | 649 |
| 198 | clean | 659 | 627 | Health, beauty & personal care | 96.2% | 523 |

The most common words are not rules. `set` is 22.1% Party, seasonal & novelty (3,154 non-mixed items), `black` is 80.0% Electronics (2,597), `dog` is 84.3% Pet supplies (491).

All 200:

| # | Word | Mixed units | Non-mixed | Top category | Share | ≥90% |
|---:|---|---:|---:|---|---:|---|
| 1 | set | 10,827 | 3,154 | Party, seasonal & novelty | 22.1% |  |
| 2 | black | 9,662 | 2,597 | Electronics | 80.0% |  |
| 3 | white | 7,470 | 809 | Electronics | 63.5% |  |
| 4 | blue | 5,489 | 916 | Electronics | 38.0% |  |
| 5 | steel | 3,951 | 427 | Kitchen & dining | 28.8% |  |
| 6 | gray | 3,880 | 299 | Electronics | 55.5% |  |
| 7 | storage | 3,451 | 636 | Toys & games | 52.2% |  |
| 8 | green | 3,362 | 416 | Electronics | 26.7% |  |
| 9 | kids | 3,268 | 587 | Electronics | 29.8% |  |
| 10 | stainless | 3,195 | 303 | Kitchen & dining | 41.3% |  |
| 11 | light | 3,160 | 229 | Electronics | 33.2% |  |
| 12 | pack | 2,969 | 2,530 | Party, seasonal & novelty | 16.0% |  |
| 13 | threshold | 2,864 | 815 | Bedding & bath | 51.9% |  |
| 14 | water | 2,826 | 286 | Health, beauty & personal care | 26.6% |  |
| 15 | dog | 2,725 | 491 | Pet supplies | 84.3% |  |
| 16 | bottle | 2,687 | 340 | Health, beauty & personal care | 59.4% |  |
| 17 | curtain | 2,617 | 163 | Home décor & lighting | 59.5% |  |
| 18 | table | 2,603 | 242 | Party, seasonal & novelty | 32.2% |  |
| 19 | cotton | 2,577 | 336 | Bedding & bath | 52.1% |  |
| 20 | pillow | 2,563 | 583 | Bedding & bath | 35.0% |  |
| 21 | figure | 2,433 | 120 | Toys & games | 80.8% |  |
| 22 | box | 2,255 | 770 | Health, beauty & personal care | 76.1% |  |
| 23 | queen | 2,250 | 271 | Bedding & bath | 81.2% |  |
| 24 | toy | 2,228 | 682 | Toys & games | 59.5% |  |
| 25 | pink | 2,200 | 359 | Electronics | 60.4% |  |
| 26 | cream | 2,191 | 139 | Health, beauty & personal care | 33.1% |  |
| 27 | 2pk | 2,152 | 217 | Electronics | 71.0% |  |
| 28 | glass | 2,137 | 568 | Household & cleaning | 45.2% |  |
| 29 | plush | 2,136 | 278 | Pet supplies | 46.0% |  |
| 30 | throw | 2,108 | 331 | Bedding & bath | 39.9% |  |
| 31 | large | 2,100 | 119 | Storage & organization | 23.5% |  |
| 32 | hand | 1,976 | 176 | Health, beauty & personal care | 47.2% |  |
| 33 | may | 1,967 | 0 |  | — |  |
| 34 | sheet | 1,946 | 254 | Bedding & bath | 46.5% |  |
| 35 | led | 1,834 | 214 | Home décor & lighting | 42.5% |  |
| 36 | mini | 1,811 | 346 | Electronics | 46.8% |  |
| 37 | red | 1,806 | 384 | Electronics | 27.6% |  |
| 38 | game | 1,771 | 55 | Toys & games | 40.0% |  |
| 39 | incomplete | 1,760 | 0 |  | — |  |
| 40 | inch | 1,677 | 757 | Tools & hardware | 33.9% |  |
| 41 | brown | 1,663 | 114 | Electronics | 31.6% |  |
| 42 | wood | 1,640 | 193 | Home décor & lighting | 20.7% |  |
| 43 | full | 1,631 | 307 | Bedding & bath | 61.9% |  |
| 44 | food | 1,617 | 191 | Pet supplies | 47.6% |  |
| 45 | clear | 1,602 | 373 | Electronics | 72.1% |  |
| 46 | air | 1,599 | 685 | Household & cleaning | 53.6% |  |
| 47 | up | 1,595 | 54 | Electronics | 29.6% |  |
| 48 | kit | 1,580 | 705 | Health, beauty & personal care | 33.9% |  |
| 49 | rug | 1,576 | 250 | Home décor & lighting | 42.0% |  |
| 50 | blanket | 1,568 | 144 | Bedding & bath | 70.1% |  |
| 51 | wall | 1,562 | 630 | Home décor & lighting | 49.2% |  |
| 52 | metal | 1,560 | 153 | Home décor & lighting | 35.3% |  |
| 53 | natural | 1,547 | 136 | Baby & kids | 47.8% |  |
| 54 | size | 1,525 | 380 | Apparel & accessories | 57.4% |  |
| 55 | king | 1,514 | 312 | Bedding & bath | 89.1% |  |
| 56 | round | 1,509 | 135 | Outdoor & patio furniture | 31.1% |  |
| 57 | ceramic | 1,501 | 135 | Kitchen & dining | 40.0% |  |
| 58 | ages | 1,475 | 17 | Home décor & lighting | 64.7% |  |
| 59 | electric | 1,472 | 169 | Office & school supplies | 25.4% |  |
| 60 | portable | 1,467 | 259 | Electronics | 44.4% |  |
| 61 | plastic | 1,450 | 1,588 | Kitchen & dining | 89.7% |  |
| 62 | action | 1,392 | 45 | Toys & games | 71.1% |  |
| 63 | outdoor | 1,379 | 304 | Outdoor & patio furniture | 54.9% |  |
| 64 | oz | 1,374 | 82 | Sports & outdoors | 31.7% |  |
| 65 | baby | 1,370 | 359 | Baby & kids | 41.8% |  |
| 66 | twin | 1,364 | 209 | Bedding & bath | 78.0% |  |
| 67 | woven | 1,358 | 77 | Outdoor & patio furniture | 42.9% |  |
| 68 | count | 1,350 | 698 | Kitchen & dining | 37.0% |  |
| 69 | candle | 1,346 | 52 | Home décor & lighting | 63.5% |  |
| 70 | kitchen | 1,342 | 169 | Kitchen & dining | 49.1% |  |
| 71 | xl | 1,340 | 168 | Bedding & bath | 54.2% |  |
| 72 | dark | 1,332 | 141 | Electronics | 68.8% |  |
| 73 | bath | 1,320 | 155 | Health, beauty & personal care | 47.1% |  |
| 74 | medium | 1,300 | 53 | Pet supplies | 52.8% |  |
| 75 | small | 1,279 | 74 | Pet supplies | 40.5% |  |
| 76 | hearth | 1,266 | 13 | Home décor & lighting | 61.5% |  |
| 77 | piece | 1,261 | 933 | Party, seasonal & novelty | 24.0% |  |
| 78 | panel | 1,259 | 89 | Home décor & lighting | 38.2% |  |
| 79 | 4pk | 1,229 | 93 | Toys & games | 28.0% |  |
| 80 | lid | 1,222 | 62 | Kitchen & dining | 38.7% |  |
| 81 | lamp | 1,217 | 58 | Home décor & lighting | 60.3% |  |
| 82 | soft | 1,215 | 184 | Electronics | 60.3% |  |
| 83 | straw | 1,195 | 87 | Kitchen & dining | 40.2% |  |
| 84 | bed | 1,178 | 234 | Bedding & bath | 38.9% |  |
| 85 | tumbler | 1,178 | 177 | Kitchen & dining | 52.0% |  |
| 86 | bag | 1,175 | 397 | Kitchen & dining | 39.8% |  |
| 87 | jar | 1,155 | 28 | Kitchen & dining | 42.9% |  |
| 88 | disney | 1,148 | 89 | Toys & games | 58.4% |  |
| 89 | doll | 1,144 | 29 | Toys & games | 51.7% |  |
| 90 | cover | 1,116 | 275 | Tools & hardware | 17.5% |  |
| 91 | cat | 1,110 | 253 | Pet supplies | 79.4% |  |
| 92 | room | 1,104 | 316 | Outdoor & patio furniture | 57.3% |  |
| 93 | organizer | 1,097 | 188 | Storage & organization | 47.3% |  |
| 94 | comforter | 1,084 | 441 | Bedding & bath | 98.9% | yes |
| 95 | standard | 1,084 | 51 | Electronics | 25.5% |  |
| 96 | faux | 1,079 | 118 | Home décor & lighting | 41.5% |  |
| 97 | linen | 1,067 | 148 | Home décor & lighting | 23.6% |  |
| 98 | board | 1,051 | 110 | Kitchen & dining | 45.5% |  |
| 99 | pop | 1,045 | 94 | Electronics | 64.9% |  |
| 100 | shower | 1,036 | 157 | Bedding & bath | 61.8% |  |
| 101 | bike | 1,029 | 29 | Sports & outdoors | 27.6% |  |
| 102 | adjustable | 1,019 | 95 | Health, beauty & personal care | 27.4% |  |
| 103 | paper | 1,016 | 280 | Office & school supplies | 32.5% |  |
| 104 | blackout | 1,007 | 78 | Home décor & lighting | 59.0% |  |
| 105 | essentials | 999 | 330 | Outdoor & patio furniture | 54.8% |  |
| 106 | square | 997 | 75 | Electronics | 32.0% |  |
| 107 | frame | 990 | 78 | Home décor & lighting | 55.1% |  |
| 108 | gold | 986 | 537 | Apparel & accessories | 39.1% |  |
| 109 | magnolia | 985 | 6 | Home décor & lighting | 50.0% |  |
| 110 | silver | 984 | 361 | Party, seasonal & novelty | 47.6% |  |
| 111 | cup | 978 | 251 | Kitchen & dining | 70.9% |  |
| 112 | solid | 972 | 56 | Outdoor & patio furniture | 28.6% |  |
| 113 | floor | 955 | 65 | Household & cleaning | 27.7% |  |
| 114 | rectangle | 935 | 113 | Electronics | 84.1% |  |
| 115 | ultra | 930 | 412 | Electronics | 25.5% |  |
| 116 | drawer | 922 | 19 | Toys & games | 31.6% |  |
| 117 | rod | 917 | 88 | Home décor & lighting | 71.6% |  |
| 118 | door | 915 | 314 | Household & cleaning | 62.4% |  |
| 119 | striped | 915 | 86 | Outdoor & patio furniture | 26.7% |  |
| 120 | chair | 913 | 237 | Outdoor & patio furniture | 73.8% |  |
| 121 | ball | 907 | 113 | Sports & outdoors | 25.7% |  |
| 122 | mat | 899 | 124 | Kitchen & dining | 33.1% |  |
| 123 | washable | 897 | 27 | Office & school supplies | 77.8% |  |
| 124 | bowl | 895 | 146 | Kitchen & dining | 40.4% |  |
| 125 | matte | 892 | 64 | Electronics | 40.6% |  |
| 126 | tool | 886 | 85 | Household & cleaning | 27.1% |  |
| 127 | container | 883 | 65 | Kitchen & dining | 40.0% |  |
| 128 | brass | 879 | 34 | Home décor & lighting | 64.7% |  |
| 129 | 3pk | 876 | 60 | Electronics | 90.0% | yes |
| 130 | 5in | 872 | 60 | Electronics | 38.3% |  |
| 131 | wick | 870 | 23 | Household & cleaning | 87.0% |  |
| 132 | candles | 869 | 7 | Home décor & lighting | 71.4% |  |
| 133 | purple | 868 | 173 | Electronics | 64.7% |  |
| 134 | shelf | 850 | 30 | Storage & organization | 63.3% |  |
| 135 | play | 843 | 84 | Electronics | 34.5% |  |
| 136 | bags | 835 | 587 | Household & cleaning | 55.4% |  |
| 137 | series | 830 | 186 | Electronics | 72.0% |  |
| 138 | free | 822 | 92 | Baby & kids | 27.2% |  |
| 139 | grey | 810 | 36 | Electronics | 41.7% |  |
| 140 | maker | 809 | 101 | Kitchen & dining | 53.5% |  |
| 141 | car | 800 | 333 | Electronics | 71.2% |  |
| 142 | towel | 800 | 123 | Bedding & bath | 60.2% |  |
| 143 | st | 789 | 40 | Party, seasonal & novelty | 62.5% |  |
| 144 | iron | 788 | 79 | Kitchen & dining | 40.5% |  |
| 145 | performance | 785 | 62 | Tools & hardware | 30.6% |  |
| 146 | basket | 782 | 79 | Storage & organization | 39.2% |  |
| 147 | classic | 782 | 61 | Electronics | 19.7% |  |
| 148 | pro | 781 | 1,510 | Electronics | 91.0% | yes |
| 149 | navy | 779 | 59 | Electronics | 39.0% |  |
| 150 | vacuum | 777 | 129 | Household & cleaning | 56.6% |  |
| 151 | religious | 771 | 6 | Party, seasonal & novelty | 50.0% |  |
| 152 | jude | 770 | 0 |  | — |  |
| 153 | coffee | 767 | 225 | Kitchen & dining | 85.3% |  |
| 154 | lego | 767 | 13 | Toys & games | 84.6% |  |
| 155 | 3pc | 766 | 53 | Bedding & bath | 34.0% |  |
| 156 | modern | 765 | 39 | Electronics | 25.6% |  |
| 157 | diapers | 762 | 71 | Pet supplies | 54.9% |  |
| 158 | beige | 760 | 24 | Toys & games | 25.0% |  |
| 159 | mattress | 756 | 60 | Bedding & bath | 50.0% |  |
| 160 | ivory | 754 | 61 | Toys & games | 21.3% |  |
| 161 | double | 751 | 94 | Apparel & accessories | 23.4% |  |
| 162 | trash | 751 | 323 | Household & cleaning | 97.5% | yes |
| 163 | star | 750 | 143 | Party, seasonal & novelty | 55.2% |  |
| 164 | gallon | 749 | 210 | Household & cleaning | 58.1% |  |
| 165 | decorative | 745 | 123 | Home décor & lighting | 70.7% |  |
| 166 | pads | 738 | 266 | Health, beauty & personal care | 58.6% |  |
| 167 | floral | 735 | 735 | Apparel & accessories | 49.3% |  |
| 168 | hair | 734 | 202 | Health, beauty & personal care | 71.8% |  |
| 169 | foam | 728 | 162 | Bedding & bath | 41.4% |  |
| 170 | christmas | 726 | 464 | Party, seasonal & novelty | 53.9% |  |
| 171 | quilt | 726 | 83 | Bedding & bath | 86.7% |  |
| 172 | machine | 714 | 100 | Household & cleaning | 50.0% |  |
| 173 | cordless | 713 | 121 | Electronics | 42.1% |  |
| 174 | 16oz | 711 | 337 | Household & cleaning | 73.9% |  |
| 175 | color | 711 | 443 | Apparel & accessories | 52.6% |  |
| 176 | fl | 708 | 34 | Health, beauty & personal care | 58.8% |  |
| 177 | insulated | 705 | 134 | Kitchen & dining | 89.6% |  |
| 178 | 2pc | 701 | 44 | Toys & games | 36.4% |  |
| 179 | wooden | 697 | 156 | Home décor & lighting | 50.0% |  |
| 180 | stripe | 695 | 94 | Bedding & bath | 78.7% |  |
| 181 | placemat | 691 | 4 | Toys & games | 75.0% |  |
| 182 | pet | 689 | 322 | Pet supplies | 70.5% |  |
| 183 | brightroom | 685 | 7 | Storage & organization | 100.0% | yes |
| 184 | fresh | 683 | 695 | Health, beauty & personal care | 91.9% | yes |
| 185 | sham | 681 | 30 | Bedding & bath | 76.7% |  |
| 186 | travel | 679 | 154 | Health, beauty & personal care | 60.4% |  |
| 187 | fan | 677 | 186 | Electronics | 27.4% |  |
| 188 | yellow | 677 | 128 | Sports & outdoors | 35.2% |  |
| 189 | holder | 670 | 228 | Office & school supplies | 23.7% |  |
| 190 | window | 670 | 61 | Home décor & lighting | 45.9% |  |
| 191 | heavy | 668 | 317 | Household & cleaning | 70.0% |  |
| 192 | wide | 664 | 206 | Apparel & accessories | 72.8% |  |
| 193 | building | 662 | 48 | Toys & games | 97.9% | yes |
| 194 | orange | 662 | 84 | Sports & outdoors | 46.4% |  |
| 195 | pad | 662 | 224 | Electronics | 28.1% |  |
| 196 | toilet | 662 | 85 | Household & cleaning | 49.4% |  |
| 197 | figmint | 660 | 0 |  | — |  |
| 198 | clean | 659 | 627 | Health, beauty & personal care | 96.2% | yes |
| 199 | top | 654 | 440 | Apparel & accessories | 88.4% |  |
| 200 | power | 649 | 382 | Electronics | 79.8% |  |

---

## 4. Estimate

An item is **placed** when every source that qualifies names the same real category. One qualifying source is enough. Two that disagree are not placed.

Sources that qualify:

- Manifest category is a real taxonomy name.
- Preprocessing `final_category` is a real taxonomy name.
- Same normalized title: the top category among non-mixed items with that title is at least 90% (if there are no such items, among the non-mixed products).
- Brand: the item's brand key is one of the 24 candidates in section 2.
- Keyword: the title contains one or more of the 8 words in section 3, and those words share one category.

**15.6%** of the population is placed (18,007 of 115,396).

| Era | Items | Placed | Share |
|---|---:|---:|---:|
| V1 | 60,401 | 6,351 | 10.5% |
| V2 | 36,223 | 4,559 | 12.6% |
| V3 | 18,772 | 7,097 | 37.8% |
| V3 retag | 9,206 | 399 | 4.3% |
| V3 native | 9,566 | 6,698 | 70.0% |
| All | 115,396 | 18,007 | 15.6% |

Same rule, except a same-title, brand, or keyword source counts only when at least 5 non-mixed items back it (manifest and preprocessing copies still count). This is not a subset of the row above: dropping a thin conflicting source lets the remaining copy place the item. That is why V3 native goes up.

| Era | Items | Placed | Share |
|---|---:|---:|---:|
| V1 | 60,401 | 4,133 | 6.8% |
| V2 | 36,223 | 3,662 | 10.1% |
| V3 | 18,772 | 7,918 | 42.2% |
| V3 retag | 9,206 | 342 | 3.7% |
| V3 native | 9,566 | 7,576 | 79.2% |
| All | 115,396 | 15,713 | 13.6% |

Items with at least one qualifying source: 19,818 (17.2%). Of those, 1,811 name more than one category and are not placed. No qualifying source: 95,578 (82.8%).

Where the 18,007 placed items come from. A row is the set of sources that fired and agreed.

| Sources | Items |
|---|---:|
| Brand only | 4,835 |
| Manifest only | 4,757 |
| Keyword only | 4,585 |
| Preprocessing only | 1,513 |
| Same title only | 1,401 |
| Brand and keyword | 558 |
| Manifest and same title | 211 |
| Preprocessing and brand | 47 |
| Manifest and keyword | 29 |
| Preprocessing and keyword | 27 |
| Same title and brand | 18 |
| Same title and keyword | 12 |
| Manifest and brand | 9 |
| Preprocessing and same title | 3 |
| Manifest and preprocessing | 1 |
| Preprocessing, same title, and keyword | 1 |
| All placed | 18,007 |

---

## 5. Samples

30 titles drawn uniformly from the 63,324 distinct normalized titles (of 73,823) where no population item had a qualifying source. Seed `20260923`. Not weighted by units.

| # | Title | Units |
|---:|---|---:|
| 1 | C.E.T. Oral Hygiene Kit For Cats & Dogs - 3pc Set, Poultry Flavor, 2.5oz | 2 |
| 2 | 70" Cotton Polyester Blend Open Plaid Round Tablecloth Black Machine Washable | 4 |
| 3 | Bar Clamps Set for Woodworking 2-Pack 50 Inch | 1 |
| 4 | Cotton Duck Bed Rest Pillow - Scarlett | 1 |
| 5 | See & Surprise Laptop | 1 |
| 6 | Yes4All Solid Cast Iron Kettlebell 10 lbs Black | 1 |
| 7 | 5 Wick Footed Ceramic Scalloped Rim Salted Honey Jar Candle 34oz | 1 |
| 8 | Elegant Tea Time Metal Doll Table and Chair Set | 1 |
| 9 | Greenleaf Buttercup Dollhouse Kit - 1 Inch Scale | 1 |
| 10 | 30pk Suit Flocked Hangers - White | 1 |
| 11 | Sailor Moon Eternal Sailor Moon S.H.Figuarts Action Figure | 1 |
| 12 | Silicone Llama Color Changing LED Tabletop Lamp | 1 |
| 13 | Mikhajlo Faux Leather Upholstered Bench | 1 |
| 14 | 40V 6000mAh Battery for Kobalt 40-Volt Tools | 1 |
| 15 | Home Coir Mat - 18x30in | 2 |
| 16 | Sun Zero 40"x63" Arlander Crosshatch Thermal Blackout Grommet Curtain Panel Beige | 1 |
| 17 | Single Cylinder Square Keypad Deadbolt - Matte Black | 1 |
| 18 | 32oz Insulated Water Bottle w/ Straw - Winter White | 1 |
| 19 | Hasbro Giant Connect 4 Game | 3 |
| 20 | Klein Tools Digital 600 V Manual-Ranging Multimeters MM325 | 1 |
| 21 | TMNT Kids Throw Blanket - 46x60in, Blue | 1 |
| 22 | Gerber Boys Cotton Flannel Receiving Swaddle Blanket Woodland White 5 Count | 1 |
| 23 | Mother Of Pearl Shell Decorative Storage Boxes - Dark Blue, 5in & 4in, 2pk | 1 |
| 24 | Vive Bed Pan Liners Absorbent Pads 72 Pack Disposable Adult Incontinence | 1 |
| 25 | Oradrem Woven Cotton Rope Plant Basket for 11 12" Flower Pot Floor Indoor Planters, Decor Basket for Plants Storage Organizer Modern Home Decor (12" x 12", White) | 1 |
| 26 | Giant Rubber Duck - 6.89in, Dark Pink | 1 |
| 27 | Pig Family Plush Set - 12in Mother, 4 Babies | 1 |
| 28 | Twin Trolls 3 Blanket | 1 |
| 29 | Cars Lightning McQueen Car Builder | 2 |
| 30 | TYR Crossblade Fins 2.0 Unisex Adult Black/White Large | 1 |

