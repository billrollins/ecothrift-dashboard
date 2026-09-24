<!-- Last updated: 2026-09-23 (gold set and held-out set: rulings TAX-16 to TAX-46) -->
# Product taxonomy: the placement rulebook

**This is the one answer key** for "what category and subcategory is this?" and "what goes on the price tag?". The rules apply to every placer the same way: processors, rules, vectors, the Spark backfill, the gold set and code. When a placement is questioned, the answer is added here as a ruling. It is not settled in a chat, a prompt or code alone.

- Code must match this file:
  - names: `apps/buying/taxonomy_v1.py`, `frontend/src/constants/taxonomyV1.ts`;
  - B-Stock codes: `BSTOCK_CODE_TO_CANONICAL` in `apps/inventory/canonical_categories.py`.
- AI prompts (the Spark backfill, intake) and the gold-set rubric are built from this file. Paste the tables; don't paraphrase them.
- Initiative: [`product_intelligence`](../initiatives/product_intelligence.md). Data rules: [`data-quality.md`](./data-quality.md).

---

## How to place an item (in order)

1. **Buy-intent test:** place the item where a shopper would look for it, not by its material or the seller's label. A shower chair goes to Health, not Furniture, even though it's a chair.
2. **Rulings win.** If the item matches a ruling below, use it.
3. **Most specific category wins** over a general one: Automotive over Tools, Lawn & garden over Outdoor furniture.
4. **Sets:** place by the main piece. A lamp with bulbs is a lamp.
5. **Unsure between two:** pick one, set confidence to `low`, and let the review queue decide. If the review settles something new, it becomes a ruling.
6. **Mixed lots & uncategorized** is only for:
   - a real mixed lot;
   - a `vague title` item (see below).

   It is never for "hard to decide".

**Vague title:** the title names no product, for example "Amazing Clothing Item", "Books", "Hammer" or "Generic Storage Case".
- Flag it `vague_title`.
- A category is allowed when the title's noun is clear ("Hammer" goes to Tools, subcategory Hand tools).
- Never invent a brand or specs.

---

## Categories and subcategories

The web shop shows the first 19. Lawn & garden, Appliances, Arts & crafts and Automotive are internal until the owner adds them to the site.

| Category | Subcategories | Includes / excludes |
|---|---|---|
| Apparel & accessories | Women's · Men's · Kids' · Shoes · Underwear & swim · Bags & luggage · Jewelry & watches · Hats, belts & hair accessories | Luggage, luggage tags, adult backpacks and waist packs (TAX-36). Baby clothing to age 24 months goes to Baby & kids. |
| Appliances | Floor care · Fans & cooling · Heaters · Air quality · Laundry · Major & fridges | Vacuums, mops, fans, air coolers, humidifiers, HVAC filters; freezers, dishwashers, water dispensers, ice makers (TAX-17). Countertop kitchen appliances go to Kitchen. |
| Arts & crafts | Paint & markers · Craft supplies · Yarn & sewing · Fabric · Kits · Scrapbook & paper · Craft storage | Craft paint, hot glue, fabric by the yard, fiber fill. Kids' craft kits for play go to Toys › Arts & crafts kits. |
| Automotive | Fluids & oil · Car care & cleaning · Tire & air · Interior accessories · Tools & parts | Motor oil, tire inflators, valve caps, car-only mounts. |
| Baby & kids | Diapers & wipes · Feeding · Nursery & swaddles · Gear · Kids' backpacks & lunch · Baby toys | Diaper rash cream, breast pump parts, high chairs, nap mats. Baby toys up to 24 months; older kids' toys go to Toys. Bottles go to Kitchen (TAX-16). |
| Bedding & bath | Comforters & sets · Sheets & pillowcases · Pillows · Mattresses & toppers · Blankets & throws · Towels · Shower & bath accessories | Mattresses and protectors, bedskirts, bath rugs, toilet seats, bidets (TAX-26). Kids' bedding stays here. Decorative throw pillows go to Home décor. |
| Books & media | Fiction · Kids' books · Manga & comics · Nonfiction · Movies & music · Video games | DVDs, Blu-ray, vinyl, game discs (TAX-18). Consoles and headsets go to Electronics. |
| Electronics | Cables, chargers & power · Phone & tablet cases · Audio · Computer accessories · Smart home & cameras · Gaming · TV & mounts | Surge protectors (TAX-23), power banks, Toniebox, remotes, tabletop TV stands. |
| Furniture | Tables · Seating · Desks · Beds & frames · Storage furniture · Kids' furniture · Covers, pads & parts | Chair pads, slipcovers, replacement legs, office chairs, floor TV consoles (TAX-30). Outdoor pieces go to Outdoor & patio. |
| Health, beauty & personal care | Skin care · Hair care · Body wash & soap · Oral care · Shaving · Makeup · Deodorant · Incontinence & wellness · Vitamins & supplements · OTC & first aid | Hair tools (TAX-21), makeup mirrors, shower chairs and mobility aids (TAX-32). Hair clips and headbands go to Apparel. |
| Home décor & lighting | Wall art & frames · Mirrors · Lamps & lighting · String & LED lights · Throw pillows · Artificial plants · Candles & fragrance · Curtains & blinds · Indoor rugs · Decorative accents | Fixtures, bulbs, night lights (TAX-20, TAX-34), diffusers, curtains and rods, decorative trays and boxes. Woven storage baskets go to Storage (TAX-39). |
| Household & cleaning | Cleaners · Cleaning tools · Wipes · Trash bags · Trash cans · Laundry care · Air fresheners · Pest control · Paper goods | Dish soap, steel wool (TAX-22), trash cans (TAX-33). Cleaning machines go to Appliances. |
| Kitchen & dining | Small appliances · Cookware & bakeware · Tools & gadgets · Drinkware & bottles · Dinnerware · Food storage & lunch · Disposables · Pantry & grocery | Kettles, microwaves, French presses (TAX-37), every bottle and tumbler (TAX-16), tablecloths and placemats (TAX-28), adult lunch bags, food. Party-themed tableware goes to Party. |
| Lawn & garden | Seed & soil · Planters · Hoses & watering · Hand tools · Power equipment · Grills & fire pits · Pool & spa | Loppers, chainsaws, trimmers, pellets, griddles, fire pits (TAX-01), outdoor topiaries and statues (TAX-27), torches, pool vacuums. |
| Office & school supplies | Notebooks & paper · Pens & pencils · Planners · Cards & stationery · Desk supplies · Desk organizers · Mailing & labels | Greeting cards, staples, cardstock, mailers, pricing stickers. |
| Outdoor & patio furniture | Chairs & benches · Tables · Cushions & pillows · Umbrellas & bases · Outdoor rugs · Deck boxes | Outdoor rugs and outdoor throw pillows. |
| Party, seasonal & novelty | Birthday · Holiday · Balloons & banners · Tableware · Costumes · Gifts & novelty · Flags | All holiday décor: trees, garland, ornaments, holiday pillows and runners (TAX-14). |
| Pet supplies | Dog · Cat · Food & treats · Litter & pads · Health & grooming · Beds, crates & gates · Toys · Collars & leashes | Pet stain cleaners, feeders, carriers, dog wraps, pet gates. |
| Sports & outdoors | Camping · Fitness · Team sports · Bikes & scooters · Water & float · Coolers · Hunting & fishing | Tents, air mattresses (TAX-04), canopy weights (TAX-29), bike helmets and locks, trampolines (TAX-31), swim aids (TAX-35), walking pads. |
| Storage & organization | Bins & totes · Laundry baskets & hampers · Hangers · Closet · Garage & wall · Vacuum bags | Shelving units, shoe racks, fridge and pantry bins (TAX-24), moving bags. Outdoor deck boxes go to Outdoor & patio. |
| Tools & hardware | Hand tools · Power tools · Paint & supplies · Plumbing · Electrical · Fasteners & hardware · Locks · Pressure washers | Hand trucks, sealants, spray paint, toilet flappers and flanges. |
| Toys & games | Figures · Dolls & playsets · Plush · Board games & puzzles · Building sets · RC & vehicles · Electronic & light-up · Pretend play · Arts & crafts kits · Outdoor & ride-ons · Collectibles · Learning | Pokémon, Funko, Doorables, sticker packs, kids' wagons, pogo sticks, water balloons, ball pits. |
| Mixed lots & uncategorized | none | Only as described in **How to place an item**. The goal is under 10% of sales. |

---

## Rulings

Add one row whenever a placement is questioned and settled: by the owner, by a review, or when a model and the gold set disagree. Number rows in order, and never reuse a number. When a ruling changes, strike the old row and add a new one that points back to it.

| ID | Item | Goes to | Not | Why | Date / by |
|---|---|---|---|---|---|
| TAX-01 | Fire pits, grills, patio heaters | Lawn & garden › Grills & fire pits | Outdoor & patio | Outdoor furniture is for sitting and eating | 2026-09-23 draft |
| TAX-02 | Pressure washers | Tools & hardware › Pressure washers | Lawn & garden, Automotive | Tool aisle | 2026-09-23 draft |
| TAX-03 | Motor oil, additives, car cleaners | Automotive | Tools | Most specific | 2026-09-23 draft |
| TAX-04 | Air mattresses (any size) | Sports & outdoors › Camping | Furniture, Bedding | Buy intent: guests or camping | 2026-09-23 draft |
| TAX-05 | Wagons | Kids' (Step2, ride-on) → Toys; utility/folding → Lawn & garden | — | Buy intent | 2026-09-23 draft |
| ~~TAX-06~~ | ~~Water bottles: kids' licensed → Baby & kids~~ | replaced by TAX-16 | | | 2026-09-23 |
| TAX-07 | Fans, air coolers, heaters, humidifiers, HVAC filters | Appliances | Household | Machines, not supplies | 2026-09-23 (owner, categories) |
| TAX-08 | Vacuums, powered mops | Appliances › Floor care | Household | Machines, not supplies | 2026-09-23 (owner, categories) |
| TAX-09 | Countertop kitchen appliances | Kitchen › Small appliances | Appliances | Owner call | 2026-09-23 (owner, categories) |
| TAX-10 | Gaming consoles and accessories | Electronics › Gaming | Toys | Owner call | 2026-09-23 (owner, categories) |
| TAX-11 | Groceries and pantry food | Kitchen › Pantry & grocery | — | Owner call | 2026-09-23 (owner, categories) |
| TAX-12 | Jewelry | Apparel › Jewelry | — | Owner call | 2026-09-23 (owner, categories) |
| TAX-13 | Luggage, luggage tags | Apparel › Bags & luggage | Health, Sports | Seen misfiled in the sold sample | 2026-09-23 draft |
| TAX-14 | Christmas and other holiday décor | Party › Holiday | Home décor | Seasonal selling | 2026-09-23 draft |
| TAX-15 | Outdoor rugs | Outdoor & patio › Outdoor rugs | Home décor | Most specific | 2026-09-23 draft |

| TAX-16 | All water bottles and tumblers, kids' included (Owala Kids, Minecraft, Thermos Funtainer) | Kitchen › Drinkware & bottles | Baby & kids, Sports | One aisle for bottles; replaces TAX-06. Only sippy and training cups go to Baby › Feeding. B-Stock's own columns say TABLETOP / "Tabletop & kitchen", though its category code often says OUTDOOR_SPORTS (292 vs 222 lines), so this ruling beats the code | **2026-09-24 owner** |
| TAX-17 | Freezers, dishwashers, water dispensers, ice makers | Appliances › Major & fridges | Kitchen | Floor-standing or plumbed | 2026-09-23 gold set |
| TAX-18 | Video game discs and cartridges | Books & media › Video games | Electronics | Media, like DVDs; consoles and headsets stay in Electronics | 2026-09-23 gold set |
| TAX-19 | Kids' licensed backpacks and lunch boxes | Baby & kids › Kids' backpacks & lunch | Apparel | Buy intent (school) | 2026-09-23 gold set |
| TAX-20 | Night lights, ceiling and vanity fixtures, pendants, sconces | Home décor › Lamps & lighting | Tools, Electronics | One lighting aisle | 2026-09-23 gold set |
| TAX-21 | Hair tools: dryers, stylers, straighteners | Health › Hair care | Appliances | Personal care | 2026-09-23 gold set |
| TAX-22 | Steel wool, scrub brushes, mop heads | Household › Cleaning tools | Tools | Cleaning use | 2026-09-23 gold set |
| TAX-23 | Surge protectors, power strips, chargers | Electronics › Cables, chargers & power | Tools | Electronics aisle | 2026-09-23 gold set |
| TAX-24 | Fridge, pantry and lid organizers | Bins → Storage › Bins & totes; baskets and lid racks sold as kitchen → Kitchen › Food storage & lunch | — | Low confidence: owner to confirm | 2026-09-23 gold set |
| TAX-25 | Lunch bags | Kids' → Baby & kids (TAX-19); adult → Kitchen › Food storage & lunch | — | Buy intent | 2026-09-23 gold set |
| TAX-26 | Toilet seats, bidet attachments, bath rugs | Bedding & bath › Shower & bath accessories | Tools (plumbing) | Bathroom aisle; flappers and flanges stay in Tools › Plumbing | 2026-09-23 gold set |
| TAX-27 | Garden décor for outdoors: topiaries, statues | Lawn & garden › Planters | Home décor | Outdoor use; indoor faux plants stay in Home décor | 2026-09-23 gold set |
| TAX-28 | Tablecloths, placemats, table runners (not holiday) | Kitchen › Dinnerware | Home décor | Dining table; holiday ones go to Party (TAX-14) | 2026-09-23 gold set |
| TAX-29 | Canopy weights, pop-up canopies | Sports › Camping | Outdoor & patio | Event and camping use | 2026-09-23 gold set |
| TAX-30 | TV stands and media consoles that stand on the floor | Furniture › Tables | Electronics | Furniture; tabletop stands and mounts go to Electronics › TV & mounts | 2026-09-23 gold set |
| TAX-31 | Trampolines; swing-set parts; ball pits | Trampolines → Sports › Fitness; swing bars and ball pits → Toys › Outdoor & ride-ons | — | Low confidence | 2026-09-23 gold set |
| TAX-32 | Shower chairs, mobility and medical aids | Health › OTC & first aid | Furniture | Health aisle | 2026-09-23 gold set |
| TAX-33 | Trash cans (any room), compost and food-waste caddies | Household › Trash cans | Kitchen, Storage | Next to trash bags | 2026-09-23 gold set |
| TAX-34 | Light bulbs | Home décor › Lamps & lighting | Tools › Electrical | Same aisle as TAX-20 | 2026-09-23 gold set |
| TAX-35 | Swim aids (floaties, puddle jumpers), pool noodles | Sports › Water & float | Baby & kids, Toys | Water aisle | 2026-09-23 gold set |
| TAX-36 | Adult backpacks, slings, waist packs | Apparel › Bags & luggage | Sports | Bags aisle; a seller's "Sports" label is wrong | 2026-09-23 gold set |
| TAX-37 | Manual coffee makers (French press, pour-over) | Kitchen › Small appliances | Tools & gadgets | Shelved with coffee makers | 2026-09-23 gold set |
| TAX-38 | Personal wipes (flushable, body, Dude Wipes) | Health › Body wash & soap | Household | Personal care; cleaning wipes go to Household › Wipes | 2026-09-23 held-out set |
| TAX-39 | Woven, seagrass and fabric baskets and crates | Storage › Bins & totes | Home décor | Storage use; décor trays and boxes go to Home décor › Decorative accents | 2026-09-23 held-out set |
| TAX-40 | Plain disposable cups, plates and napkins, any pack size | Kitchen › Disposables | Party | Only themed (birthday, holiday) goes to Party | 2026-09-23 held-out set |
| TAX-41 | Baby bottle parts, nipples, pacifiers, pump parts | Baby & kids › Feeding | Kitchen | Baby aisle | 2026-09-23 held-out set |
| TAX-42 | Electrolyte drinks, protein, supplements | Health › Vitamins & supplements | Kitchen › Pantry | Health aisle; food and snacks stay in Pantry | 2026-09-23 held-out set |
| TAX-43 | Kitchen and anti-fatigue floor mats | Home décor › Indoor rugs | Kitchen | Rugs aisle | 2026-09-23 held-out set |
| TAX-44 | Over-the-door and cabinet-door organizers (any room) | Storage › Closet | Kitchen | Refines TAX-24 | 2026-09-23 held-out set |
| TAX-45 | Team and sport socks, athletic apparel | Apparel (by who wears it) | Sports | Clothing aisle | 2026-09-23 held-out set |
| TAX-46 | Baby feeding items: disposable placemats, bibs, sippy cups | Baby & kids › Feeding | Kitchen | Baby aisle; beats TAX-28 for baby items | 2026-09-23 runner second opinion |

`draft` and `gold set` rows are proposed, and they apply until the owner overrides them. `gold set` rows were decided while hand-labelling the 300-product gold set (`workspace/gold/gold_labels.csv`).

**What the gold set showed about placement signals:**
- A V1/V2 product's current category is noise (register ITM-13). Never copy it.
- A manifest category code is wrong about 1 time in 16 (7 of 114 in the gold set, e.g. a lopper tagged TOYS, pellets tagged BABY_ESSENTIALS). Use it as a hint, not an answer.
- When a manifest already carries one of our category names, it is usually right, but a seller's department ("Sports & outdoors" on water bottles) loses to the rulings.

### Open questions for the owner

Rulings should match **where the store actually shelves things**, and the processors' categories are the evidence. Spark's backfill disagreed with the processors on 15% of V3 products (`workspace/backfill/check_vs_processing.py`, 2026-09-23). Most of those disagreements are these rulings:

| # | Question | Processors do | Rule now | Decide |
|---|---|---|---|---|
| ~~Q1~~ | ~~Bottles~~ | | | **Decided 2026-09-24: Kitchen (TAX-16).** |
| Q2 | Kids' trikes, stroller wagons, ride-ons (Radio Flyer, Razor) | Sports or Baby | Toys › Outdoor & ride-ons | Which aisle? |
| Q3 | Wheelchair ramps, back braces | Tools, Sports | Health › OTC & first aid (TAX-32) | OK? |
| Q4 | Air mattresses | Furniture | Sports › Camping (TAX-04) | OK? |
| Q5 | Kids' drones | Electronics | Toys | Which? |
| Q6 | TAX-24, TAX-27, TAX-31 (low-confidence rulings) | n/a | See the table above | Confirm |

---

## Price-tag short name

| Rule | Detail |
|---|---|
| Length | 28 characters at most; cut on a word boundary |
| Order | Brand (if known) + noun + one key spec (size, count, color or fit, whichever a shopper checks first) |
| Keep | Recognizable brands; size or count |
| Drop | Marketing words (Premium, Ultra, Heavy-Duty, Aesthetic), age ranges, compatibility lists, "Set of" and "Pack of" |
| Abbreviate | pk, ct, oz, qt, in, ft, gal, lb, Sz, Qn, Kg, Tw, PB (paperback), & |
| Store brands | Keep Threshold, Hearth & Hand, Pioneer Woman, Owala. Drop Mainstays, Room Essentials, Great Value, Equate, Pen+Gear when space is short. |
| Junk seller names | Never print them (AYKLCZUU, HTSQYL, GevGuxLuo): all-caps nonsense or a brand seen only on Amazon listings |
| Condition text | "(May Be Incomplete)" and the like become a flag, not name text |
| Color | Only when it drives the sale (apparel, décor, bedding) |
| Case | Title Case |

Examples (from the sold sample, 2026-09-23):

| Title | Short name |
|---|---|
| Arctic Air Tower+ Electric Portable Cooling Fan 4 Speed 103 CFM | Arctic Air Tower Fan |
| Neutrogena All-In-1 Acne Control Daily Face Scrub … 4.2 fl oz Pack of 3 | Neutrogena Acne Scrub 3pk |
| Full/Queen Geo Matelasse Comforter & Sham Set - Dark Olive Green | Full/Qn Comforter Set Olive |
| AYKLCZUU Dell 90W USB-C Laptop Charger Latitude 3400 … | Dell 90W USB-C Charger |
| Tupperware 6pc Wonderlier Bowl Food Storage Set Pink (May Be Incomplete) | Tupperware Bowl Set 6pc (+ flag) |
| Hefty Ultra Strong Tall Kitchen Drawstring Trash Bags Unscented 13gal 50ct | Hefty Trash Bags 13gal 50ct |
| Pampers Swaddlers Size 1 Diapers 198ct | Pampers Diapers Sz1 198ct |
| The Housemaid Movie Cover (Paperback) | The Housemaid (PB) |

Other profile fields (defined in `product_intelligence`):
- a **display title** of about 80 characters, cleaned, for online listings;
- a **price band**: under $5, $5–20, $20–50, $50+.

---

## Changing this file

- **Subcategories or rulings:** add or edit a row, and update the date at the top. There is no code change unless the change touches the B-Stock code map.
- **A new or renamed category:** needs the owner's approval, a migration (see `buying/0028`), and changes to `taxonomy_v1.py`, `taxonomyV1.ts` and `BSTOCK_CODE_TO_CANONICAL`. Then add a line to the Record in `product_intelligence`.
- **Any change** makes the gold set stale for the affected items. Note it here, and re-score those items.
