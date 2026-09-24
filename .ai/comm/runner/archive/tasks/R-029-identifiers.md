> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-029 · Which product identifiers do we have? (UPC, ASIN, TCIN, SKU)

- **Type:** recon (code and dev DB, read-only) · **Time box:** 40 min
- **Why:** an exact identifier match is the cheapest way to dedupe and to match at intake. Find out what we store and how full it is.

## Do
1. **Code:** list every field that holds a product or line identifier:
   - on `Product`, `Item`, manifest rows, `VendorProductRef`, preprocessing and processing rows, and buying manifest lines;
   - also check the raw manifest JSON or CSV columns if they're stored.

   Cite each as `path:line`.
2. **Fill rate:** for each field, the share of rows that are non-blank, by era (V3 against V1/V2), and by vendor or marketplace where it applies. Check the values look valid: a UPC is 12 digits, an ASIN is B0 plus 8 characters, a TCIN is 8 digits.
3. **Duplicates:** how many products share the same valid UPC or ASIN? Do those groups look like the same product (10 examples)?
4. **Upstream:** do B-Stock manifest lines (`apps/buying`, manifest rows) carry UPC or ASIN columns that we drop at check-in? Name the column and how full it is.

## Hand back
A field table (field, path, fill % by era, valid %), the duplicate numbers and examples, and the answer to 4.
