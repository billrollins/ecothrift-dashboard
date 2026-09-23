<!-- initiative: slug=product-intelligence status=active updated=2026-09-23 -->
<!-- Last updated: 2026-09-23 (opened; plan only) -->

# Initiative: Product intelligence

**Status:** **Active** — Phase 1 (plan written; nothing built).

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
- [ ] Category and subcategory list approved by the owner, with a mapping from today's 19.
- [ ] Product profile fields and short-name rules written here, with an example per category.
- [ ] Spark callable through `llm_router` and selectable in Settings > AI.
- [ ] Runner recon on the data this phase needs:
  - every B-Stock category code we've seen, and where it maps today;
  - title and brand patterns in the "Mixed" items;
  - whether Heroku Postgres can take pgvector.

### Phase 2 — Structure
Add provenance and confidence to product fields, a brand alias table, vector storage (pgvector or a stand-in), a product merge tool (reversible, logged), and the review queue.
**Gated by:** Phase 1.
Detail when Phase 1 is built.

### Phase 3 — Gold set and audition
A gold set of 100–1,000 products per task: category, short name, duplicate yes/no. Audition the models; pick one per task on cost and accuracy.
**Gated by:** Phase 2.
Detail when Phase 2 is built.

### Phase 4 — Dedupe the catalog
Exact, then trigram, then vectors, then the chosen model confirming the ambiguous clusters. Merge reversibly, and repoint the items.
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
**Gated by:** Phase 5.
Detail when Phase 5 is built.

---

## Acceptance

- [ ] Phase 1: decide the shape
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-23 — Opened (plan only).** It came from the owner's buying goals (categories, vectors, "what do we need, make money on, and sell quickly"). Spark was verified the same day: 4 of 4 categories right, good short names, about 8 s a call, and heavy reasoning tokens (so batch the calls).

---

## See also

- Register: [`.ai/extended/data-quality.md`](../extended/data-quality.md) (PRD-01, PRD-02, ITM-01, ITM-11, PO-03)
- Compass: [`bstock_daily_buying`](./bstock_daily_buying.md) (Phase 4 reads this)
- Index: [`_index.md`](./_index.md)
