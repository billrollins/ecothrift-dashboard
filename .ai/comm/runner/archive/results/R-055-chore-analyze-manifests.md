# R-055 · Chore: analyze every dev manifest (Buying Phase 4 backfill) and report
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 15:56 · **Finished:** 2026-09-24 16:14 · **Status:** done

## Step 1

`analyze_manifests --all --force`: **analyzed 98, unchanged 0, failed 0 in 1206s**. No `auction N:` error lines. The log has no per-auction timings, so the slowest-three list is skipped.

## Step 1b

`recompute_buying_valuations`: **Recomputed 17291 auctions.** About 150 seconds.

## Step 1c

`build_wishlist()`: `live_total` 111, `eligible` 34.

| priority | marketplace | top_category | current_price | max_bid | room | state | hazard_count |
|---:|---|---|---:|---:|---:|---|---:|
| 88 | Target | Household & cleaning | 4100.00 | 4753.77 | 653.77 | in_range | 0 |
| 86 | Walmart | Household & cleaning | 3450.00 | 3505.55 | 55.55 | in_range | 0 |
| 86 | Target | Toys & games | 346.00 | 37552.93 | 37206.93 | in_range | 0 |
| 83 | Home Depot | Tools & hardware | 100.00 | 2094.17 | 1994.17 | in_range | 1 |
| 82 | Target | Bedding & bath | 8600.00 | 13783.42 | 5183.42 | in_range | 0 |

## Step 2

98 auctions have `manifest_analysis`.

| Field | n | p10 | Median | p90 |
|---|---:|---:|---:|---:|
| matched_retail_pct | 98 | 0.0 | 7.75 | 42.47 |
| product_basis_retail_pct | 98 | 0.0 | 0.0 | 6.98 |
| revenue / revenue_by_category | 94 | 0.99 | 1.00 | 1.01 |

Match methods summed over auctions: upc 1,340, title 827, near 2,129.

Lowest revenue ratio (id, lines, revenue, revenue_by_category):

| id | lines | revenue | by category | ratio |
|---:|---:|---:|---:|---:|
| 64489 | 59 | 3043.71 | 3298.83 | 0.923 |
| 9951 | 936 | 48553.93 | 49982.21 | 0.971 |
| 9942 | 229 | 11774.28 | 12099.51 | 0.973 |
| 56177 | 29 | 18234.59 | 18663.62 | 0.977 |
| 94663 | 1468 | 27396.52 | 27906.55 | 0.982 |

Highest:

| id | lines | revenue | by category | ratio |
|---:|---:|---:|---:|---:|
| 476953 | 90 | 33037.54 | 31980.47 | 1.033 |
| 10099 | 988 | 30205.39 | 28854.04 | 1.047 |
| 477454 | 22 | 2717.63 | 2517.70 | 1.079 |
| 477197 | 14 | 2573.29 | 2158.02 | 1.192 |
| 477160 | 17 | 1322.14 | 491.58 | 2.690 |

| Hazard | Auctions | Lines | Median retail_pct |
|---|---:|---:|---:|
| bulk_line | 42 | 2,589 | 16.3 |
| fragile | 63 | 1,046 | 2.9 |
| high_value | 61 | 2,025 | 28.6 |
| high_volume | 26 | 1,628 | 7.1 |
| incomplete | 4 | 9 | 0.15 |
| part | 2 | 2 | 0.45 |
| stocked | 19 | 142 | 1.6 |
| zero_retail | 15 | 86 | 0.0 |

## Step 3

Seed 55. **Near: 0 wrong** (16 same product, 4 same kind). **UPC: 0 wrong** (9 same product, 1 same kind).

Near:

| Score | Row | Product | Mark |
|---:|---|---|---|
| 1.000 | Segway C2 Pro Electric Scooter - Blue | Segway C2 Pro Electric Scooter Blue | same product |
| 0.889 | Comfort Dog Collar - L - Dark Green - Boots & Barkley | Comfort Dog Collar Large Dark Green Boots & Barkley | same product |
| 0.894 | No Pull Comfort Dog Harness - S - Boots & Barkley | No Pull Comfort Dog Harness Small Boots & Barkley | same product |
| 0.763 | Goo Jit Zu DC Stretchy Hero Pack - Mr. Terrific Action Figure | Goo Jit Zu DC Stretchy Hero Pack Mr. Terrific | same product |
| 1.000 | LeapFrog Leapstart Learning Success Bundle - Green | LeapFrog Leapstart Learning Success Bundle Green | same product |
| 0.912 | 14" Blonde Hair/Blue Eyes Toddler Doll + Mini Baby Doll - Gigglescape | 14" Toddler Baby Doll Blonde Hair Blue Eyes Gigglescape | same kind |
| 0.840 | MAK 40V XGT 4.0AH BATTERY | 40V XGT Battery - 4.0Ah | same product |
| 0.914 | Portable Power 2000 Peak Amp Jump Starter w/Digital Compressor (DEWALT) | Portable Jump Starter - 2000 Peak Amp, Digital Compressor | same product |
| 0.840 | MINNIE SHOPPING CART | Minnie Shopping Cart Toy | same product |
| 0.818 | Men's Slim Fit Jeans - Goodfellow & Co Dark Blue Wash 40x32 | Goodfellow & Co Dark Blue Slim Fit Jeans 40x32 | same product |
| 0.929 | Care Bears x Wicked Fun Size Plush - Funshine Bear as the Scarecrow | Care Bears x Wicked Fun Size Plush Funshine Bear as Scarecrow | same product |
| 0.716 | Squishmallows 12" Frumpy Girly Goth Black Bigfoot with Heart Headband Plush | Squishmallows 12 Inch Frumpy Girly Goth Black Bigfoot Plush | same kind |
| 0.745 | The Simpsons 5'' Grandpa Simpson with Cane Action Figure | The Simpsons Grandpa Simpson Action Figure | same product |
| 0.719 | AquaCare Luxury Handheld Shower | Luxury Handheld Shower | same kind |
| 0.951 | Roller Derby Custom Adult In-Fit Skates - Blue/Black 9-12 | Roller Derby Custom Adult In-Fit Skates Blue/Black Size 9-12 | same product |
| 1.000 | Owala 30oz FreeSip SWAY Stainless Steel Water Bottle - Periwinkle Twinkle | Owala FreeSip SWAY 30oz Stainless Steel Water Bottle Periwinkle Twinkle | same product |
| 0.890 | Roller Derby Custom Adult In-Fit Skates - Blue/Black 7-10 | Roller Derby Custom Adult In-Fit Skates Blue/Black Size 7-10 | same product |
| 1.000 | Owala 20oz Stainless Steel SmoothSip Travel Mug - Golden Quest | Owala 20oz Golden Quest Stainless Steel SmoothSip Travel Mug | same product |
| 0.761 | 13'' 4 Cube Vertical Organizer White - Brightroom | 13" 4 Cube Vertical Organizer White | same product |
| 0.732 | Greenmade 12gal Instacrate Collapsible Storage Container | Greenmade Instacrate Collapsible Storage Crate | same kind |

UPC (all scores 1.000):

| Row | Product | Mark |
|---|---|---|
| SCRUBDADDY GRILL CLEANING | Scrub Daddy Grill Cleaning Tool | same product |
| Ultimate Reflective and Adjustable Dog Harness - Black - S - Boots & Barkley | Ultimate Reflective Dog Harness - S, Black | same product |
| Disney Princess Moana Walk and Snort Pua Feature Plush | Moana Walk & Snort Pua Stuffed Animal | same product |
| BIC 5PK GEL PEN | Bic Gel-ocity Retractable Gel Pens 5-Pack | same product |
| AW NEEDLES 5 PACK | Athletic Works Ball Pump Needles 5-Pack | same product |
| 60.5"x18" Cut Off Base Floor Lamp Black/Brown Metal/Wood - Threshold | Threshold Metal and Wood Floor Lamp | same product |
| Dog Diapers - 18ct - S - up&up | Dog Diapers - 18ct, Small | same product |
| Fashion Solid Dog Collar - M - Dusty Robin - Boots & Barkley | Solid Dog Collar - M, Dusty Robin | same product |
| U Brands 17 x 23 in. Cork Bulletin Board, Natural Maple Wood-Style Frame | Cork Bulletin Board - 17x23in, Brown Birch | same kind |
| Cuisinart 2qt Stainless Steel Stovetop Kettle Matte Black CKS-25MBK | Cuisinart 2qt Matte Black Stovetop Whistling Kettle | same product |
