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
