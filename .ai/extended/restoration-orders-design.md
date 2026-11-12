# Restoration orders: design (draft 1, Mainline, 2026-11-12)

Status: **draft for demos.** Bill read it and said "a good start but I have a hard time with it": he needs clickable demos to judge. Nothing here is decided until he picks from the demos.

## Bill's words (2026-11-12)

1. "ALL SEND to restoration surfaces from processing need a standardized method."
2. "The Processing (to Restoration, From Restoration) page needs a good name and probably should not be the same page as the one from restoration (Queue, bench, hold, finish)."
3. Processing sends an ORDER: **Inspect, Clean, Test, Assemble, Repair, Salvage.** "As a processor it is hard to set a price on a completely random item without stuff like that. So we need a GOOD order form that is intuitive for processors, and for restoration. BUT it also needs to proactively understand that restoration might TEST then choose to Repair or Salvage. And they need prices to help decide that."
4. The old scale "kind of worked: processor sends to restoration, no specific orders, but put in value for what the items would sell for in hypothetical finish point. Problem is: processors were NOT accurately saying things. A broken TV isn't worth 50% of a new TV, it is worth nothing. Nothing at all (for us, as we do not have good salvage technique to turn broken TVs into valuable parts and scrap metal and trash)."
5. Examples of what a processor says: assemble (price if not assembled, if assembled, if broken or missing parts); test (value if working and good condition, value if not working but 50% usable, value as scrap); repair; clean. All of them are "this is what I need in order to set the price, PLUS here is some rough guidance: do not spend a lot of time and money repairing or buying parts as we are only talking about $x in value."
6. Salvage decisions are ALWAYS, for each part of an item (or the whole item), one of five: **1 sell as is, 2 sell as a part, 3 keep for parts, 4 metal scrap (lbs, type), 5 trash** (some way to quantify, or not: %, lbs, description). "In the end I would like to be able to describe in a report how much salvage ended up 1 to 5." Sometimes one item breaks into 5 parts, each to a different ending. "Processing knows the BEST on 1/2; Restoration knows the best on 3/4/5." The salvage page must make it EASY: number of parts; for each part pick its ending; 1 and 2 need Add item; 3, 4, 5 are treated differently.

## Draft design (Mainline's proposal, all of it open)

### 1. One order form, everywhere
Every "Send to Restoration" in Processing opens the same form.
- **What I need** (tick any): Inspect, Clean, Test, Assemble, Repair, Salvage.
- **Three prices**, labels change with what is ticked:

| | Test | Assemble | Clean / Repair |
|---|---|---|---|
| Best | Works, good condition | Assembled | Done |
| Middle | Partly usable | Sold in the box | As is |
| Worst | Does not work | Broken or missing parts | Not fixable |

- **Worst starts at $0 and is typed, never a percent** (his broken-TV point).
- **Spend limit worked out for them:** "At stake: $80. Do not spend more than $40 in time and parts."
- A note and photos. Inspect alone needs no prices: the item comes back to the processor to price.

### 2. Restoration answers with an outcome, not a price
- On the bench: do the ticked steps, then tap Best, Middle, Worst or Salvage. The price comes from the processor's numbers, the tag prints, the item goes to the shelf.
- After a failed Test the screen shows the choice: "Repaired $120, as is $0, spend limit $40", with Repair, Sell as is, Salvage.
- "None of these fit" sends it back to Processing.

### 3. Salvage page
"Salvage this item", how many parts (1 = the whole item). Each part: a name and one of the five endings. 1 and 2 make a new item linked to the original (price may be left for Processing); 3 goes to the parts stock; 4 takes pounds and type; 5 a description, pounds optional. A Salvage report totals all five by count, dollars and pounds.

### 4. Pages
- Processing: its own page (proposed name **Restoration orders**; tabs Sent, Back to price, Done).
- Restoration keeps Queue, Bench, Hold, Finish, with the order at the top of every job.

### 5. Build order (each shipped alone, after Bill picks)
1. Order form on every send button + the Processing page. 2. Bench outcomes, spend limit, automatic price. 3. Salvage page and report.

## Open questions for Bill (unanswered)
1. Three prices per order, worst starts at $0?
2. Restoration's outcome sets the price and the item goes straight to the shelf?
3. Spend limit = half of (best minus worst)?
4. Page name "Restoration orders"?

## What exists today (starting points, not verified in depth)
- Send surfaces: `pages/inventory/processing/ProcessingSendToRestorationDialog.tsx`, `pages/inventory/restorationRequest/` (RestorationRequestDialog, RestorationRequestFields: needs, a done price, as-is prices filled from settings percentages), `pages/inventory/reentry/ReentryActionPanel.tsx`, `pages/inventory/restorations/` (RestorationsPage: To setup, From decision), `pages/restoration/queue/RestorationAddToQueueDialog.tsx`.
- Restoration: `pages/restoration/` (queue, bench, parts, tag, tars, tracking).
- Models in `apps/inventory/models.py`: RestorationJob, RestorationAction, RestorationOutput, RestorationTimelineEvent, RestorationPart, RestorationPartsOrder(+Line), RestorationGradeScale. `Item.parent_item` exists.
