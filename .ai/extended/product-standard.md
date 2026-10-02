<!-- Last updated: 2026-10-02 (spec-v6) -->
# Product standard

This file defines what every product must look like, and how that gets enforced. The owner set the direction on
2026-09-29: standardize every product, then dedupe; hard rules so the same decision repeats every day; vet every
batch.

**Where the rules live:**
- **Machine copy:** `apps/inventory/spec_rules.py` (`RULES_VERSION`).
- **Placement:** `.ai/extended/product-taxonomy.md`, the one answer key for category, subcategory and tag names.
- **Plan and decisions:** `.ai/extended/backfill-plan.md`.

## The fields (on `ProductProfile`)

| Field | What it is | Hard rules |
|---|---|---|
| `display_title` | The long form, for online sales and listings | ≤ 80 characters, Title Case. Order: brand, then line or model name, then what it is, then product specs. Never color or other item details, seller SKUs or condition text; code strips model codes and item details. |
| `short_name` | The tag name: short, so a customer recognizes exactly what it is | ≤ 28 characters, per the taxonomy's tag rules. A real brand leads. |
| `vector_text` | The words that get embedded (dedupe, matching, search) | Lowercase keywords, no filler. Code adds every product-spec value and removes every item-detail value, so two items of one product always embed the same way. |
| `brand` | The canonical brand | Correctly cased; "Generic" for junk seller names (G5). |
| `model_number` | The base model | Color or finish suffixes cut (G6); full codes go in aliases. |
| `category`, `subcategory` | Canon only | Exactly the taxonomy names. Anything else is not auto-accepted. |
| `key_specs` | The **product specs**: details that change the price | Only the keys listed for the category, and only what the data states (G7). |
| `aliases` | Other names for this same product | `{"upcs": [], "models": [], "titles": [], "brands": []}`, gathered when products merge. |

**Item details** (color, pattern, apparel size, condition, serial) belong on the item (`Item.specifications`), never on
the product. The item still maps to the one product.

## Spec rules (spec-v6; the full, current list is `spec_rules.py`: B1-B6 brand policies, G1-G16)

**Global:**
- G1: brand and model number are fields, not specs.
- G2: condition is always an item detail.
- G3: color, pattern and finish are item details unless a category lists them.
- G4: pack size and count are product specs everywhere.
- G5: junk seller brands become "Generic", with the name kept in aliases.
- G6: models that differ only by a color suffix are one model.
- G7: never invent a spec.
- G8: standard units.

Per category, the full list is in `spec_rules.py`. The ones that decide most merges:

| Category | Product specs (a different value = a different product) | Item details |
|---|---|---|
| Electronics | device type, storage, capacity (mAh), wattage, screen size, connector, compatible with, generation | color, serial, accessories |
| Furniture | type, size, material, seats, piece count, assembly | color, finish |
| Bedding & bath | type, bed size (Twin/Full/Queen/King), material, piece count, thread count | color, pattern |
| Apparel | garment type, gender or age, material | **size**, color, pattern |
| Toys | type, franchise, character, piece count, scale, age grade, edition | color, completeness |
| Tools | type, power source, voltage, size, piece count, tool-only vs kit | color, serial |

## How a batch runs (and is vetted)

1. **Write:**
   ```bash
   python manage.py standardize_products --batch std-NNN --size 10000
   ```
   - Takes the next products by sold dollars, 10 per Spark call.
   - Validates each answer in code: canon names, lengths, allowed specs, answers swapped between products.
   - Appends to `workspace/standardize/std-NNN.jsonl`.
2. **Vet:**
   ```bash
   python manage.py vet_standardize std-NNN
   ```
   - Claude judges a random 200 against these rules.
   - "Wrong" means it would mislead a shopper or break dedupe; "polish" means wording only.
   - **The batch passes at 95% with nothing wrong.** If it fails, fix the rules or prompt (new rulings go in the
     taxonomy) before the next batch.
3. **Load:**
   ```bash
   python manage.py standardize_products --load std-NNN
   ```
   Writes proposals tagged with the rules version:
   - `auto`: valid and high confidence;
   - `pending`: everything else, for Product review.
4. **Apply:**
   - Local: `apply_profile_proposals --status auto`.
   - Production: a Requests item the owner approves.

**Trials on 2026-09-29.** Each round was the top 100 products by sold dollars:
- Round a: 76% right.
- Round f: 91% right.

What each fix did:
- **Prompt rules:** brand first, keep line names, specs complete.
- **Code rules:** vector text built from the specs; model codes and colors stripped from titles; a check for
  answers swapped between products.
- **Model settings:** 10 products per call, medium effort.
- **Rulings:** TAX-47 to TAX-53.

## Model ladder (owner, 2026-10-01)

| Job | Model | Effort |
|---|---|---|
| Write the standardized answer (every product) | Spark Contributor (`muse-spark-1.3-contributor`) | high (its ceiling) |
| Judge a sample, and check uncertain answers | Spark (second pass); Gemini 3.8 Flash for vet samples | high / low |
| **Anything escalated above Spark** (flagged answers rewritten, vet flags confirmed, rule proposals) | **Claude Sonnet 5.5** | **medium** |
| Opus | not used in the pipeline (cost); only for a one-off audition | |

Escalations are rewrites, not opinions: the Sonnet answer replaces Spark's for that product
(`workspace/standardize/escalated.jsonl`, loaded in place of the batch row). Dedupe has no escalation step yet.
