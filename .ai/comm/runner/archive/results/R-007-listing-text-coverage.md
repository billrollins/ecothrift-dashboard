# R-007 result · What listings tell us without signing in

**Status:** done. Read-only. Dev DB, `buying.Auction.last_updated_at >= 2026-08-24 12:59 America/Chicago` (30 days before 2026-09-23 12:59). **3,930** auctions, 6 marketplaces. Script: `workspace/runner/R-007/query.py`. Mismatch counts: `workspace/runner/R-005/followup.py`.

**Usable** means non-blank text, a number **> 0**, or a non-null `end_time`. A zero would count as not usable. Zeros were not split out from nulls.

`pallet_count`, `origin_city`, and `shipment_type` are on `Auction` at `apps/buying/models.py:286-300`. They are not limited to rows updated today.

| | All auctions (17,432) | Inside this 30-day set |
|---|---:|---:|
| `pallet_count` > 0 | 16,726 | 3,668 |
| `origin_city` non-blank | 463 | 463 |
| `shipment_type` non-blank | 463 | 463 |

Every non-blank `origin_city` and `shipment_type` is inside the 30-day set. `pallet_count` is also filled on older auctions. In this window, `shipment_type` is blank 3,467, `LTL` 329, `Truckload` 107, `PARCEL` 27.

## 1. Field coverage by marketplace

Counts, then percent of that marketplace's auctions.

| Field | target (1,461) | walmart (1,161) | homedepot (496) | amazon (359) | costco (272) | wayfair (181) |
|---|---:|---:|---:|---:|---:|---:|
| `title` | 1,461 · 100% | 1,161 · 100% | 496 · 100% | 359 · 100% | 272 · 100% | 181 · 100% |
| `category` | 1,461 · 100% | 1,161 · 100% | 496 · 100% | 359 · 100% | 272 · 100% | 176 · 97.2% |
| `condition_summary` | 1,461 · 100% | 1,160 · 99.9% | 496 · 100% | 359 · 100% | 272 · 100% | 176 · 97.2% |
| `lot_size` | 1,449 · 99.2% | 1,147 · 98.8% | 362 · 73.0% | 359 · 100% | 272 · 100% | 163 · 90.1% |
| `total_retail_value` | 1,449 · 99.2% | 1,147 · 98.8% | 362 · 73.0% | 359 · 100% | 272 · 100% | 163 · 90.1% |
| `current_price` | 1,461 · 100% | 1,161 · 100% | 496 · 100% | 359 · 100% | 272 · 100% | 181 · 100% |
| `pallet_count` | 1,448 · 99.1% | 1,152 · 99.2% | 438 · 88.3% | 359 · 100% | 245 · 90.1% | 26 · 14.4% |
| `origin_city` | 70 · 4.8% | 53 · 4.6% | 27 · 5.4% | 15 · 4.2% | 272 · 100% | 26 · 14.4% |
| `shipment_type` | 70 · 4.8% | 53 · 4.6% | 27 · 5.4% | 15 · 4.2% | 272 · 100% | 26 · 14.4% |
| `lot_id` | 1,461 · 100% | 1,161 · 100% | 496 · 100% | 359 · 100% | 272 · 100% | 181 · 100% |
| `end_time` | 1,461 · 100% | 1,161 · 100% | 496 · 100% | 359 · 100% | 272 · 100% | 181 · 100% |

`origin_city` and `shipment_type` are filled on the same rows in each marketplace.

`condition_summary` is a JSON-looking list, not the title phrase. Most common values: target `['Used Good']` 843, `['New']` 446, `['Like New']` 157; walmart `['Used Fair']` 1,036, `['Like New']` 107; homedepot `['Salvage']` 244, `['Used Fair']` 175, `['Scratch & Dent']` 58; amazon `['Used Good']` 182, `['Like New']` 177; costco `['Used Good']` 188, `['Used Fair']` 49, `['Like New']` 12; wayfair `['Used Fair']` 130, `['Like New']` 29.

## 2. Title patterns

Patterns, case-insensitive: `N Pallet(s)` (`\d+ Pallets?`), `N Pallet Spaces`, `Truckload (N`, `N Units`, `Ext. Retail $N`, condition words, `City, ST` (a name, comma, two capital letters, anywhere in the title), lot code `\([A-Z]{2,6}-\d{4,}\)`.

`N Pallet(s)` also matches the "Pallet" in `N Pallet Spaces`. `New` does **not** include `Like New`.

| Pattern | target | walmart | homedepot | amazon | costco | wayfair |
|---|---:|---:|---:|---:|---:|---:|
| `N Pallet(s)` | 99.0% | 98.5% | 88.3% | 100% | 78.3% | 0% |
| `N Pallet Spaces` | 0% | 84.6% | 87.3% | 0% | 0% | 0% |
| `Truckload (N` | 22.0% | 15.2% | 44.8% | 0% | 0% | 0% |
| `N Units` | 93.0% | 9.2% | 0% | 0% | 94.5% | 0% |
| `Ext. Retail $N` | 99.0% | 9.2% | 0% | 0% | 100% | 0% |
| Any condition word below | 0.8% | 9.3% | 0% | 0% | 93.0% | 6.6% |
| Like New | 0% | 9.2% | 0% | 0% | 4.4% | 0% |
| Used - Good | 0.8% | 0.1% | 0% | 0% | 69.1% | 2.8% |
| Used - Fair | 0% | 0% | 0% | 0% | 18.0% | 3.3% |
| Salvage | 0% | 0% | 0% | 0% | 0% | 0.6% |
| Returns | 0% | 0% | 0% | 0% | 0% | 0% |
| Uninspected | 0% | 0% | 0% | 0% | 0% | 0% |
| New (not Like New) | 0% | 0% | 0% | 0% | 1.5% | 0% |
| `City, ST` | 99.8% | 10.6% | 9.3% | 0% | 100% | 6.6% |
| Lot code `(DAL-6973667)` shape | 0% | 0% | 0% | 0% | 96.7% | 0% |

Walmart titles in the mismatch sample use a different code, `6060-451-09-09-26`, with no parentheses. That shape was not counted. How often it appears: **UNKNOWN**.

Home Depot and Wayfair often say `Truckload of …` with no pallet number. That does not match `N Pallet(s)` or `Truckload (N`.

## 3. Title vs fields

Where the title had `N Units` and `lot_size` > 0 (**1,709** auctions), the numbers **never** differed.

Where the title had `Ext. Retail $N` and `total_retail_value` > 0 (**1,811**), the title is whole dollars and the field keeps cents. Gap over $1: **5** rows, two listing texts saved more than once. Largest gap **$1.33** (`186761` vs `186759.67`).

| id | marketplace | Disagreement | Title |
|---|---|---|---|
| 473205 | costco | retail 10184 vs 10183.54 | 2 Pallets of Massage/Relaxation, Exercise Equipment & Pool Item (AUR-7045164), Used - Good, 46 Units, Ext. Retail $10,184, Aurora, CO |
| 473204 | costco | retail 17370 vs 17369.82 | Truckload of Upholstered Furniture & Dining Furniture (MIR-7042554), Used - Fair, 18 Units, Ext. Retail $17,370, Mira Loma, CA |
| 473252 | target | retail 30163 vs 30162.85 | 3 Pallets of Gaming Products & Baby Gear, 874 Units, Ext. Retail $30,163, by Nintendo & More, Indianapolis, IN |
| 473256 | target | retail 9628 vs 9628.26 | 4 Pallets of Kitchenware & Tabletop Items, 870 Units, Ext. Retail $9,628, Upper Marlboro, MD |
| 472698 | walmart | retail 51293 vs 51293.48 | Truckload (8 Pallet Spaces) of General Merchandise, 6060-451-09-09-26, 6,061 Units, Like New Condition, Ext. Retail $51,293, Eastvale, CA - Export |
| 472695 | walmart | retail 20224 vs 20224.34 | Truckload (11 Pallet Spaces) of General Merchandise, 6060-449-08-17-26, 2,293 Units, Like New Condition, Ext. Retail $20,224, Eastvale, CA |
| 447996 | walmart | retail 186761 vs 186759.67 | Truckload (26 Pallet Spaces) of General Merchandise, 8240-158-09-08-26, 10,711 Units, Like New Condition, Ext. Retail $186,761, Atlanta, GA |
| 406204 | walmart | retail 265936 vs 265934.70 | Truckload (26 Pallet Spaces) of General Merchandise, 8240-156-08-31-26, 14,126 Units, Like New Condition, Ext. Retail $265,936, Atlanta, GA |

## 4. Misses

A miss means no pallet count in the title (`N Pallet` or `Truckload (N`) and `pallet_count` not > 0, and no `City, ST` in the title and blank `origin_city`.

**amazon, walmart, costco:** none. Amazon titles all contain a pallet count and no city (city is missing; pallet is not).

**target** (3, not 5):

- 452443 — NOT PALLETIZED - 22 Boxes of Target.com Apparel Studio Samples
- 448364 — NOT PALLETIZED - 20 Boxes of Target.com Apparel Studio Samples
- 417657 — NOT PALLETIZED - 20 Boxes of Target.com Apparel Studio Samples

**homedepot:**

- 469621 — Truckload of Major Appliances by GE, Frigidaire, Whirlpool, Maytag & LG
- 469622 — Truckload of Major Appliances
- 432203 — Truckload of Major Appliances by GE, Whirlpool, Frigidaire & LG
- 427959 — Truckload of Major Appliances by GE, Whirlpool, Frigidaire & More
- 427513 — Truckload of Major Appliances

**wayfair:**

- 460850 — Truckload of Rugs, Home Office Furniture, Upholstery, Outdoor & More
- 460859 — Truckload of Vanities, Home Office Furniture, Doors & Shutters, Office & More
- 460860 — Truckload of Lighting, Upholstery, Bedding, Home Office & More
- 460856 — Truckload of Lighting, Wall Accents, Accent Furniture & More
- 460855 — Truckload of Upholstery, Kitchen & Dining Furniture, Doors & Shutters, Bedroom Furniture & More

## 5. Category text

Top 20 `category` values. Blank shown as `(blank)`.

**target**

| n | category |
|---:|---|
| 349 | Home & Garden |
| 168 | Apparel Shoes & Accessories |
| 101 | Toys Kids & Baby |
| 74 | Sports & Outdoors |
| 64 | Home & Garden, Furniture |
| 54 | Electronics |
| 53 | Health & Beauty |
| 50 | Furniture |
| 32 | Mixed Lots |
| 25 | Toys Kids & Baby, Mixed Lots |
| 21 | Small Appliances |
| 16 | Home & Garden, Furniture, Mixed Lots |
| 15 | Furniture, Home & Garden |
| 11 | Apparel Shoes & Accessories, Mixed Lots |
| 10 | Pets |
| 10 | Home & Garden, Mixed Lots |
| 10 | Electronics, Mixed Lots |
| 9 | Books Movies & Music |
| 9 | Sports & Outdoors, Mixed Lots |
| 9 | Apparel Shoes & Accessories, Sports & Outdoors |

**walmart**

| n | category |
|---:|---|
| 44 | Sports & Outdoors, Toys Kids & Baby |
| 33 | Sports & Outdoors |
| 26 | Home & Garden, Major Appliances |
| 24 | Toys Kids & Baby, Sports & Outdoors |
| 20 | Apparel Shoes & Accessories |
| 18 | Major Appliances, Home & Garden |
| 16 | Mixed Lots |
| 11 | Sports & Outdoors, Home & Garden, Mixed Lots |
| 11 | Home & Garden |
| 10 | Home & Garden, Major Appliances, Sports & Outdoors |
| 9 | Home & Garden, Mixed Lots |
| 9 | Major Appliances, Home & Garden, Sports & Outdoors |
| 9 | Toys Kids & Baby, Sports & Outdoors, Mixed Lots |
| 7 | Sports & Outdoors, Home & Garden, Mixed Lots, Furniture |
| 7 | Major Appliances, Home & Garden, Sports & Outdoors, Pets |
| 6 | Major Appliances, Home & Garden, Mixed Lots, Sports & Outdoors |
| 5 | Sports & Outdoors, Toys Kids & Baby, Mixed Lots |
| 5 | Health & Beauty, Home & Garden |
| 5 | Electronics, Home & Garden, Automotive Supplies, Jewelry & Watches |
| 4 | Groceries, Apparel Shoes & Accessories, Home & Garden |

**homedepot**

| n | category |
|---:|---|
| 88 | Building & Industrial |
| 56 | Major Appliances |
| 41 | Mixed Lots |
| 38 | Home & Garden |
| 10 | Furniture |
| 10 | Building & Industrial, Home & Garden, Small Appliances, Furniture |
| 8 | Home & Garden, Sports & Outdoors, Mixed Lots, Building & Industrial, Furniture |
| 8 | Home & Garden, Office Supplies & Equipment |
| 8 | Home & Garden, Building & Industrial, Electronics, Small Appliances, Cell Phones, Office Supplies & Equipment |
| 7 | Home & Garden, Furniture, Building & Industrial |
| 7 | Mixed Lots, Building & Industrial, Small Appliances, Home & Garden, Furniture, Electronics |
| 6 | Home & Garden, Mixed Lots |
| 6 | Building & Industrial, Small Appliances, Home & Garden, Furniture, Major Appliances |
| 6 | Building & Industrial, Small Appliances, Home & Garden, Furniture, Mixed Lots, Electronics |
| 5 | Building & Industrial, Small Appliances, Furniture, Home & Garden, Electronics |
| 5 | Home & Garden, Building & Industrial, Electronics, Small Appliances |
| 5 | Building & Industrial, Home & Garden, Furniture, Small Appliances, Mixed Lots |
| 4 | Home & Garden, Furniture |
| 4 | Building & Industrial, Small Appliances, Home & Garden, Furniture, Electronics |
| 4 | Mixed Lots, Building & Industrial, Small Appliances, Furniture, Home & Garden |

**amazon**

| n | category |
|---:|---|
| 65 | Building & Industrial |
| 25 | Home & Garden, Furniture, Major Appliances |
| 25 | Health & Beauty |
| 16 | Health & Beauty, Pets, Groceries |
| 16 | Office Supplies & Equipment, Home & Garden |
| 14 | Toys Kids & Baby, Books Movies & Music |
| 13 | Toys Kids & Baby, Sports & Outdoors, Books Movies & Music |
| 12 | Furniture |
| 12 | Apparel Shoes & Accessories |
| 12 | Electronics |
| 11 | Home & Garden, Building & Industrial |
| 11 | Sports & Outdoors, Apparel Shoes & Accessories |
| 9 | Home & Garden, Furniture |
| 8 | Toys Kids & Baby |
| 8 | Building & Industrial, Home & Garden |
| 7 | Pets |
| 6 | Apparel Shoes & Accessories, Sports & Outdoors |
| 6 | Office Supplies & Equipment |
| 5 | Automotive Supplies |
| 5 | Sports & Outdoors, Toys Kids & Baby, Books Movies & Music |

**costco**

| n | category |
|---:|---|
| 45 | Furniture |
| 22 | Home & Garden |
| 19 | Electronics |
| 19 | Health & Beauty |
| 14 | Apparel Shoes & Accessories, Mixed Lots |
| 10 | Apparel Shoes & Accessories |
| 7 | Sports & Outdoors |
| 7 | Major Appliances, Small Appliances |
| 5 | Home & Garden, Furniture |
| 5 | Home & Garden, Sports & Outdoors |
| 5 | Home & Garden, Building & Industrial |
| 5 | Furniture, Home & Garden |
| 4 | Groceries, Health & Beauty, Toys Kids & Baby |
| 4 | Small Appliances |
| 3 | Major Appliances |
| 3 | Groceries |
| 3 | Home & Garden, Small Appliances |
| 3 | Office Supplies & Equipment |
| 3 | Jewelry & Watches |
| 3 | Furniture, Office Supplies & Equipment |

**wayfair**

| n | category |
|---:|---|
| 90 | Furniture |
| 48 | Home & Garden |
| 12 | Mixed Lots |
| 9 | Office Supplies & Equipment |
| 8 | Electronics |
| 5 | (blank) |
| 2 | Furniture, Home & Garden, Pets, Mixed Lots |
| 1 | Furniture, Home & Garden, Sports & Outdoors, Pets, Building & Industrial, Office Supplies & Equipment, Small Appliances, Mixed Lots |
| 1 | Furniture, Home & Garden, Building & Industrial, Pets, Sports & Outdoors, Mixed Lots, Office Supplies & Equipment |
| 1 | Home & Garden, Electronics, Furniture, Pets, Mixed Lots |
| 1 | Mixed Lots, Furniture, Home & Garden, Office Supplies & Equipment |
| 1 | Furniture, Home & Garden, Building & Industrial, Sports & Outdoors, Office Supplies & Equipment, Mixed Lots, Electronics |
| 1 | Home & Garden, Furniture, Building & Industrial, Mixed Lots, Pets, Small Appliances, Office Supplies & Equipment |
| 1 | Home & Garden, Furniture, Building & Industrial, Mixed Lots, Electronics, Small Appliances, Office Supplies & Equipment, Sports & Outdoors, Pets |
