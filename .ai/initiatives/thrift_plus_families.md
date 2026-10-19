<!-- initiative: slug=thrift-plus-families status=active updated=2026-10-19 -->
<!-- Last updated: 2026-10-19 (Phase 2 built: supply rule and Thrift+ → Overstock) -->

# Initiative: Thrift+ look-alikes and overstock (was: pricing families)

**Status:** **Active: Phase 2 shipped in v2.181.0 (10-19).** Owner 10-19: products under 10 units grow like singles; 10+ units grow only while over 90 days of supply; a weekly overstock list for lots over a year of supply. This replaces families, targets and approvals (rulebook P6).

**Objective:** ThriftBucks discount only what isn't selling, with no owner work per product. Multi-unit stock that sells fine keeps its margin; stock that doesn't grows like any item. The real overstock (lots over a year of supply) goes to the owner as a short weekly list of physical actions, because a member discount won't clear it.

**Compass:** this file is not the compass; [`thrift_plus_rewards`](./thrift_plus_rewards.md) is. This is its rule P6 ("Look-alikes and overstock"), built out.

---

## Finish line

The nightly engine grows a product of 10+ floor units only on nights it has more than 90 days of supply; everything else grows like a single item. **Thrift+ → Overstock** in Dash lists every product of 10+ units with more than a year of supply, biggest tag dollars first, and the owner marks one action per lot. No family, target or approval is left in the engine or the page.

---

## Out of scope

- Changing tag prices. ThriftBucks only, never the tag.
- Back-stock counts and moves (P5, P7). Floor counts today include back stock and unwritten shrink (only 52 of 35,017 on-shelf items have a back-stock location), so some products look slower than they are. Accepted for now.
- Grouping similar products (the AI run is dropped: each product is measured on its own).
- Customer-facing words. The formula is never published (P8).
- Consignment (excluded from ThriftBucks).
- Buying limits (flag lots where one SKU would be over a year of supply): in [`buying_intelligence_v2`](./buying_intelligence_v2.md), after launch.

---

## Why (production, 2026-10-19, read-only)

| Units of one product | Products | Units | Tags | Over a year of supply |
|---|---|---|---|---|
| 2 to 3 | 1,364 | 3,115 | $57k | 0 |
| 4 to 9 | 656 | 3,676 | $44k | 216 ($18k) |
| 10 to 49 | 412 | 8,185 | $65k | 272 ($48k) |
| 50 or more | 93 | 13,932 | $75k | 75 ($66k) |

Supply = floor units ÷ sales in the last 90 days. **$132k of $241k** is over a year of supply. Under the families rule: big lots were "behind" every night, so they aged slowly whether they sold or not; groups of 2 or 3 were held or grew slower than single items (the +1 estimate over a short window looked "on pace"); restocks inherited a family's %; and the owner's review queue refilled with every load.

---

## Phase 2: Supply rule and the overstock list (planned 10-19)

**Gated by:** none (the owner said yes 10-19). **Built 10-19**, one ship.

1. **Engine** (`services/rewards.py`). The group is the product; `FamilyLink` and `RewardFamily` are no longer read. A product is **paced** with 10+ non-consignment floor units. It is **on pace** (tonight holds) when its days of supply are 90 or less: floor units ÷ ((sold in the window + 1) ÷ window), where the window is the real age of its oldest floor unit (not the launch-compressed age), 7 to 90 days. Behind: it grows like a single. The existing hold mechanics stay: only tonight holds, missed nights still grow, a unit whose scans-to-adds lags still climbs alone. Remove the possible/approved family branches, `family_states`, the nightly `flag_identical` and `auto_approve`. Units held or approved as families resume from the ThriftBucks they have (never down), with no catch-up jump (the held nights already advanced their day). New reasons with labels on the ThriftBucks tab: "Selling fine (10+ units)" and "Over 90 days of supply".
2. **Settings.** `group_min_units` 10, `supply_days` 90 and `overstock_days` 365 in the engine's saved setting (code defaults; the Calculator's Save keeps them). The Calculator itself doesn't model pacing (unchanged).
3. **Overstock list.** Thrift+ → **Families** becomes **Overstock**: products with 10+ floor units and more than 365 days of supply, biggest tag dollars first, undecided first. Each row: units, tag dollars, sold in 90 and 180 days, days of supply, retail, cost, age, flags (catch-all product; cost 40%+ of the tag, so it was bought to sell near the tag). The owner marks Back stock, Bundle, Dollar bin, Liquidate, Donate or Keep, with an optional note; stamped who and when. A new `OverstockMark` table (one migration). Managers can look; only the owner marks. The list never changes ThriftBucks.
4. **Retire.** The family queue endpoints and page, `families.py` (`flag_identical`, the AI check) and `assign_reward_families`. The `RewardFamily` and `FamilyLink` tables stay unused for history (dropped later). Check the Heroku Scheduler for an `assign_reward_families` job (it never ran in production).
5. **Tests.** Under 10 units grows like a single; 10+ holds at 90 days of supply or less and grows over it; a restocked unit starts its own clock; units held as a family resume with no jump; the overstock list's order, flags, marks and permissions.
6. **Docs.** Changelog, `thrift_plus_rewards` engine notes, `extended/known-issues.md` (floor counts include back stock).

**Built 10-19:** `rewards.Pace` (supply), `rewards.paces` (by product), `Rules.group_min_units` / `supply_days` /
`overstock_days` (kept through the Calculator's Save), the one-time catch-up for units leaving the families rule
(`FAMILY_REASONS`, `Rules.days_for`), `services/overstock.py`, `OverstockMark` (`thriftplus.0022`), `OverstockViewSet`
(`/api/thriftplus/overstock/`), Thrift+ → **Overstock** (`?tab=families` opens it too). Retired: `families.py`,
`family_queue.py`, the Families page and API. `assign_reward_families` is a no-op until any Scheduler job for it is
removed. Tests: `test_rewards.py` (selling fine, over supply, under 10, restock, leaving the families rule),
`test_overstock.py`, `OverstockTab.test.tsx`.

- [x] Engine: under 10 units like singles; 10+ hold at 90 days of supply or less; restocks start their own clock.
- [x] Units from the families rule grow on from the ThriftBucks they have.
- [x] Overstock list with marks, owner-only.
- [x] Family queue, flagging and AI check retired.

---

## History: the families design (2026-10-13 to 10-19, superseded)

Kept for the record; none of it is the rule now (rulebook P6).


### What the floor looks like (production, 2026-10-13, read-only)

- **34,510 floor units** (not consignment) in **8,561 products**.
- **2,464 products have 2 or more units on the floor: 28,413 units, 82% of the floor.** By size:

| Units of one product | Products |
|---|---|
| 2 to 3 | 1,351 |
| 4 to 9 | 622 |
| 10 to 49 | 400 |
| 50 or more | 91 |

- The biggest (local copy, same pattern): 1,560 flannel shackets at $5, 1,030 plastic tumblers at $0.25, 758 bootcut jeans at $8.99, 670 boxes of religious candles at $10, 579 boxes of suppositories at $3.50, and 518 "Amazing Clothing Item" at $3 (a catch-all product, not one item).
- **Similar items across products** aren't grouped yet: `FamilyLink` is empty in production. `assign_reward_families` (vector neighbours, then one model call per product) has never run. **103,267 product vectors are already in production**, so it can run now.
- The engine today: units of one product already pace together (a "bulk" family that holds while selling on pace to clear by day 90), and so do linked families. Nothing holds a *possible* family, and there is no owner target.
- At launch with today's setting (0.75% a day; old stock at 30% of its age, at most 45 days), these groups carry most of the launch-day ThriftBucks. So **what a held family shows on launch day is the biggest call** (decision 2).

---

### The rules (owner 2026-10-13, with rulebook P6)

1. **Possible family:** identical items (one product, several units), and similar items the AI groups across products. **As soon as a group is flagged, its ThriftBucks stop growing** until the owner approves it (with a sell target) or removes it.
2. **Approved family:** its units carry the same ThriftBucks as a % of each tag. They don't grow 0.75% a day. They rise slowly while the family sells slower than its target, and hold while it sells at or above it. They never go down (P3), and every change is logged with the pace numbers.
3. **Every family needs approval and a sell target** (*x* sold per 90 days).
4. **Removed ("not a family"):** each item goes back on its own and grows at the normal rate from that day.
5. **Broken apart** (P6): each item keeps the ThriftBucks it has that day, then moves on its own.

---

### The Families page (the heart of it)

**Built for speed and for good calls.** It is a queue, worked top down.

- **Order:** money at stake first: units × average tag, weighted by age. Progress at the top ("312 of 2,464 decided").
- **Each card:**
  - photos of a few units, the title, units on the floor and in back stock, the price range, retail, and the age range;
  - **sales of this product or family** in the last 90 and 180 days (units sold, median days to sell);
  - today's ThriftBucks %, and what launch day would be without the hold;
  - flags: **junk volume** (many units, low tag, slow sales), **fast seller** (a big group that sells well, so don't discount it), **catch-all product** (one product name over unlike items: split, don't family);
  - **the AI's suggestion:** approve with a target of N per 90 days (from the sales history), or not a family, or split, or exit, with one line on why.
- **One tap:**
  - **Approve** (the suggested target);
  - **Approve with…** (a target slider that shows the projected weeks to clear and the ThriftBucks path);
  - **Not a family**;
  - **Split** (pick units);
  - **Merge** with another family;
  - **Hold** (watch, no growth);
  - **Exit** (bundle, dollar bin, donate).
- **In bulk:**
  - approve every card in the current filter at its suggestion;
  - filters for size band, category, price band, vendor or source, age, and the flags;
  - keyboard: A approve, N not a family, S split, X exit, and arrows to move.
- **Watch list** (after approval, P6): sales in the last period next to the floor count, back stock and prices. It flags a family that is off pace (too slow or clearing too fast) and offers a new target.

---

### Initial work on stock already on the floor (before launch)

1. **Group the identical products** (2,464 groups; no AI needed).
2. **Find similar items across products:** run `assign_reward_families` over the floor (vectors exist). It needs the model in Settings → AI (`THRIFTPLUS_FAMILY`). That's about 8,561 checks at most; the cost estimate goes in the request before it runs. It is staged as a Superuser → Requests item for the owner's OK.
3. **Pre-fill a suggestion on every card:** the target from the product's own sales history (and the family's), the flags, and the reason. The cheap, mechanical ones (catch-all products, huge low-tag lots) are named first.
4. **The owner works the queue,** biggest money at stake first. The 91 lots of 50+ units go one by one (answer 5). Smaller groups can be approved in bulk at their suggestion.
5. **By launch, everything is decided:** "Mark the rest not a family" clears what's left (answer 2).

---

### The owner's answers (2026-10-13)

1. **What counts as a family: the same product, or similar products.** Similar is the hard part. **Not one similarity threshold:** compare products **within the same category and subcategory**, and call "similar" the ones that are very close *for that subcategory*. The owner wants help with the method and the timing (likely overnight runs). Claude's method is below (§ Finding similar items).
2. **Every family is decided by launch day.** The page has **"Mark the rest not a family"** for whatever is left. So nothing is undecided at launch.
3. **The slow rise is 0.25% of the tag a day.** Sales estimates are **conservative: as if one more sold now**. The rate is (units sold in the window + 1) ÷ the days observed. A product with no sales yet still gets a small, honest estimate, and one lucky sale doesn't make a fast seller.
4. **The default target is to clear the floor count in 90 days.** It's a rule of thumb. The card flags when it's likely wrong:
   - **(a)** the order was priced with a sell price in mind (the order's estimate), so don't discount below that plan;
   - **(b)** the volume is too high to sell in 90 days at the estimated rate;
   - **(c)** anything else the AI notices, in one line.
5. **Huge lots (50+ units) are decided one by one.** There's no bulk approve for them.
6. **Generic and catch-all products are families too** ("Amazing Clothing Item"). They discount to sell fast and behave like each other, which is the point of a family.
7. **The AI run for similar items:** asked again in plain words (it changes data in production, so it goes through Superuser → Requests).

---

### Finding similar items (Claude's method, for answer 1)

- **Compare only within a subcategory.** Candidates must share the category and subcategory (the taxonomy). That removes most false matches before any math.
- **"Very close" is relative to the subcategory.** For each product, find its nearest neighbours by vector *inside its subcategory* (the 103,267 vectors in production). Keep a pair only when it is unusually close **for that subcategory**: in the top few % of that subcategory's pairs, and each is among the other's nearest (mutual). Add two checks: tags within about 2× of each other, and the same brand when both have one.
- **Then one judgment per group:** the model is asked "would a shopper treat these as the same thing at a similar price?" for each candidate group, with the titles, prices and photos. Groups it accepts go to the owner's queue as *possible families*. Nothing becomes a family without the owner.
- **When:** an overnight run in chunks, the biggest subcategories first. After that, new products are checked each night. The run's model cost is estimated in its request before it starts.

---

### Phases

#### Phase 1: Identical families, the hold, and the queue
Every product with 2+ units on the floor (generic ones included) is a possible family. It holds, and the owner decides it on the Families page.
**Gated by:** none (answers 2 to 6 given 10-13).

Acceptance:
- [x] Every product with 2+ floor units (not consignment) is a **possible family**. Its ThriftBucks stop growing that night (a new engine status, logged). Launch-day ThriftBucks already computed stay.
- [x] **Families page v1:** the queue ordered by money at stake. Each card shows units, the price range, age, sales (90 and 180 days) and the conservative rate ((sold + 1) ÷ days). It suggests a target (clear the floor in 90 days) and flags (a) the order's planned price, (b) too much volume for 90 days, and junk volume.
- [x] One tap each: **Approve** (the target, editable), **Not a family**, **Exit**. Bulk approve on a filter, never for 50+ unit lots. **Mark the rest not a family.**
- [x] An approved family: one ThriftBucks % for all its units, rising 0.25% of the tag a day while it sells slower than its target, holding at or above it, never down. "Not a family": each unit grows on its own from that day.
- [x] Tests: hold, approve, not a family, the slow rise against the target, and mark the rest.

**Built 10-13 (not shipped yet):** `families.flag_identical` (run first every night, and "Find new families"), the engine's `family_states` and hold/approved steps (`rewards.py`), `family_queue.py` (the cards, flags and decisions), `FamiliesViewSet` (`/api/thriftplus/families/`), and Thrift+ → **Families** in Dash. A possible family keeps the ThriftBucks of its first night (its launch start), so launch-day values are the same either way; decisions change growth from the next night. An approved family starts at the median of its units' current %. Identical units no longer pace by sell-through as "bulk" (the families replace it). Local dry run: 2,080 families found in 0.5 s, the queue in 0.4 s, 1,996 can be approved in bulk (84 huge lots one by one).

#### Phase 1c: Approved by default (owner 2026-10-16)
Every possible family is approved at the end of its first night at the default target (its floor count per 90 days), unstamped, starting at the median of its units' ThriftBucks %. The page opens on **To review** (approved, no one stamped); the owner's Save, Not a family or Exit stamps it. Replaces "a possible family holds until the owner decides" (rule 1 and 3 above, rulebook P6).
- [x] `family_queue.auto_approve` at the end of every nightly run and on "Find new families"; the run counts `families_auto_approved`.
- [x] Families page: the To review view, the "Approved by default" chip, an approved card's target and Save, Not a family, Exit.
- [x] Tests: approved by default after the first night, then the slow rise; review and the owner's save.

#### Phase 1b (dropped): Similar items
The overnight search (§ Finding similar items) adds possible families across products to the same queue.
**Gated by:** Phase 1, and the owner's OK on answer 7.

#### Phase 2 (dropped): The watch list
Approved families on one list: sales in the last period next to the floor count, back stock and prices. It flags a family off pace (too slow, or clearing too fast) and offers a new target.
**Gated by:** Phase 1. Detail when Phase 1 is built.

#### Phase 3 (dropped): Decision speed
AI suggestions with reasons, projections on the target slider, photos, keyboard, Split and Merge.
**Gated by:** Phase 1. Detail when Phase 1 is built.

#### Phase 4 (dropped): New arrivals
New items join or start families at check-in (Processing), and the watch list alerts.
**Gated by:** Phase 2. Detail when Phase 2 is built.

---

### Timing

Launch is Tue 10-20; the last project day is Thu 10-15. Phase 1 (identical families) can ship Thu 10-15 (dark), and the owner works the queue 10-15 to 10-19. Phase 1b (similar items) runs overnight as soon as it's approved, into the same queue. Phases 2 to 4 follow launch.

---

## See also

- [`thrift_plus_rewards`](./thrift_plus_rewards.md): the engine (Phase 2), the saved setting (10-13).
- [`.ai/extended/thrift-plus-decisions.md`](../extended/thrift-plus-decisions.md): P3, P6, P7, P8.
- [`product_intelligence`](./product_intelligence.md): product vectors and catch-all products.
