# R-052 · Recon: buying manifests: fill, product match rates, hazard keywords
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 15:37 · **Finished:** 2026-09-24 15:46 · **Status:** done

Dev database, read-only. Sample for match rates: 3,000 of 30,393 `ManifestRow` ids, `random.Random(52)`. Near match is `similarity(title, product.title)` with `pg_trgm.similarity_threshold = 0.3` and the `inv_product_title_trgm` index. UPC compare is digits-only, length 11+, including a leading-zero pad to 12 and to 13, against `Product.identifiers['upc']` only. Exact title is lower-cased with whitespace collapsed. When several products share a title or UPC, the lowest product id is kept.

## 1. Fill

98 auctions have manifest rows. 30,393 rows.

| Field | Rows | Share |
|---|---:|---:|
| UPC, 11+ digits | 25,816 | 84.9% |
| Title | 30,393 | 100% |
| Brand | 23,265 | 76.5% |
| Quantity present | 30,393 | 100% |
| `retail_value` > 0 | 30,307 | 99.7% |
| `retail_value` 0 or null | 86 | 0.3% |
| of which zero | 75 | |
| of which null | 11 | |
| Condition | 28,881 | 95.0% |

| Marketplace | Auctions | Rows |
|---|---:|---:|
| target | 28 | 18,699 |
| walmart | 18 | 4,128 |
| homedepot | 14 | 3,356 |
| amazon | 5 | 2,268 |
| costco | 32 | 1,867 |
| wayfair | 1 | 75 |

## 2. Match rates (3,000 rows)

| Method | Rows | Share |
|---|---:|---:|
| UPC | 138 | 4.6% |
| Exact title | 89 | 3.0% |
| Near, best ≥ 0.5 | 951 | 31.7% |
| Near, best ≥ 0.6 | 639 | 21.3% |
| Near, best ≥ 0.7 | 394 | 13.1% |
| Near, best ≥ 0.8 | 290 | 9.7% |
| Any: UPC, exact, or near ≥ 0.5 | 1,005 | 33.5% |

UPC and exact together, before near, are 213 rows (7.1%). Of those, 14 are both. The other 792 of the 1,005 are near-only at ≥ 0.5.

Pairs at 0.55–0.65 (row title | product title | score):

| Score | Row | Product |
|---:|---|---|
| 0.575 | Beautiful 14-Cup Programmable Drip Coffee Maker … White Icing by Drew Ba | Beautiful 1.5Qt Ice Cream Maker with Touch Activated Display White Icing by Drew Barrymore |
| 0.621 | KEE SEAFOAM GEN 2 | KEE Seafoam Gen 2 5000389184 |
| 0.581 | Conair Turbo ExtremeSteam Handheld Garment Steamer: 1875W, 20 Min Steam… | Conair Turbo ExtremeSteam Handheld Garment Steamer 1875W |
| 0.616 | 13'' 2 Cube Organizer White - Brightroom: MDF Cubby… | Brightroom 13" 2 Cube Organizer White MDF Cubby Storage Bookshelf |
| 0.629 | 32qt Clear Storage Bin with Latches - Brightroom | 60qt Latching Clear Storage Box with Gray Latches - Brightroom |
| 0.582 | 27qt Deep Storage Bin Clear with Latches - Brightroom | 60qt Latching Clear Storage Box with Gray Latches - Brightroom |
| 0.577 | Secret Clinical 100HR Antiperspirant … Stress Response - 1.6oz | Secret Clinical Strength Antiperspirant Deodorant Women Stress Response 72hr Protection 1.6oz 3-Pack |
| 0.609 | Secret Outlast Clear Gel … Completely Clean - 2.6oz | Secret Outlast Antiperspirant Deodorant 72hr Protection Completely Clean 2.6 oz |
| 0.564 | Portable Diaper Caddy Organizer - up&up | Baby Diaper Caddy Organizer |
| 0.592 | Posture Corrector Back Brace Stretcher - All In Motion… | All In Motion Posture Corrector Back Brace |

The first 10 pairs at 0.65–0.75 were the same line repeated: score 0.699, row `Chew Mees by Squishmallows Cowgirl and Football Player Dog Plush Toy: Cuddle, 3.5 Inches Tall, 0.86 Pounds` | product `Chew Mees by Squishmallows Cowgirl and Football Player Dog Plush Toy`.

## 3. Sales behind a match

A row is matched if any method hit (near only if best ≥ 0.5). Each matched row contributes its product's sold items into the row's `canonical_category`. 1,005 matched rows.

| | Rows | Share of matched |
|---|---:|---:|
| Product has ≥ 1 item with `sold_at` set | 742 | 73.8% |
| Product has ≥ 3 such items | 111 | 11.0% |

Median of `sold_for / retail` on sold items with `retail > 0`:

| Row `canonical_category` | Matched rows | Median ratio |
|---|---:|---:|
| (blank) | 975 | 0.499 |
| Pet supplies | 30 | 0.726 |

## 4. Hazard keywords

Patterns run on title + condition + notes, case-insensitive. Word boundaries are Postgres `\m` / `\M` (POSIX `\b` is backspace). High value uses stored `retail_value` as the unit price (question 5).

| Pattern | Rows | Auctions | Sample titles |
|---|---:|---:|---|
| part (`N of M` / `N/M`) | 2 | 2 | `RV POWER OUTLET BOX 20/30/50AMP 125/`; `KFFKFF 96-Piece 3/8 Inch Drive Impact Socket Set…` |
| incomplete | 4,827 | 54 | First five by id are all the Wondershop line `…(Please be advised that sets may be missing pieces or otherwise incomplete.)` |
| fragile | 981 | 63 | PowerStop brake kit (no glass word in the visible title); ceiling light "Water Ripple Glass"; Dolly Parton dinnerware "each dish"; "Rose Tumbler … glass tumblers" |
| unit retail ≥ $300 | 2,025 | 61 | |
| unit retail ≥ $500 | 1,637 | 47 | |
| unit retail ≥ $1,000 | 117 | 22 | |
| quantity ≥ 12 | 3,130 | 54 | |
| quantity ≥ 24 | 2,589 | 42 | |
| quantity ≥ 50 | 1,437 | 28 | |

Dividing `retail_value` by quantity, which question 5 says not to do, would cut the high-value counts to 617 / 275 / 102.

## 5. Unit vs line retail

`ManifestRow.retail_value` is the **unit** price, not the line total.

The CSV templates map `retail_value` to the unit column and `extended_retail` to the line column. On rows with quantity greater than 1, stored value equals Unit Retail and Ext. Retail equals unit times quantity:

- Target template 2, auction 570: qty 4, stored 197.50, Unit Retail 197.50, Ext. Retail 790.00. Same on auction 10076.
- Walmart template 3, auction 616: qty 5, stored 65.00, Unit Retail 65.00, Ext. Retail 325.00.
- Home Depot templates 5 and 7, auctions 56162, 180212, 199517: same pattern (qty 100, stored 17.78, Ext. Retail 1778.00).
- Amazon template 4, auctions 9942 and 9951: stored equals Unit Retail. The rows checked were quantity 1, so Ext. Retail was equal too. The column map is the same unit column as the others.

Costco and Wayfair rows have no template. They are API payloads. Wayfair auction 469592 and Costco auction 476952 store `attributes.unitRetail` in cents. Costco qty 3: stored 849.99, `unitRetail` 84999, `extRetail` 254997 (unit times 3, in cents). Stored equals the unit, after the cents conversion.

Code that fills it:

- CSV upload writes `retail_value=std['retail_value']` at `apps/buying/services/manifest_upload.py:158`.
- The template standardizer treats the field as per-unit MSRP and divides an extended column by quantity only when no unit column is mapped: `apps/buying/services/manifest_template.py:228`.
- The fallback normalizer does the same, preferring `unitRetail` / `Unit Retail`: `apps/buying/services/normalize.py:426`.
- API pulls call `normalize_manifest_row(..., whole_numbers_are_cents=True)` and store that retail: `apps/buying/services/manifest_pull.py:266` and `:280`.
- Cents heuristic (whole numbers ≥ 1000 divided by 100; strings that already contain a decimal stay dollars): `apps/buying/services/normalize.py:146` and `:184`.
- Valuation then multiplies quantity by `retail_value` to get the line: `apps/buying/services/valuation.py:99`.

## Observations

- Auto-match near titles at 0.7, not 0.6. At 0.55–0.65 the best hit is often a different size or a different product in the same brand line (32qt bin vs 60qt bin, coffee maker vs ice cream maker).
- UPC plus exact title cover 7% of lines. A threshold that requires one of those two will miss most of the manifest.
- Do not flag `missing` by itself. Thousands of Target rows carry the same "sets may be missing pieces" disclaimer.
- High value and truck retail should use `retail_value` as the unit price. Dividing by quantity understates it.
- Per-category sold ratios are not usable yet: 975 of 1,005 matched sample rows have a blank `canonical_category`.
