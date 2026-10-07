<!-- Last updated: 2026-10-07 (owner's demand dimensions; the calculator's small first step) -->
# Thrift+ demand dimensions (future improvement)

**Status:** idea, written down 2026-10-07 at the owner's ask. **Not** in the live reward engine. The only piece built is a small, beta "category demand" input in the rewards **Calculator** (Thrift+ → Calculator), which changes nothing live.

## The owner's idea (2026-10-07)

Pricing and rewards would be close to right if each item carried a few **demand dimensions**: not categories, but scores an item has more or less of. His examples:

| Dimension | What it means | Example |
|---|---|---|
| **Specialty** | Takes the right buyer; sells slowly, then at a good price | A specific automotive part |
| **Expensive for what it is** | High brand quality, very high price for its kind | $10,000 speakers, a $5,000 bed frame |
| **Collectible** | Often sells above retail | Good Pokémon cards, figurines |
| **Consumable, expired** | A very hard sell (sold legally; the owner has consulted counsel, do not raise it) | Cosmetics, food, vitamins past date |
| **Consumable, not expired** | Sells like a normal consumable | |
| **High demand** | Usually sells high and fast | |
| **High volume** | We have far too many; needs a learned pricing strategy | A truckload of one kind of item |
| …more | | |

An item can score on several at once (an expired collectible, a high-volume specialty part).

## Two paths

1. **Vectors with no meaning of their own.** Learn them from data, for example from the product embeddings (`ProductVector`, pgvector) plus each product's sales history, then fit price and speed on them. This is strong once there is enough history, but hard to explain and check by eye. The data platform's model factory (data_platform Phase 5) is the place for it.
2. **Named dimensions, each with a score.** Each dimension above gets a 0 to 1 score per product. Three ways to score:
   - **Estimate** with an LLM, reading the title, brand and category (cheap, fast, explainable; check it on a hand-labelled sample);
   - **Calculate** it from history with **credibility** blending: brand within category, then category, then the store. A group with many sales is trusted; one with few is pulled toward its parent (the Bühlmann idea: weight n ÷ (n + k));
   - **Learn** it: fit the dimension from sales, then name it.

The two paths can meet: named scores as features beside the embeddings.

## How the scores would feed pricing

Each one turns a knob the engine already has, or one the calculator already shows:

- the **rate** (how fast the reward grows), for example slower for high demand and collectibles, faster for expired consumables;
- the **wait** before the first reward (longer for specialty);
- the **floor** (higher for collectibles);
- the **starting price** at pricing time (outside rewards).

## The small step built now (calculator only, beta)

- **Category demand.** Each category's median days to sell. The data:
  - V3 sales in the last 180 days that have a floor date (`listed_at`; data-quality ITM-02 and ITM-03: about 40% of sales have one);
  - the Spark profile category where it is a real one (ITM-15).
- **Credibility.** It is blended with the store's median by z = n ÷ (n + 30), where n is the category's sales.
- **The effect.** The reward rate is multiplied by (category days ÷ store days) ^ strength, kept between ½× and 2×. A fast-selling category discounts slower; a slow one, faster.
- **Why it is low risk:** it is only a what-if in the calculator. The live engine is unchanged. The table shows each category's sales, days, credibility and multiplier.
- **Code:** `apps/thriftplus/services/calculator.py` (`demand_speeds`, `_multipliers`).

## Next steps (when the owner wants them)

1. Score two or three dimensions with an LLM on a sample, and compare them with sales speed and price (does "collectible" really sell above retail?).
2. Credibility-blended speed and price by **brand within category**, not only category.
3. Try the scores in the calculator first; only then wire one into the live engine behind a switch (phases-ship-alone; valuation changes behind a switch).
4. High volume: the live engine's pacing (hold a family while it sells on pace) is the first answer. A learned strategy comes later.
