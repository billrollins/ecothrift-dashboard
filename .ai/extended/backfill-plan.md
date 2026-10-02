<!-- Last updated: 2026-10-02 -->
# Backfill plan: what we clean, how, and who decided

The owner decides each rule; Claude builds it into the pipeline (never an ad hoc fix):
- **Rules:** a SQL file per field in `warehouse/sql/`.
- **Models:** in `factory/`. A model replaces a rule only if it beats it on the holdout.
- **Production data:** changes only through Requests the owner approves.

Every filled field carries `<field>_source` (real / rule / model) and is listed in `.ai/extended/data-quality.md`.

**Status words:**
- **decided:** the owner set the rule.
- **proposed:** waiting on the owner.
- **built:** in the pipeline.

## 1. Products: dedupe, then standardize, then categorize

| Step | Rule | Status |
|---|---|---|
| Dedupe | Every duplicate product is merged into one survivor, and items point to the survivor (`CatalogMerge`, reversible). | decided (owner); match rule **proposed** below |
| Standard text | Every product gets the same text fields (list **proposed** below). | decided (owner); fields **proposed** |
| Category | Every product has exactly one canon category and subcategory; this is a hard rule. Spark decides when the category is not canon, or when merged products disagree. | decided (owner) |
| Vetting | Work in batches of 10,000. After each batch, a random sample is reviewed before the next one runs. | decided (owner); sample size **proposed** below |

## 2. Cost

| Rule | Status |
|---|---|
| Truck cost is spread over the items that **sold**, weighted (the weighting is **proposed** below). Unsold items carry no cost. | decided (owner) |
| B-Stock refunds (disputes: items we didn't get) reduce the truck's cost. | decided (owner); the data source is open |
| Register lines with no item get assigned to orders where possible (see section 5). | decided (owner) |

## 3. Retail

| Rule | Status |
|---|---|
| Missing retail = tag x 2 to start. | decided (owner) |

## 4. Fate, end date, units received, shrink

**Fate** is one of: unfulfilled, disputed, shrink (lost, broken, stolen), taken by the owner or staff, online sale, or pink tag / generic. It can't be known per item.

| Rule | Status |
|---|---|
| Per truck: unexplained = units bought − sold (including assigned register lines) − still out − disputed. That is the truck's shrink estimate. No per-item guess. | **proposed** |
| End date: none. Old items can sit in the back, so floor time is measured only for items that sold. | **proposed** (from the owner's note) |
| Units received: not estimated. | decided (owner: very hard) |

## 5. Sale lines with no item (62,745 lines)

| Kind | Lines | Rule | Status |
|---|---|---|---|
| "Express: WAL129206" and similar (rung against an order) | 31,718 ($85k), 34 codes, 27 match a PO | Assign to that PO. | **proposed** |
| "Unknown Item" | 5,316 | Assign to orders selling that week, in proportion to their sales. | **proposed** |
| Cashier bins ($3 / $5), pink tag | ~3,000 | Keep as their own "bin / pink tag" group; don't assign to orders. | **proposed** |

## 6. PO received date

| Rule | Status |
|---|---|
| The first item check-in on the PO, else the first sale − 5 days. | decided (heuristic); **proposed** exact form |

## Owner answers, 2026-09-29

1. **Dedupe:**
   - UPC is rare and unreliable. Brand + title is a super-soft match.
   - Flow: standardize everything; find likely duplicates by similarity (vectors on the vector string, fuzzy brand + title); Spark makes the final call.
   - Runs regularly, and every merge is reversible.
2. **Specs:**
   - **Product specs** are details that change the price.
   - **Item specs** don't change the price; they stay on the item for accounting, and the item still maps to the one product. Example: color or small tech specs on a phone, where storage may be a product spec.
   - Which specs belong where is set by **hard rules per category/type**. Example: IF electronics THEN product specs include storage and model. The rules evolve through versions, so the same inputs give the same decision every day. No merging and exploding in circles.
   - Because specs are recorded on both item and product, any group can be reopened and re-split, reversibly.
3. **Product fields:**
   - Title (long form).
   - Tag name (short; the customer recognizes exactly what it is).
   - Vector string (focused keywords).
   - Brand, model number.
   - Canon category + subcategory.
   - Product specs.
   - **Aliases:** extra UPCs, model numbers and titles collected when products merge.
4. **Subcategories:** whatever list is used now. It must be well spread and understandable to a person; refine later.
5. **Vetting:** Claude vets a random 200 per 10,000 batch. Below 95% right, stop and fix the rules or prompt.
6. **Cost:**
   - Truck cost is spread over the sold items **by sale price**.
   - It's its own project: edge-case POs, items that never sold for unknown reasons, and items sitting on the shelf unsold (what to use for them is open).
7. **Refunds:** Claude checks the B-Stock context (the scraping and API notes) for claims and refund history.
8. **"Express" lines:** go to the matching PO.
9. **"Unknown Item" lines:** split across the orders selling that week, in proportion to their sales.
10. **Pink tag and cashier bins:**
    - Distribute to **pink-tag trucks** where one can be identified: typically Walmart, about 10,000 small items, checked-in count or retail far off the manifest, started January 2025 for a few months; the retags also had many left.
    - Otherwise handle as in 9.
11. **Shrink (definitions):**
    - **Unfulfilled** (never shipped): auto-refunded.
    - **Before processing:** disputable (claim a refund).
    - **After processing:** shrink (lost, broken, stolen, taken).
    - Truck shrink = paid for and didn't sell, split into those buckets where the data allows.
12. **Floor time:** measured only for items that sold. Unsold items get no end date.

## Built (2026-09-29)

- **Standard + spec rules:**
  - `apps/inventory/spec_rules.py` (spec-v1) and `.ai/extended/product-standard.md`.
  - Profile fields `vector_text` and `aliases` (`inventory/0101`).
  - Rulings TAX-47 to TAX-53.
- **Standardize:**
  - `standardize_products`, `vet_standardize` (Claude judges 200; 95% "nothing wrong" to pass), `--load` to proposals.
  - Trials on the top 100 by sold dollars went from 76% to 91%.
  - Batch std-001 (10,000) is running.
- **Dedupe:**
  - `dedupe_products --find / --vet / --merge`: vector neighbours in the same canon category and subcategory; spec
    conflicts are skipped by rule; Spark decides; `DedupeDecision` (`inventory/0102`) keeps every answer per rules
    version, so no pair is asked twice.
  - Merges are reversible and add aliases.
  - `--merge` refuses until a vet passed.
  - Vectors embed the vector text once it's set.
- **Register lines with no item:** `warehouse/sql/08_sale_assign.sql` → `sale_line_po`.
  - Express code → its PO: 20,289 lines, $48.9k.
  - Split by the week's PO sales: 11,810 lines, $41.8k.
  - Bins and pink tag, own group: 6,197 lines, $40.3k. Mostly Feb 2023 to Mar 2024, before any PO exists.
  - Before any PO: 24,449 lines, $581k.
  - No large Walmart trucks from Jan 2025 are in the data, so pink-tag trucks can't be identified from items.
- **Truck economics:** `warehouse/sql/09_po_economics.sql` → `po_economics` and `item_cost`.
  - Cost is spread over sold items by sale price. Refunds rung as manual lines never raise an item's share.
  - Revenue = items + assigned register lines.
  - Shrink buckets: disputed, never checked in, lost or scrapped, unknown fate (old imports), still out.
  - Flags: `cost_unknown`, `still_selling`.
- **B-Stock refunds (answer 7):** no known source. The B-Stock notes cover listings, manifests (the buyer's
  login) and shipping quotes only. Options:
  - the owner exports order and claim history from the B-Stock account;
  - or, with the owner's OK, Claude looks for the web app's order endpoints (kept narrow for ban risk).

## Results (2026-10-02, local database; production loads go through Requests)

- **Standardized:** 135,005 products under spec-v6 (Spark Contributor, high effort): title, tag name, brand, model,
  canon category and subcategory, product specs, vector text. Mixed lots: 0.4%.
- **Second-pass review:** Spark judged the 13,824 uncertain answers; Sonnet 5.5 (medium) rewrote the 3,497 it flagged.
- **Dedupe:** 74,181 candidate pairs decided. Merged locally (reversible): **32,370**. Products with items went from
  135,031 to 102,661.
  - Spark's "same" at similarity 0.97 or above: vetted 98%, merged.
  - Below 0.97: Sonnet made the final call, and those merged under the owner's rule (2026-10-02): **a wrong merge is
    cheaper than a leftover duplicate; when in doubt, merge.** The dedupe vet passes at 90%.
- **Model ladder (owner, 2026-10-01):** Spark Contributor writes; anything escalated above Spark goes to Sonnet 5.5 at
  medium. An audition (aud-001, aud-002) showed Spark high matches Opus on the core fields at about 1/60 of the cost.
- **Cost:** about $155 in model calls for everything, auditions included.
- **Exports:** `workspace/standardize/` (every answer), `workspace/dedupe/decisions.jsonl` and `merges.jsonl`.

## Next (owner, 2026-10-02)

1. **Intake produces good data from the start:** shipped in v2.120.0, switch `product_standard_at_intake` off
   ([`product-standard.md`](product-standard.md) § At intake).
2. **Load the backfill** to production through Requests the owner approves (below).
3. **Turn the intake switch on**, then **clean the middle:** products created after the 2026-09-24 pull and before
   the switch get the same standardize run, once.

Owner rule (2026-10-02): everything goes to production as soon as it is done and tested; nothing is held for the
Thrift+ launch.

## Production load (built 2026-10-02)

The pipeline's **final state** on the owner's PC is exported and loaded; nothing is re-run in production.

- **Export** (on the PC): `python manage.py export_standard_backfill --tag 2026-10-02` writes three files into
  `apps/inventory/data/backfill/` (14 MB together), which ship with the release:
  `standard-…` (135,005 products), `merges-…` (32,370), `decisions-…` (74,181).
- **Load** (production, in this order; each is a Request the owner approves in Dash > Superuser > Requests). Code:
  `apps/inventory/services/standard_load.py`, kinds in `approval_kinds.py`.

| # | Stage command (`heroku run python manage.py stage_request …`) | What it does | Undo |
|---|---|---|---|
| 1 | `inventory.load_standard --title "Load the product standard" --params '{"file": "standard-2026-10-02.jsonl.gz"}'` | Sets title, tag name, brand, model, category, subcategory, product specs, vector text and aliases on each product's profile. | yes: every field goes back to what it held |
| 2 | `inventory.merge_decided --title "Merge the duplicates" --params '{"file": "merges-2026-10-02.jsonl.gz", "decisions_file": "decisions-2026-10-02.jsonl.gz"}'` | Replays the merges in order; items, manifest links and open order rows move to the survivor. Loads the same / different answers. | yes: every merge is reversible |
| 3 | `inventory.embed_standard --title "Build product vectors"` | Builds the vector of each standardized, un-merged product from its vector text. Slow on purpose; best after closing. | none needed |

- **Guards:** product ids match because the copy came from production. A row is used only when the product still
  exists and its title is unchanged since 09-24; the rest are counted in the preview and left alone. A value a
  person set is never replaced. Every load resumes from its cursor and can run twice.
- **Merges also move open order rows now** (`PreprocessingRow.final_matched_product`, `ProcessingRow.matched_product`),
  so a check-in never lands on a merged-away product.
- **Still open, ITM-15:** the app's category numbers read `Product.category`, not the profile. Owner to choose:
  the app reads the profile category first (recommended, no data change), or the load also writes `Product.category`.
