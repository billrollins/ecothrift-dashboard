# Processing quick wins and three Truck Prep versions (owner, 2026-11-24 evening)

Bill's order, approved 11-24 about 6:15 PM ("good get it all done"). Four subs work overnight; Mainline coordinates
(`.ai/comm/RUNNING-NOW.md`). Dash rows: #223 and #224 (Processing), #225 Steps, #226 Grid, #227 Target (Truck Prep).

## Bill's words: Truck Prep

"ALL to try to do Preprocessing/Truck Prep from start to finish. I want 3 different versions. the new one is too trust
me bro. I like steps and data tables and just the ability to see all and have strong batch processing functions. i like
hitting a global target seeing outliers. I like standard fixes that are programatic but i also like some standard
functions for AI or custom AI. the UI AI needs to be fully robust enough to handle most of my issues. this is all built
local as I want to be able to FULLY test 3 versions in the morning. do NOT skimp out on this".

Later: "have truck Prep incorporate some things ... THEN update prep again to make use of any enhancements from truck
prep. we can Also consider a prep or Overnight run that goes at night on Heroku that might take a bit longer."

## Bill's words: Processing

"i am not looking for a redesign but performance updates, standardizations, FAST Quality of life items.

1. if search is on a filter and I am in a manifest row detail and i type something in search it will say no items that
match (when there are just not on the filter I can't see...) stupid. also search enter should pop up results not stay
in the manifest row detail
2. there is a SUPER annoying tug/pull with Checkin Items and the manifest row when comes to retail/price lock % etc.
AND especially when using part or set.

Fix: Setting manifest row retail or price will change the default on check in for FIRST check in. All subsequent
check-ins for that product for that manifest line will use the last check in values

when update retail on checkin/product AND product is NOT set or parts, then red line up (does not match manifest line
update that now?) but more succinct essentially alert its differ and can set right there

As for products that are sets or parts or versions of others this needs a LOT of work.

Product (make duplicate but different counts) not sure in the back end how you want to handle that. BUT in UI. Click
that button. Say the number you want (and it will start with the Qty in the base one)

So product is (Pack of 100) *click make new qty* it auto populates Current product (100) and you can change and be
like no... it was really 10 that was a typo (it might then ask if you want to update the product details yes/no) BUT it
is scaling stuff based on the 10 you enter. Then you say I want pack of 10. or something

NOW we want to standardize how we say stuff like that. For example there were boxes of tampons and they each had say
100 but then there was a pack of 3 boxes. So in title and in the product details it would be nice to be able to have a
standard way to record that.

then in this Make more. it can quickly type what the base product is, and what product you want to create. and then
they will be linked in some ways.

So I can go from 6 different products of 100 tampons and create 3 boxes of 200 if I really wanted to in a couple
clicks.)

we are going to eventually do a product hygiene daily or weekly run that fixes all that kind of stuff so we have a
"BASE" product that then creates more. but for now i just want to build FAST. As far as retail/price this scales based
on the base number... so if 100 tampons is $1 then 3 box set of 200 is $6. that is to simply get the scale close so
user can set prices however (and retail) upon setting this had NO impact on other check-ins etc

next the likely products are virtually worthless. that are SOO in the way visually. I HATE them.

to go from: open manifest detail row and do these next things FAST/INSTANT would be incredibly helpful (eventually truck
prep might help by teeing up options to give processor 1-click decisions) But for now

Manifest row, User might want to search this immediately the magnifier is ok. but... something like toggle on the top
header or action toggles drawer or something that says open vendor page with search on every manifest detail freshly
opened. or you could have a button click to open with search tabs or something.

then if there are likely products I want to know does the AI think it IS the product or just like it. so possibly just
do something (out of the way somehow)

AI thinks its this product (98%; 80%) or something; open all likely

but that has NO impact on product search OR on Products Attached.

so three NOT competing product areas:
attached
likely (i want closable like user say NO this is not the product)
search (needs to be FAST FAST FAST FAST FAST) and robust like very easy to see etc.

then 3rd is to Create a product if no exists. to do this use everything from manifest (maybe pre-done via truck prep)

users EASIEST way is to see Vendor Page for Item (vendor or google search on item search tags (AI should provide these
on truck prep) then user sees on vendor page or google page search results. Title and photo are what do it for
processor in seconds. can scan a page of 30 candidates and decide in like 2 seconds. but if has to manually type and
navigate web pages takes minutes.)

then if they find a product page they can copy paste all text into AI to have AI Create the new product."

## The shared contract (Mainline's call, so all four subs match)

**Pack wording, one standard.** A product has a *base unit* and a *pack*: `count per unit` × `units in the pack`.
Written in titles and details as `3 boxes × 100` (units first, then count per unit; a single unit is just `100 ct`).
Stored as numbers, not parsed from the title: `unit_count` (100), `unit_name` ("box", optional), `pack_units` (3), so
total pieces = 300. A pack product links to its **base product** (the single unit). Price and retail of a new pack
start at `base × total pieces / base pieces` and are free to edit; nothing else changes.

**What Truck Prep hands to Processing, per manifest line** (each version produces these; Processing uses them when
present and works without them):
- `search_tags`: the words to search a vendor site or Google with (brand, model, key noun, size).
- `product_match`: a product id, with `kind` = `is` (the same product) or `like` (similar), and `confidence` 0 to 100.
- `product_draft`: title, brand, category, retail, pack fields, photo URL, for "create a product" in one click.
- `price`, `retail`, `pieces`, and the reason for each in a few words.

**Every AI action, in every version:** shows what it will change before it changes it (preview, then apply), can be
undone, and shows the model, the time it took and what it cost. Standard actions are buttons; a custom prompt runs on
any selection of lines. A programmatic fix is used wherever a rule does the job.

## Truck Prep: the three versions

Same engine, same trucks, three ways of working. Each is its own Django app with its own tables and its own page, so
all three can be tested on the same truck without touching each other or the real manifest rows. Nothing ships;
"Send to Processing" is a dry run that shows what it would write.

- **A. Steps** (#225, app `prep_steps`, page `/prep/steps`): Load → Clean → Match products → Category → Retail → Price →
  Packs → Send. One full-width sortable table per step, before and after side by side, a header that says what ran (code
  or which AI), how many lines changed, time and cost. Batch buttons on the selection. Nothing moves on until Next.
- **B. Grid** (#226, app `prep_grid`, page `/prep/grid`): one sheet of every line and every field. Sort, filter, group,
  select many, fill down, bulk edit. Run a standard fix or an AI job on the selection or a whole column, preview, apply.
  Saved views: outliers, no product, no retail, packs.
- **C. Target** (#227, app `prep_target`, page `/prep/target`): set the truck's targets first (tag % of retail by class,
  total recovery). Rules price everything. The screen shows the totals against the target and a queue of outliers,
  biggest money first, each with one-click fixes and "apply to all like this". The full table sits underneath.

Useful code to read, not to depend on: the parked #189 work on branch `claude/heuristic-cartwright-794350`
(`apps/concierge/`, report `.ai/reference/reports/2026-11-24-truck-prep-parked.md` on that branch: Bill's nine review
points, the per-step time and cost of his Walmart run). Test trucks in `local_shared`: orders 461 (Walmart, 1,155
lines), 464, 465 (Wayfair, 66 lines), 421.

## Order of work

1. #223 ships tonight, then #224. 2. The three Truck Prep versions build all night, local. 3. Morning: Bill tests the
three, picks; the winner is wired into Processing and the overnight Heroku run is planned around it.

## 2026-11-25 morning: what the processors want fixed (Bill, to the #223 session)

His words, whole:

> turn on the product photo in search; i dont care.
>
> NExt i talked with processors here is what they do not like nad need fixed ASAP. this needs build/ship deploy FAST.
>
> 1. Product likli is an extra click. They dont like that
> 2. Checkin Area gerts WAY too much space (4-lins with vert scroll when needed is plenty)
>
> SO condense the bottom check in area and have LEFT/RIGHT areas devodted to attached produces (left) and likeli
> products on the right. Each with as many visible lines as fit and they are static so if empty they still hold a
> fixed height.
>
> the search can be at the top across both and is fine as is.(with a pop over result set)
> Also stats per list or per check in are good
>
> top of attached product (left) # products, Total Number checked in
> per check in line. # checked in etc
>
> top of liklely Color coded green YES this is it; Yello MAybe.... Or grey Probably not.
>
> 3. Create product details: "Fill in the product details below, then save to create. Enter saves · Esc cancels."
> move the Paste the Product page below the Product details, this is optional or secondary.
> Also need EASY ways to clear Product details or the Product page (clear buttons)
> Also Product page buttons are: Clear, Fill, Clear then fill (on enter; when focus is in product page box)
> AI buttons would be all together (include Duplicate)
> AI request should be a box that does AI suggest with a user prompt from the box.
> and Duplicate can be duplicate with AI that uses the AI box for duplicate instrecutions.
>
> 4. "Same product as row 65" is a blue note I get. Our rule of NO NOTifications that cause content to shift needs to
> be in force here. if you want you can star/badge/notficy on the attached product row something like that.
>
> 5. on manifest row details fields tab goes from left to right. enter ALSO does but confirms the update the
> cancel/approve buttons need to NOT shift the fields left/right but changing field dim (so you need to make fields
> wide enough to accomidate them) in general you should adopt a use the space rule and stretch Notes or other fields
> if screen is big enough to fill space.
> 6. a Tab after a change leave the field highlighted and a button at from or end of row says Apply changes or Cancle
> all changes
>
> In general a cntr z (undo last action) would be nice on this parge (and also a redo if accidental) can have a hot
> key hint so processors know they can undo.
>
> before build. sus out details and let me know if it all makes sensee and is doable

### What I found in the code and the data (11-25, nothing built yet but the photo switch)

- **Photo:** `product_find.SEARCH_SHOWS_PRODUCT_THUMB` is now True (his own exception to his 11-19 photo rule; staff
  screen only).
- **The row screen today** (`ProcessingActiveCard.tsx`): row header, Row details, a stack of blue notes (same
  product / sub row / split), Attached products (search and the folded Likely line inside it, 34% of the height at
  most), then Prior check-ins taking ALL the height that is left. That is his points 1, 2 and 4.
- **Likely colours need a stricter "yes".** On 200 real rows of order 428 (`workspace/p223/likely_bands.py`,
  `likely_green.py`; figures from the fresh production copy of 11-25 noon, the older copy gave 17 of 38): 7.7 likely
  products a row; the top line is 85%+ on 26 rows, 60 to 84% on 115, lower on 55, none on 4. Of the 38 different
  85%+ pairs, 18 name a different size or count ("Pampers Swaddlers Size 5" against
  "Size 4" at 99%, "AAA 8-Pack" against "AA" at 90%), because one-character words and numbers are not compared.
  Green must mean: the same code, or the same words AND the same numbers.
- **Row fields** (`ManifestField`): the box grows when it opens for editing (it adds the X and the tick), which
  moves the fields beside it; Tab already saves at once and opens the next field; Enter saves and stays. Tab from
  Price opens the Identifiers window. The row does not fill a wide screen (fixed widths).
- **Product window** (`ProductManageDrawer.tsx`): Duplicate (a plain copy, no AI) and Suggest (AI, no words from
  the person) sit apart at the top; the page box sits above the details. `POST /api/inventory/products/suggest/`
  takes `fields` and `context`; a request in the person's words is one more key in its JSON.
- **Undo:** `processing_row_patch` writes each field plainly, so putting the old values back is the same call. A
  check-in has its own Undo window (it asks move or delete, and says what blocks it). No new server code is needed.

### The plan (11-25; Bill: "Yes, build it" to "Build it this way, A then B, each shipped and deployed when tested?")

Dash rows: #229 = Release A, #230 = Release B. What Release A became is in `inventory-pipeline.md` (Item Processor
workspace, "The processors' fixes"). One change made while building it: green also needs the product's brand named on
the row (a different brand with the same words and size reads "Maybe · 84%").

Release A (the screen): search across the top; Attached (left) and Likely (right) side by side, fixed height,
always open; check-ins at 4 lines; counts on top of each list and per product line; green / yellow / grey with the
stricter green; every blue note becomes a chip in a fixed place; the photo.
Release B (keys and the product window): row fields on a grid that fills the width and never changes size; Tab
moves on and leaves a change highlighted, Enter saves, "Apply changes" / "Cancel all" in a kept slot; the product
window reordered with Clear buttons, the page's Clear / Fill / Clear then fill, one AI block with a request box
(Suggest and Duplicate use it); Ctrl+Z / Ctrl+Y with a hint.
My reads where his words left room are in `.ai/reference/owner-qa-log.md` (11-25 rows).
