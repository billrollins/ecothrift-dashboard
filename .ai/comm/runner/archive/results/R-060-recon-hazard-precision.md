# R-060 · Recon: how right are the manifest hazards, and which new ones are worth adding
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 16:29 · **Finished:** 2026-09-24 16:33 · **Status:** done

Dev database after R-055, read-only. Keyword samples use `random.Random(60)`. Rules are `HAZARDS` and `line_hazards` in `apps/buying/services/manifest_analysis.py:57` and `:122`. `high_value` is unit retail ≥ $300, `bulk_line` is quantity ≥ 24, `high_volume` is the same item totaling ≥ 24 on the truck, `stocked` is ≥ 5 on the shelf, `slow` is > 90 days with ≥ 3 sales (`manifest_analysis.py:86` and `:390`).

## 1. Precision

| Code | Rows flagged | Sample | Right | Wrong | Unsure |
|---|---:|---:|---:|---:|---:|
| part | 2 | 2 (all of them) | 0 | 2 | 0 |
| incomplete | 9 | 9 (all of them) | 0 | 9 | 0 |
| fragile | 1,046 | 25 | 18 | 7 | 0 |
| high_value | 2,025 | threshold | the rule held | | |
| zero_retail | 86 | threshold | the rule held | | |
| bulk_line | 2,589 | threshold | the rule held | | |
| high_volume | 1,628 | threshold | the rule held | | |
| slow | 0 | | | | |
| stocked | 142 | threshold | on-hand is not on the row | | |

Threshold spreads (the number the rule uses, except stocked and high_volume, where the line's own quantity is shown):

| Code | n | Median | p90 | Min | Max |
|---|---:|---:|---:|---:|---:|
| high_value, unit retail | 2,025 | $935 | $999 | $300 | $4,299 |
| zero_retail, unit retail | 86 | $0 | $0 | $0 | $0 |
| bulk_line, quantity | 2,589 | 51 | 98 | 24 | 1,872 |
| high_volume, this line's quantity | 1,628 | 4 | 15 | | |
| stocked, this line's quantity | 142 | 4 | 32 | | |

`part` (both wrong): `RV POWER OUTLET BOX 20/30/50AMP` and `KFFKFF 96-Piece … 3/8 Inch Drive` (the regex reads "Piece 3/8").

`incomplete` (all wrong): knee scooters "for Broken Ankle / Broken Foot", fan blades "Replacement for Broken", a dress with a "broken-in feel" (twice), puzzle titles "Broken Glass" and "Missing Friend", and "books missing from Western Bibles".

`fragile` wrong in the 25: three `Skibidi Toilet TV Woman` figures, `Funko POP! TV Stranger Things`, a Stanley stainless `Mug`, `ADAPTOR PLATE` (`plate`), and a door-frame kit whose glass is "Not Included". The other 18 are real glass, ceramic, mirror, crystal, stoneware, or lamps.

## 2. What made the wrong marks

- `part`: `box` plus `20/30`, and `piece` plus `3/8`. A slash between two measurements is not "1 of N".
- `incomplete`: `broken` in "broken ankle", "broken-in", and "for broken"; `missing` in a puzzle name and in book copy.
- `fragile`: `tv` in a character or a Funko "POP! TV" line, `mug` on steel, `plate` on a tool plate, `glass` when the title says the glass is not included.

No clear miss turned up in this sample. The seller hedge is already stripped: the Wondershop "may be missing pieces" lines are no longer `incomplete`.

## 3 and 4. Candidate hazards

| Pattern | Rows | Auctions | Median share of that auction's retail | Sample titles |
|---|---:|---:|---:|---|
| mattress_furniture | 167 | 32 | 1.6% | bolster "bed, couch, or favorite chair"; "from the sofa to brunch"; a hoodie "snuggly"; two real 6-drawer dressers |
| liquid (line qty ≥ 6) | 67 | 9 | 2.0% | 1.7 fl oz sunscreen, 0.33 fl oz cologne set, 20 fl oz body wash, 1.2 fl oz moisturizer |
| battery | 46 | 11 | 0.8% | Andis lithium clipper, Wahl lithium trimmer, Hyper Skute lithium scooter |
| aerosol_flammable | 13 | 8 | | Pantene aerosol spray, insect repellent, Lysol aerosol; the first hit is a Scrubbing Bubbles cleaner |
| recall_words | 0 | 0 | | |

## Observations

- Turn `incomplete` off, or require "parts only" / "not working" / "for parts". All 9 current hits are ordinary titles.
- `part` is 0 for 2. Require the word "of", not a slash, so amp ratings and fractions do not count.
- `fragile` is mostly right (18 of 25). Drop bare `tv`, `mug`, and `plate` unless glass or ceramic is also there.
- `high_value` does fire at ≥ $300, but the median is $935 and the 90th percentile is $999, the bad-retail pile from R-055. Fix those prices before trusting the hazard.
- Battery and aerosol are real but small (under 2% of an auction's retail). Furniture copy mentions a sofa more often than it is a sofa. None of the new patterns is worth a value discount yet. A recall word never appears.
