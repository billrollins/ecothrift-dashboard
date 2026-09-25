<!-- initiative: slug=product-intelligence status=active updated=2026-09-23 -->
<!-- Last updated: 2026-09-25 (handover to buying_intelligence_v2) -->

# Initiative: Product intelligence

**Status:** **Active** — Phase 1 done 2026-09-23. Phase 2 (structure) is next, and its design waits on the owner. Phase 3 has started early: the gold set and first audition are done.

**Objective:** Every item, product, manifest line and auction line answers one question: "what is this, and how does that kind of thing do for us?" Each product exists once and carries a category, a subcategory, a vector (a numeric fingerprint for "similar to"), and its sales history. Buying can then value a truck line by line, pricing can find what sells within 90 days, and every surface (price tag, online listing, processing page, reports) reads one clean product profile.

**Compass:** this file is not the compass; [`bstock_daily_buying`](./bstock_daily_buying.md) stays the compass (its Phase 4 reads this). Data rules: [`.ai/extended/data-quality.md`](../extended/data-quality.md), decision 8.

---

## Finish line

- **One catalog:** the product catalog is deduped, and every product has a profile: short name, category, subcategory, identifiers and flags. Each field records its source and confidence.
- **Sales history placed:** "Mixed lots" is under 10% of sales history, down from 87.6%.
- **Buying:** a new manifest line matches a known product, or lands next to similar products, before any AI runs. The buyer sees how similar products sold.
- **Processing:** processors verify a pre-filled profile instead of typing it.
- **Price tags** use the short name.

---

## Out of scope

- Model training infrastructure beyond local vectors and prompt-based models
- Online Sales listing redesign (it only reads the profile)
- Replacing preprocessing templates (the new steps sit on top of them)

---

## Decisions (owner, 2026-09-23)

- **Product first:** enrich products, not items. Items inherit, and keep only what is per unit: condition, price, location, damage.
- **Dedupe first,** then enrich: 66% of 200k products are in duplicate-title groups (PRD-01).
- **Audition, then backfill:**
  1. A gold sample of 100–1,000 answered by the top model and spot-checked by the owner.
  2. Audition the cheap models on accuracy, cost per 1,000 and speed. Spark (Meta `muse-spark-1.3-contributor`, `https://api.meta.ai/v1`, `META_API_KEY`, OpenAI-compatible, very cheap) is the favourite for long runs; Haiku, Flash-Lite, Grok, rules and local vectors also compete.
  3. A long, resumable, logged run that writes proposals with provenance.
- **Cheapest first:**
  1. Free copies through existing links: the product has a category, a same-title sibling does, the manifest line has one (ITM-11: 6,052 items).
     Sized by R-028: V3 Mixed has $74k of $130k covered, mostly by the processing category. V1/V2 Mixed has only $37k of $1.46M covered. The old catalog needs AI.
  2. Rules and brand aliases, without AI.
  3. Local vectors (sent2vec, fastText or MiniLM on our own machine).
  4. Rules plus an AI check.
  5. Similarity plus AI deciding.
  6. A human review queue, sorted by dollars.
- **Surfaces define the profile.** Work back from every place an item shows: the price tag (a short name of about 24–32 characters), online listing, processing page, order totals, buying, and reports. That gives about a dozen fields:
  - short name, display title, brand, model, identifiers;
  - category, subcategory, key specs;
  - flags: high value, fragile, multi-part, test required, $0 or soft-deleted;
  - a retail sanity check, a description, and search keywords.
- **Reviews:** a data-quality review at the end of each truck, and weekly (duplicates, bad names, bad categories). It is built in [`data_quality_rails`](./data_quality_rails.md) Phase 3.

---

## Phases

### Phase 1 — Decide the shape
Settle the category list (add Appliances and Lawn & garden at least), the subcategories, the product profile fields and the price-tag short-name rules. Add Spark as a provider in the AI router and Settings > AI.
**Gated by:** none.

Acceptance:
- [x] Category list approved (2026-09-23): 23 categories = the 19 + Lawn & garden, Appliances (floor care, heating/cooling, laundry, major; small kitchen appliances stay in Kitchen), Arts & crafts, Automotive. Gaming is Electronics (a subcategory later); Groceries go to Kitchen; Jewelry stays in Apparel. The web shop keeps the 19. B-Stock codes mapped (`BSTOCK_CODE_TO_CANONICAL`). Subcategories: drafted in [`extended/product-taxonomy.md`](../extended/product-taxonomy.md), the answer key (rulings TAX-NN).
- [x] Short-name rules and placement rulings: in `extended/product-taxonomy.md` (2026-09-23; from a 548-title sold sample, then refined on the 300-product gold set: TAX-16 to TAX-37). Profile fields: see **Product profile** below.
- [x] Spark callable through `llm_router` (`meta` provider, `muse-*`) and selectable in Settings > AI (migration `core/0007`, 2026-09-23; tests in R-026).
- [x] Runner recon on the data this phase needs:
  - every B-Stock category code we've seen, and where it maps today;
  - title and brand patterns in the "Mixed" items;
  - whether Heroku Postgres can take pgvector.

  Done by R-016 to R-018: codes mapped; cheap rules place 15.6% of Mixed (V3 native 70%, V1/V2 about 11%), so the old eras need AI; pgvector 0.8.1 is available on Heroku (64 GB plan, 1.8 GB used); no ML libraries installed locally.

#### Product profile (draft 2026-09-23)

The profile lives on `Product`. Items inherit it and keep only per-unit facts: condition, price, location, damage.

Every AI- or rule-filled field stores three things alongside it:
- **source:** `copy` | `rule` | `vector` | `ai:<model>` | `human`;
- **confidence:** high | medium | low;
- **set_at.**

A `human` value is never overwritten by a machine.

| Field | What it is | Used by |
|---|---|---|
| `short_name` | ≤ 28 chars; rules in `extended/product-taxonomy.md` | Price tag, POS line, processing list |
| `display_title` | Cleaned full title, ≤ 80 chars, brand first | Online listing, item page, reports |
| `brand` | Canonical name after the alias table. Blank if unknown, never "Generic" | Short name, matching, buying brand stats |
| `model` | Model or style number when one exists | Matching, retail check |
| `identifiers` | UPC, ASIN, vendor SKU, TCIN (list with type) | Exact match at intake, dedupe |
| `category` / `subcategory` | Taxonomy names, exactly | Need, buying, shop, reports |
| `key_specs` | Small JSON: size, count, color, capacity, fit | Short name, variant vs duplicate, listing |
| `flags` | `high_value`, `fragile`, `multi_part`, `test_required`, `vague_title`, `incomplete` | Processing checks, pricing, review queue |
| `retail_estimate` | Dollars, with a source (manifest, history, ai) | Pricing sanity, truck value |
| `price_band` | Under $5, $5–20, $20–50, $50+ (from sold history, else retail) | Buying mix, reports |
| `description` | 1–3 plain sentences | Online listing |
| `search_keywords` | Short list | Shop search, matching |
| `dup_group` / `merged_into` | Dedupe cluster and the surviving product | Reversible merges (Phase 4) |
| `vector` | Embedding of the display title and specs (Phase 2 storage) | Near match at intake, "similar products sold" |

### Phase 2 — Structure
Add provenance and confidence to product fields, a brand alias table, vector storage (pgvector or a stand-in), a product merge tool (reversible, logged), and the review queue.
**Gated by:** Phase 1.

Build steps (draft 2026-09-23). Each step is a migration plus tests, and each ships alone.

1. **`ProductProfile` (one-to-one with `Product`).**
   - It holds the profile fields above, and a `field_meta` JSON (`{field: {source, confidence, set_at}}`).
   - A separate table keeps `Product` (which POS and processing read) unchanged and lets writes be batched.
   - `apps/inventory/services/product_profile.py` is the only writer. `set_field(product, field, value, source, confidence)` refuses to overwrite `human`, logs the change, and bumps `set_at`.
2. **`BrandAlias`:** `alias` (normalized) → `brand`, plus `is_junk`.
   - Seeded from R-023:
     - 22,338 brand spellings in 1,554 clusters, e.g. Hearth & Hand ×4, up&up ×6, DEWALT ×4;
     - "Generic", "Unbranded", "Unbraded" and "NA/N/A" (about 11.4k products) all mean unknown, so they become blank;
     - 840 "Generic" products start their title with a known brand.
   - Junk rule: all caps, 5+ letters, under 20 products, and no vowel or 4 consonants in a row. It flags 274 names and catches 0 real brands in the top 300.
   - Below the top 300 the junk rule also catches real brands stored in caps (SCHLAGE, CRAFTSMAN, CURLSMITH), so it needs a keep-list and review before it's used.
   - `normalize_brand(text)` is used by intake, the backfill and the short-name builder.
3. **`ProductProposal`:** a queue row with product, field, proposed value, source and model, confidence, the dollars at stake (sold plus on-hand retail), status (`pending` / `accepted` / `rejected` / `auto`), and the reviewer.
   - The backfill writes proposals.
   - High confidence from a model that passed the audition auto-accepts. The rest go to review, sorted by dollars.
4. **Review screen** (Inventory > Product review): a list sorted by dollars, where one key accepts, picks or fixes. The same screen serves the end-of-truck and weekly reviews (`data_quality_rails` Phase 3).
5. **`CatalogMerge`** (built 2026-09-24; named so it doesn't clash with the existing `ProductMergeAudit`): survivor, merged, the reason, who, when, and the item ids moved.
   - `merge_products(survivor, merged)` repoints items and manifest links, sets `merged_into`, and never deletes a row.
   - `unmerge()` reverses it.
   - A merge needs the same brand and specs, or `human` approval (R-022 sizes it).
6. **Vectors** (superseded 2026-09-24: FAISS, not pgvector; see Progress below):
   - ~~`CREATE EXTENSION vector` (pgvector 0.8.1 on Heroku, per R-018); locally, check the build first.~~
   - A `ProductVector` table: product, model name, dimension, the vector, and the text hash.
   - The model is local MiniLM or similar (a new dependency, so the owner decides) or a cheap API embedding.
   - Fallback when pgvector is missing: store float arrays and use trigram matching only.
   - Nothing needs vectors until Phase 4 dedupe and Phase 6 intake.

Order: 1 → 2 → 3 → 4, then 5 (needs 3 and 4), then 6. Steps 1–3 unblock the Spark backfill trial on the gold set's neighbours.

Progress (2026-09-24, owner approved Phase 2):
- **Step 5 built:**
  - `CatalogMerge` (`inventory/0100`) and `services/catalog_merge.py`.
  - `merge_duplicate_products` does a dry run by default and writes a plan; `--apply` merges and `--undo <id>` reverses one.
  - Candidates on dev: 78,455 (6,445 by UPC, 72,010 by same normalized title and canonical brand).
  - The UPC rule needs 11+ stored digits and similar titles: 12% of same-UPC pairs were unrelated goods (a toilet seat and a fireplace).
  - Trial on dev: 500 merges took 25 seconds, and undo was verified.
  - Applying merges in production waits on the owner.
- **Steps 1–4 built** (tests in R-038):
  - `ProductProfile`, `BrandAlias` (1,814 aliases seeded from R-023 plus placeholders) and `ProductProposal`;
  - the title trigram index;
  - the service and the three commands;
  - the review page and API.
- **On dev:**
  - 386k proposals loaded (both batches);
  - 366k auto-accepted proposals applied, about 4 minutes;
  - 121,609 profiles;
  - 19,434 proposals (about 6.5k products) waiting in Product review.
- **Production: not loaded.** The backfill files are in `workspace/` and aren't committed. To load them after the deploy:
  1. copy the JSONL files up (a Heroku one-off with an upload, or commit them compressed; owner's choice);
  2. run `seed_brand_aliases`;
  3. run `load_profile_proposals` for each batch;
  4. run `apply_profile_proposals --status auto`.
- **Not yet:** step 5 (merge tool) and step 6 (vectors).
  - R-039: local Postgres 18 has no pgvector, and there's no prebuilt Windows binary; it means an `nmake` build of v0.8.6, or Docker. Heroku has 0.8.1.
  - No embedding libraries are installed.
  - **Decided (owner, 2026-09-24): pgvector in both local and Heroku, because local must match production.**
    - A `ProductVector` table with `vector(384)` and an HNSW index, created by migration (`CREATE EXTENSION vector`).
    - Embeddings come from `fastembed` (ONNX, no PyTorch).
    - Live lookups are SQL, with filters.
    - FAISS is optional, only inside batch commands (load from the table, all-pairs, write back) if pgvector proves slow; it's never in the web process.
    - **Built (2026-09-24):**
      - pgvector 0.8.1 is installed locally (owner build) and was created in production by the owner.
      - `inventory/0099` creates the extension in the connection's schema and checks the type is visible.
      - Tests: R-041 was RED on test scoping, fixed; R-042 is the retest.
    - **Model: `BAAI/bge-small-en-v1.5`** through fastembed. It beat MiniLM, Arctic-s and Nomic on the labelled set.
    - **Dev:** all 200,342 products embedded in 39 minutes.
    - **Quality, title and brand only (a new manifest line):** the 5 nearest products' majority category matches the hand label **90.5%** of the time (482 gold and held-out products). Spark gets 92%.
      - Vectors can place intake lines before any AI call, which is the "local vectors" rung of the ladder.
    - **The pull-prod-to-local script** now creates vector and pg_trgm in `ecothrift` before the restore. Nothing reads the profile yet: switching the price tag, POS and processing screens to `short_name` is Phase 6 (R-030 lists the one-line switches).

### Phase 3 — Gold set and audition
A gold set of 100–1,000 products per task: category, short name, duplicate yes/no. Audition the models; pick one per task on cost and accuracy.
**Gated by:** Phase 2.
Detail when Phase 2 is built.

### Phase 4 — Dedupe the catalog
Exact, then trigram, then vectors, then the chosen model confirming the ambiguous clusters. Merge reversibly, and repoint the items.

Facts from R-022 (2026-09-23):
- **Exact title groups:** 53,861 groups hold 132,776 products (66%), with $851k sold.
- **Conflicting groups:** 4,112 groups have mixed brands or categories. Most are brand spellings (RIDGID/Ridgid), which the brand aliases fix.
- **Vague titles break title merges:** "men s watch" joins 5 brands and "bowl" joins 16 products. Never merge a `vague_title` group on title alone.
- **Near pairs (trigram ≥ 0.8):** 12 of 30 are the same product and 17 are variants (size, color, count, or piece vs set). So a merge needs matching `key_specs`, not just similar text.
- **Speed:** trigram at catalog scale needs a `gin_trgm_ops` index on `inventory_product.title`; without it, about 8 hours. Add the index in Phase 2.
- **Identifiers (R-029).**
  - Merge first on these: 2,606 valid UPCs are shared by 7,200 products, and they look like the same product typed twice.
  - Product UPC is filled on 40–56% of products, but only 13–17% of the filled values are 12 digits. Checked on 2026-09-23:
    - 12-digit values pass the UPC check digit 93% of the time.
    - Shorter values padded with zeros pass only about 30% of the time (10% would be chance). About 20k of them look like a UPC with its leading zeros dropped; the rest are other numbers, such as item numbers or UPCs missing their check digit.
    - Normalize only padded values that pass the check digit.
  - Intake has good identifiers: Target lines have UPC 98% and TCIN 78%, and Amazon lines have ASIN 100%. Check-in already merges the UPC onto the product.
**Gated by:** Phase 3.
Detail when Phase 3 is built.

### Phase 5 — Enrich and backfill
Fill every product profile by the cheapest-first ladder. Items inherit, which places the historical "Mixed" sales.
**Gated by:** Phase 4.
Detail when Phase 4 is built.

### Phase 6 — New intake
Every new manifest runs:
1. The template.
2. Cleanup: brand aliases, titles, code mapping.
3. An exact or near match ("this title was seen 156 times, always the same product").
4. A vector match.
5. Spark for the rest.

Processors see a matched profile to accept, pick or fix. The new price tag uses the short name.

Where to switch to `short_name` (R-030; each is a single place today):
- **Price tag:** `frontend/src/pages/inventory/processing/printProcessingLabel.ts:25`. The printer keeps 15 words on 2 + 2 lines, so 28 characters fits.
- **POS line and receipt:** `apps/pos/views.py:709` and `:780` (the receipt wraps at 48 characters).
- **Processing screens:** `product_title` in `apps/inventory/serializers.py:46`.
- **Listings:** they keep their own title, so write the short name or display title when a listing is created.
**Gated by:** Phase 5.
Detail when Phase 5 is built.

---

## Acceptance

- [ ] Phase 1: decide the shape
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-25 — Phases 4–6 continue in [`buying_intelligence_v2`](./buying_intelligence_v2.md).** Dedupe and backfill become routine work through the QA inbox (its Phase 1). Vectors are re-embedded from an AI "vector text" and used in dedupe, categorization and intake (its Phase 2).

**2026-09-23 — Opened (plan only).** It came from the owner's buying goals (categories, vectors, "what do we need, make money on, and sell quickly"). Spark was verified the same day: 4 of 4 categories right, good short names, about 8 s a call, and heavy reasoning tokens (so batch the calls).

---

**2026-09-23 (night) — Phase 1 done; gold set and first audition.**
- Spark was added to `llm_router` (`core/0007`).
- The 300-product gold set was hand-labelled (`workspace/gold/`). It produced rulings TAX-16 to TAX-37 and found register ITM-13: V1/V2 product categories are noise, 10% agreement.
- **Audition** (`workspace/gold/AUDITION.md`):
  - Spark contributor, low effort, batch 25: 98% category, 95% subcategory, and "high" confidence always right.
  - Flash-Lite: 96%. Haiku: 93%, and it breaks the short-name length rule.
  - Proposed accept policy: Spark high, or Spark plus Flash-Lite agreeing, is automatic (about 96% of rows). Disagreements go to review.
  - Scores are optimistic until the held-out set (R-031) is labelled.
- **Pilot:** Spark placed the top 2,000 Mixed title groups by sold dollars, written to a file only (`workspace/backfill/pilot_out.jsonl`). Mixed is 108k title groups, 122k products, and $1.59M sold.

**2026-09-23 (overnight) — Full backfill proposals, written to files only; nothing applied.**
- **Held-out check (R-031, 200 products):** Spark scores 92% on category and 97% on "high" rows. The accept policy auto-accepts 95% of rows at 94.7%. The misses became rulings TAX-38 to TAX-46.
- **Mixed run:** Spark placed all 108,227 Mixed title groups in 5.6 hours with 0 errors (22.8M tokens in, 13.1M out). Flash-Lite gave a second opinion on the 23.7k non-high rows.
- **Accept policy result:**
  - Spark `high`: 84,486 groups, $1.27M.
  - Spark plus Flash-Lite agreeing: 18,232 groups, $244k.
  - The models disagree: 5,482 groups, $75k, in `workspace/backfill/review_queue.csv` sorted by dollars.
  - **If applied, Mixed goes from 89.6% of sales to 4.3%**, which meets the finish line of under 10%.
- **V1/V2 placed products:** 5,566 groups. 64% keep their current category; 1,861 moves ($32k) are auto-accepted.
- **Files:** `workspace/backfill/` holds the proposals (with source, confidence and the taxonomy version on each row), the second opinion, `SUMMARY.md`, the review queue, and `check_vs_processing.py` (85% agreement with the processors, mostly on ruling questions Q1–Q6).
- **Next (owner decisions):**
  1. Answer taxonomy questions Q1–Q6.
  2. Approve Phase 2 steps 1–3 (profile table, brand aliases, proposals queue), so the files load as proposals with provenance.
  3. Apply the auto-accepts, then review the $75k queue.

## See also

- Register: [`.ai/extended/data-quality.md`](../extended/data-quality.md) (PRD-01, PRD-02, ITM-01, ITM-11, PO-03)
- Compass: [`bstock_daily_buying`](./bstock_daily_buying.md) (Phase 4 reads this)
- Index: [`_index.md`](./_index.md)
