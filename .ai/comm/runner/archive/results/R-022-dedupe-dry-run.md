# R-022 result · Duplicate products: dry run

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 16:45 · **Finished:** 2026-09-23 17:02

Nothing was merged. Normalization: lowercase, turn every run of non-letters and non-digits into one space, trim.

## Totals

| | |
|---|---:|
| Products | 200,342 |
| Normalized-title groups of 2 or more | 53,861 |
| Products in those groups | 132,776 (66.3%) |
| Items linked to those products | 106,454 |
| Sold dollars on those items (`sold_for > 0`) | $851,479.12 |
| Groups whose brand or category is not all the same | 4,112 |
| Sample of 2,000 titles (seed 23) with at least one other product at trigram similarity ≥ 0.8 | 1,448 (72.4%) |
| Pairs kept (up to 3 others per sample title) | 2,651 |

## Same title, different brand or category

15 largest such groups. Query `2.2s`.

| Products | Normalized title | Brands | Categories |
|---:|---|---|---|
| 28 | arctic air tower electric portable cooling fan 4 speeds black 103 cfm | Arctic Air, As Seen on TV | Mixed lots |
| 25 | metal note paper roll dispenser black brass | Hearth & Hand with Magnolia, Hearth & Hand With Magnolia | Mixed lots |
| 19 | franklin sports grip rite 100 rubber junior football blue | Franklin Sports, Generic | Mixed lots |
| 19 | star wars darth vader action figure with role play mask ages 5 | Hasbro, Star Wars | Mixed lots |
| 18 | cuisinart immersion blender | Cuisinart | Kitchen & dining, Mixed lots |
| 18 | jurassic world battle roarin becklespinax action figure | Jurassic World, Mattel | Mixed lots |
| 18 | ridgid 2 0 pro gear handle | Ridgid, RIDGID | Mixed lots |
| 17 | brita water filter pitcher | Brita | Kitchen & dining, Mixed lots |
| 17 | men s watch | Bulova, Citizen, Frederique Constant, Raymond Weil, Timex | Mixed lots |
| 16 | bowl | Unbraded, Unbranded | Mixed lots |
| 16 | room essentials glass round printed folding outdoor portable side tabl | Generic, Room Essentials | Mixed lots |
| 15 | black and decker heater | Black and Decker, Black And Decker, NA | Mixed lots |
| 15 | hasbro don t break the ice game | Generic, Hasbro, Hasbro Gaming | Mixed lots |
| 15 | ridgid 2 0 pro gear handle 255230 | Ridgid, RIDGID | Mixed lots |
| 15 | speedo unisex child swim goggles sunny g ages 3 8 | Generic, Speedo | Mixed lots |

`men s watch` is five different watch brands under one normalized title. A merge on title alone would join them.

## 30 near pairs

Marked on the rows in `near_pairs_sample.csv`. **same** = one product, wording moved. **variant** = size, color, count, or a piece vs the set. **different** = not the same product.

| Sim | Judgment | A | B |
|---:|---|---|---|
| 1.000 | same | Never Needs Sharpening Knife Block Set - 22pc | 22pc Never Needs Sharpening Knife Block Set |
| 1.000 | same | Brightroom Natural 5 Compartment Flatware Drawer Organizer Brown | Natural 5 Compartment Flatware Drawer Organizer Brown - Brightroom |
| 1.000 | same | 20in x 58in Full Length Floor Mirror - Gold | Full Length Floor Mirror - 20in x 58in, Gold |
| 1.000 | same | Speedo Unisex Adult Swim Cap Silicone | Speedo Unisex-Adult Swim Cap Silicone |
| 0.958 | same | Just Play Disney Stitch … Figures Blind Box | … Figure Blind Box |
| 0.914 | same | up&up Enclosed Cat Litter Box Gray XL | Enclosed Cat Litter Box - Gray, XL |
| 0.889 | same | Duramectin Ivermectin Paste - 1.87%, Horse Wormer | DuraMectin Ivermectin Paste 1.87% Horse Wormer 1 Tube |
| 0.860 | same | Stanley 4pk 40oz Quencher Tumbler Straws Clear | Quencher Tumbler Straws - 4pk, 40oz, Clear |
| 0.852 | same | Ideas Disney Hocus Pocus … Cottage - 21341 | LEGO Ideas Disney Hocus Pocus The Sanderson Sisters' Cottage 21341 |
| 0.814 | same | adidas Unisex-Child Performance Youth Sock Shin Guards, Black/White, Small | Adidas Youth Performance Sock Shin Guards Black/White Small |
| 0.810 | same | Xianers Freestanding Closet Organizer | Xianers Freestanding Closet Orgainzer |
| 0.800 | same | Gourmia Digital French Door Air Fryer | Gourmia French Door Air Fryer |
| 0.913 | variant | Threshold … Curtain Panel 50"x84" Ivory | Threshold 50"x63" … Curtain Panel Ivory |
| 0.889 | variant | Tovolo Ice Spheres Mold Set | Tovolo Ice Spheres Mold |
| 0.875 | variant | Geo Striped Bath Rug - Black/White | Striped Bath Rug - White/Black |
| 0.861 | variant | Washable Male Dog Belly Band - XL, 3pk | Washable Male Dog Belly Band - L, 3pk |
| 0.857 | variant | QuietComfort … Headphones - Blue Dusk | QuietComfort … Headphones - Black |
| 0.857 | variant | Cuisinart 4-Slice Toaster | Cuisinart 2-Slice Toaster |
| 0.852 | variant | 6-in-1 USB C Hub Adapter | 7-in-1 USB C Hub Adapter |
| 0.843 | variant | Fitvids … 4-Pound, Pair | Fitvids … 9-Pound Pair |
| 0.836 | variant | 72"x14" Cotton Macrame Runner … | Threshold 108"x14" Cotton Macrame Runner … |
| 0.833 | variant | Great Value … Paper Plates 8.5 200 Count | Great Value … Paper Plates 8.5 Inch 300 Count |
| 0.833 | variant | Advanced Clumping Cat Litter With Febreze - 37lb | Advanced Multi-Cat Clumping Litter - With Febreze, 37lbs |
| 0.833 | variant | Voyager Step-in Air Dog Harness - Medium, Fuchsia | Voyager Step-in Air Dog Harness - Fuchsia, S |
| 0.826 | variant | 9-in-1 Electric Milk Steamer and Frother - 17oz | 17oz 4-in-1 Electric Milk Frother & Steamer |
| 0.824 | variant | Ello Ava 18oz Tumbler Cream | Ello Ava 18oz Straw Tumbler Cream |
| 0.816 | variant | Queen Performance Sheet Set - Dark Gray, 400tc | Performance Fitted Sheet - Queen, 400tc, Dark Gray |
| 0.810 | variant | Plastic Drawer Flatware Organizer - 6 Compartment, Black | 6-Compartment … Organizer - Clear |
| 0.806 | variant | Stanley 30oz … Quencher Tumbler Frost | … Quencher Tumbler - 30oz, Mist |
| 0.829 | different | GE RPWFE Refrigerator Water Filter | GE XWFE Refrigerator Water Filter |

Of these 30, 12 are the same product, 17 are a size, color, count, or set-vs-piece variant, and 1 is a different model (the two GE filters). At 0.8 the operator is mostly finding rewrites and variants, not unrelated goods. The bad exact-title merges are the vague ones (`men s watch`, `bowl`), which trigram also treats as the same string.

## How long, and whether trigram can run on everything

| Query | Time |
|---|---:|
| Group totals (products, items, sold dollars) | 1.9s |
| 15 mixed brand/category examples | 2.2s |
| Top 200 groups by item count | 1.3s |
| One `title %` lookup, `set_limit(0.8)`, no title index | 0.55s (seq scan) |
| 2,000 lookups, 4 sessions at once | 830s |

There is no trigram index on `inventory_product.title` (GIN indexes exist only on `identifiers` and `tags`). `pg_trgm` is installed. One lookup reads the whole table. At 0.55s each, all 200,342 titles on one session is about 30 hours. Four sessions did 2,000 titles in 14 minutes, which scales to about 8 hours for the catalog, and that only asks for up to 3 matches each. Exact normalized titles are cheap. A full near-duplicate pass needs a `gin_trgm_ops` index on the title, or vectors. This run did not create an index.

CSVs: `workspace/runner/R-022/exact_groups_top200.csv`, `workspace/runner/R-022/near_pairs_sample.csv`.
