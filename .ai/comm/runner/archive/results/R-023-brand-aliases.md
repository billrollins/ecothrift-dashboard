# R-023 result · Brand spellings and junk brands

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:02 · **Finished:** 2026-09-23 17:12

200,342 products, 22,338 distinct `Product.brand` values. No brand is blank (the column is required). `Generic` is 8,552 products. The brand equals the whole title, ignoring case, on 47 products.

## Top of the brand list

Full top 300: `workspace/runner/R-023/brands_top.csv`. The head:

| Brand | Products |
|---|---:|
| Threshold | 11,429 |
| Generic | 8,552 |
| Room Essentials | 3,626 |
| Brightroom | 2,428 |
| Hearth & Hand with Magnolia | 1,809 |
| Hearth & Hand With Magnolia | 1,750 |
| Mainstays | 1,647 |
| LEGO | 1,555 |
| Unbranded | 1,555 |
| Husky | 1,538 |

## Spelling clusters

A cluster is spellings that match once case, spaces, punctuation and `&` / `and` are ignored, plus pairs whose normalized forms have trigram similarity ≥ 0.85 and share the first 4 letters. Trigram added 6 links. 1,554 clusters have two or more spellings. `Unbraded` (548) does not join `Unbranded` (1,555): similarity 0.58. A leading word such as "The" can also hide a pair, because those normalized forms do not share a 4-letter prefix.

Top 30 by products in the cluster. Full list: `workspace/runner/R-023/brand_clusters.csv`.

| Products | Spellings |
|---:|---|
| 11,431 | Threshold (11,429), THRESHOLD (2) |
| 3,568 | Hearth & Hand with Magnolia (1,809), Hearth & Hand With Magnolia (1,750), Hearth&Hand with Magnolia (5), Hearth & Hand™ with Magnolia (4) |
| 2,330 | LEGO (1,555), Lego (773), lego (2) |
| 1,553 | Husky (1,538), HUSKY (13), husky (2) |
| 1,442 | Pillowfort (1,435), Pillow Fort (4), PillowFort (3) |
| 1,431 | up&up (823), Up&Up (567), Up & Up (35), Up And up (2), Up&UP (2), UP&UP (2) |
| 1,245 | Bullseye's Playground (924), Bullseye'S Playground (321) |
| 1,127 | Threshold Designed W/Studio Mcgee (627) and three more case variants (500) |
| 1,125 | Kwikset (1,123), KwikSet (2) |
| 1,037 | Stanley (944), STANLEY (93) |
| 1,005 | Melissa & Doug (1,003), Melissa and Doug (2) |
| 889 | Better Homes & Gardens (822) plus "and" / singular Garden variants (67) |
| 873 | Disney (869), DISney (2), DISNEY (2) |
| 803 | OXO (502), Oxo (301) |
| 776 | Amazon Basics (773), amazon Basics (3) |
| 766 | NA (481), N/A (277), na (6), N/a (2) |
| 691 | Heyday (688), HEYDAY (2), HeyDay (1) |
| 612 | DEWALT (264), Dewalt (212), DeWalt (133), DeWALT (3) |
| 603 | Spritz (601), Spritz™ (2) |
| 589 | Boots & Barkley (587), Boots & Barkley™ (2) |
| 589 | Ello (583), ello (6) |
| 587 | Ryobi (308), RYOBI (279) |
| 577 | Sun Squad (570), Sunsquad (3), sun Squad (2), SunSquad (2) |
| 576 | Crayola (574), crayola (2) |
| 567 | RIDGID (316), Ridgid (251) |
| 564 | Hyde & Eek! Boutique (402), Hyde And Eek! Boutique (145), Hyde and EEK! Boutique (17) |
| 512 | Star Wars (439), STAR WARS (70), Starwars (3) |
| 473 | VTech (340), Vtech (133) |
| 471 | Fisher-Price (421), Fisherprice (41), Fisher Price (9) |
| 437 | All In Motion (423), All in Motion (11), All i n Motion (3) |

Also in the file, not in the top 30: Hyper Tough / Hypertough / HyperTough (245) and KitchenAid / Kitchenaid (118).

## Brand in the title, field is Generic

840 of 8,552 `Generic` products have a title that starts with one of the top 300 brands (288 names after dropping Generic, Unbranded, Unbraded, Unknown, NA, and names under 3 letters). 102 distinct brands show up that way. Blank brands: 0.

| Brand on the title | Product | Title |
|---|---:|---|
| Pen+Gear | 176259 | Pen+Gear 1-Subject Spiral Notebooks - Set of 4 |
| Philips | 179474 | Philips LED 60W A19 4-Pack Ultra Definition Soft White … |
| Pokemon | 110428 | Pokemon Scarlet & Violet Trading Cards - 6 Pack Bundle |
| Play-Doh | 175839 | Play-Doh Slime: Super Stretch … |
| Rawlings | 175795 | Rawlings \| MACH Adjust Extension Piece … |
| RIDGID | 14262 | Ridgid Hi-Efficiency Filter For 5G Vacs |
| Room Essentials | 258337 | Room Essentials Glass Round Printed Folding Outdoor Portable Side Table … |
| Rubbermaid | 258136 | Rubbermaid Commercial Brute Rollout Container - 50 Gallon |
| Schlage | 16422 | Schlage Latitude Combo Pack - Single Cylinder |
| Schleich | 176115 | Schleich bayala - Stormy Unicorn Toy Foal … |
| Schwinn | 176139 | Schwinn Center Mounted Kickstand, Silver … |
| Sharpie | 43135 | Sharpie Fine Point Markers - Assorted |
| Shock Doctor | 175966 | Shock Doctor Mouth Guard Case … |
| Speedo | 175882 | Speedo Unisex-Child Swim Goggles Sunny G Ages 3-8 |
| Squishmallows | 175969 | Squishmallows Original Disney 10in Pluto HugMees … |
| Star Wars | 55623 | Star Wars Black Series Baylan Skoll Figure - 6in |
| Stanley | 176264 | Stanley Quencher Tumbler Straws for 14 or 20 oz … |
| Sterilite | 258495 | Sterilite Large File Crate |
| Sunny Days Entertainment | 176439 | Sunny Days Entertainment Sidewalk Chalk Set … |
| Swiffer | 22648 | Swiffer Wet Cloth Wipes - 12 Count |

## Junk

**Rule:** the brand is only capital letters, 5 or more, on fewer than 20 products, and it has no vowel or four consonants in a row.

That flags 274 brands and 557 products. Top 100 and the rest: `workspace/runner/R-023/junk_candidates.csv`. The head is SCHLAGE 17, CURLSMITH 13, KEYSTP 10, TANSTRIDER 9, BJPKPK 8, CRAFTSMAN 8, then a run of seller codes (BESTSWEETIE, FDLLUS, HTSQYL, AYKLCZUU).

In the **top 300** the rule catches **0** real brands. The only top-300 name that fails the letter test is `KFFKFF` (97 products), and the under-20 gate leaves it out. Below the top 300 the same rule does flag real brands that are stored in all caps and are rare here: Schlage, Curlsmith, Craftsman, Workpro, Owltra, Blackstone, HTVRONT, Marchway.
