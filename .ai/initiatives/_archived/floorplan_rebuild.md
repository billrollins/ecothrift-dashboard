<!-- Archived 2026-10-02: disposition=pending — written at the owner's request, not started. Resumes when the owner says "activate floorplan_rebuild" and answers § Owner decisions. -->
<!-- initiative: slug=floorplan-rebuild status=pending updated=2026-10-02 -->
<!-- Last updated: 2026-10-02 (written from the owner's five steps plus a first review of the plans; nothing built) -->

# Initiative: Floorplan rebuild

**Status:** **Pending.** Not started. No code, no production change, no plan edited.

**Objective:** The owner and Claude rebuild the Canfield floorplans from evidence instead of memory. Claude marks spots on a plan where it needs a photo or a tape measurement. The owner walks the store with his phone and fills them in. Claude uses that history to draw an accurate plan of the store as it is, then designs a better store and a better Processing Room on top of it.

**Compass:** this file is not the compass; `thrift_plus_rewards` stays the compass until launch (Tue 2026-10-20).

**The three plans at the end:**

| Plan | What it is |
|---|---|
| `Canfield - Main` | The store as it really is today: correct element types, measured, every room filled in |
| `Canfield - NEW` | The better store. A few versions, each as a tab, each with a scorecard |
| `PR - NEW` | The new Processing Room |

---

## Finish line

- In Dash, Floor → Floorplans shows the three plans above.
- On his phone, the owner opens a plan's Survey page, taps an arrow, takes the photo (or types the measurement), and it is saved against that plan, spot, direction, date and time.
- Any spot shows its full history of photos and measurements, oldest to newest.
- Claude can read that history and use it to change a plan or to propose a new element type.

---

## Out of scope

- Moving anything in the real store. This initiative produces plans; the owner decides what gets moved and when.
- Permit or architect drawings. These plans are for running the store.
- 3D views, and two people editing one plan at the same time.
- The inventory count app. Linking count Sections to floorplan zones is an idea for later, noted in Phase 4.
- `DH - Office` (a different location). It only benefits from the new element types.
- Any change to the register or to Thrift+.

---

## What exists today (reviewed 2026-10-02, local copy, read-only)

The floorplan editor is `apps/floorplan` plus `frontend/src/features/floorplan`. Read `apps/floorplan/README.md` first. Units are inches. The code in the main checkout matches `origin/main`.

The local copy holds plan edits up to 2026-09-25. **Check production before Phase 3** in case a plan was edited there since.

### The plans

| Plan (id) | Size | Contents | Note |
|---|---|---|---|
| Canfield - Main (1) | canvas 150 × 175 ft | 313 elements, 64 zones, 56 labels, 3 info blocks | Last edited 07-13. Three tabs |
| Final Design for PR/Rest (7) | 46 × 92 ft | 93 elements, 21 zones | A crop of Main: all 85 shelves sit exactly where Main has them |
| Final Design for Retail (8) | 95 × 62 ft | 65 elements, 8 zones | A crop of Main's front: 34 of 42 shelves match, about 8 moved in Kitchen |
| DH - Office (2) | 15 × 15 ft | 15 elements | Location "Eco-Thrift Main" |
| AI Plan (3), Canfield - Redesign (4), Canfield - AI (5, 6) | | | Deleted (soft). Copies of Main |

### The building as drawn in Canfield - Main

- Outer walls: 135 ft 5 in wide × 147 ft deep. Not yet checked against a tape.
- Back strip along the top, about 20 ft deep: **nothing is drawn in it** except doors and one trash can. A 48 in door and a 96 in door are on the back wall (the 96 in one is probably the dock door).
- Two small rooms at the top left (about 8 × 8 ft and 11 × 10 ft): no name, nothing inside. Probably restrooms.
- West strip, 12 ft wide, top to bottom: Staff Break-Room, Restoration (12 × 42 ft), Processing Room (PR) (12 × 19 ft), Testing Room (12 × 16 ft), Main Office, Secondary Office, Office Break-Room, Security Room. **No walls are drawn between Restoration, PR and Testing**, only coloured zones. Every room is empty.
- Sales floor: about 123 × 127 ft. Two double-door entrances on the bottom wall. Two registers, six glass cases and the counters in the bottom centre.
- North arrow is turned 180° (the front of the store would face north). Not verified.
- Title block: "Basic Floor Plan as of July 2026", dated 7/2/2026.

### Fixtures as drawn (Canfield - Main)

| Type | Count | Note |
|---|---|---|
| Gondola shelf (4 × 4 ft) | 118 | 5 have no picture |
| Gondola half-shelf (4 × 2 ft) | 124 | 2 are 3 ft wide |
| Wall segment | 33 | 872 ft in total; all 6 in thick; 9 have fractional sizes such as 101.5 in |
| Door | 16 | One type for everything: 30, 36, 40, 48, 60 and 96 in |
| Checkout counter | 7 | Odd sizes: 63.7 × 30, 30 × 30, 72 × 26.7 in. 4 have no picture |
| Glass case | 6 | All 2 × 6 ft; the type's default is 2 × 4 ft |
| Generic rectangle | 4 | The four "Corner Blocker" squares; 3 still say "Generic rectangle" |
| Register 2, Cart corral 1, Trash 1, Column 1 | | The cart corral is 27 × 77.8 in |

---

## Phase 1 findings so far: what to add, change and remove

This is the first pass. Phase 1 finishes it with the owner.

### Element types (31 in the list; Main uses 11)

**Change**
- `gondal-half-shelf`: the name reads "Gondal half-shelf". Rename to "Gondola half-shelf". The slug stays (it is locked because plans point at it).
- `er-pallet-rack-green-add-on`: the name is "er⇥Pallet rack (green) - add-on" (a stray "er" and a tab). No plan uses it, so delete it and make it again with a clean slug.
- `trash-can-rollout`: its category is "mis". Move it to "Misc".
- `worktable` (24 × 24 in) and `computer`: lowercase names. Rename; "worktable" also needs a real size in its name, next to "Work table 4x8".
- `glassCase`: default 24 × 48 in, but all six real ones are 24 × 72 in. Change the default.
- `cartCorral`: default 48 × 120 in, drawn at 27 × 77.8 in. Measure the real one and fix the default.
- `column`: default 12 in, drawn at 18 in. Measure.
- `checkoutCounter`: one stretchy type is standing in for three real counter pieces. Measure them and make one type per piece.
- `rackRound`: the only built-in with no picture.
- `trash` and `trash-can-rollout` overlap. Keep one, or name them clearly apart.

**Add** (candidates; photos confirm which are real)
- Doors: double door, overhead / dock door, emergency exit. One "Door" type now covers 30 in to 96 in, and no door shows which way it swings.
- Walls: an interior partition wall thinner than the 6 in outside wall.
- Rooms: toilet, sink, desk, chair, table. (`DH - Office` uses a cart corral as a chair, a bookcase as a sink, a column as a table and a checkout counter as a desk.)
- Sales floor: endcap, pegboard or slatwall section, dump bin (the "Dump Bins" area has none drawn; `binTable` exists and is unused), furniture floor pad, the corner blocker as its own type.
- Service: Thrift+ signup spot, customer price scanner, time-clock kiosk, online-order hold shelf.
- Back room: wire shelving, gaylord or tote, pallet jack parking, label printer station, testing bench with power, dumpster or baler.
- **Security and safety (a new category):** camera with a direction and a view cone, convex mirror, alarm panel, motion sensor, safe, fire extinguisher, exit sign, first-aid kit, electrical panel.
- Utilities: outlet, network drop, Wi-Fi access point.
- Signs: hanging department sign, poster frame (the three Thrift+ posters, 13 × 19 in), AS IS sign.

**Remove:** nothing yet. Unused built-ins (clothing racks, display table, fitting room, window, bookcase, wall shelf) stay until the photos show whether the store has them.

### What the editor itself is missing

These are features, not element types. Each one is decided when its phase needs it.

- Rotation is 90° steps only. A camera or a photo arrow needs any angle.
- No named fixtures. All 313 elements carry their type's default name ("Gondola shelf" 118 times). There is no aisle or bay number to point at.
- Zones and their names are separate objects. See below.
- No layers to show or hide (structure, fixtures, departments, security, survey).
- No dimension lines. `DH - Office` fakes them with text labels (`11' 10"`).
- No door swing, no wall joins.

### Canfield - Main contents

- **The three tabs are the same layout.** "1", "Davids Design" and "Carries Design" have all 313 elements in identical positions. The only difference: "Carries Design" has 56 department zones and 56 name labels on top. Keep one tab.
- **55 of 64 zones have no name.** The department name is a loose text label floating over the zone. One zone is named "Zone". Move each name into its zone so a program can read which area is which.
- Spelling: "Otudoor", "Work 0ut", "Office Euipment". Stray spaces or line breaks: "Party ", "Bike Accessories ", "Appliances" (starts with a line break).
- Repeated department names: Appliances × 3 (plus Small Appliance), Clothing × 3, Seasonal × 2, Lamps × 2. Photos tell whether these are real or drafting leftovers.
- Department names do not match the product categories in `extended/product-taxonomy.md`. Map them in Phase 4.
- 7 pairs of fixtures overlap (5 gondola on half-shelf, 1 glass case on counter, 1 half-shelf on half-shelf).
- Furniture (33 × 45 ft) and the Clothing areas have no fixtures drawn.
- Every element is locked.
- The back strip, both small rooms and all eight west rooms are empty (see above).

### The other plans

- The two "Final Design" plans are crops of Main, not new designs. Owner decides: starting points, or delete (see § Owner decisions).
- The four deleted copies can stay deleted.

---

## Phases

### Phase 1 — Review every element (add, change, remove)
A written, agreed list of every element type and every part of `Canfield - Main` that needs adding, changing or removing.
**Gated by:** none. No ship needed for the list itself.

Acceptance:
- [ ] The findings above are checked against production (the plans may have changed since 09-25).
- [ ] Every one of the 31 element types has a verdict: keep, change (how), or remove.
- [ ] The list of new element types is agreed with the owner, split into "needed for the as-built plan" and "needed for design".
- [ ] The cleanups that need no photo are done and approved: renames, the "mis" category, the bad pallet-rack type, typos, one tab, zone names moved into zones.
- [ ] The editor features above each have a verdict: build in Phase 2, build later, or skip.
- [ ] A first list of photo spots and measurements for Phase 3 is drafted.

How changes reach production: element types and plan documents are data in the production database. Claude stages them as Requests and the owner approves them in Dash → Requests. Each plan change keeps the old version (a copy, or the tab left in place) so nothing is lost.

### Phase 2 — Photo and measure requests (the Survey)
Claude marks a spot and a direction on a plan; the owner taps it on his phone and takes the photo or types the measurement; every capture is kept with plan, spot, direction, date and time.
**Gated by:** none. Can be built while Phase 1 is reviewed. Needs one ship and one deploy.

Design:

- **A spot** belongs to one plan. It has a position (inches, same as the plan), a direction (any angle, 0 = toward the top of the plan, clockwise), a short code (`P-014`, `M-007`), a type (photo or measure), what Claude wants to learn ("the ceiling above the registers, I am looking for cameras"), a framing hint (wide, detail, ceiling, floor), and a status: open, done, skipped, dropped.
- **A measure spot** also has a second point. The plan shows the line between the two. The phone asks for feet and inches. The plan's own length for that line is saved next to the owner's number, so the gap is visible.
- **A capture** is one photo or one number for a spot. It keeps who, when (server time and the phone's time), an optional note, and the plan's revision at that moment. Captures are never overwritten. A done spot can be shot again any time; that is how the before-and-after history builds up.
- **Skipping:** "can't reach it" or "not there" with a short reason, so Claude learns from that too.
- **Storage:** spots and captures are their own tables in `apps/floorplan`, not inside the plan document. A phone upload must never collide with someone saving the plan in the editor. Photos go to the S3 bucket through the existing private-file helpers (`apps/core/files.py`, `S3File`), read only by signed-in staff. The current floorplan images live inside the database at up to 512 KB each; phone photos are several MB, so they cannot go there. Each photo is turned upright, shrunk to about 2,560 px on its long side, and given a small thumbnail (the listing-photo service already does this kind of resizing).
- **Phone page:** a new page, `/floor-ops/floorplans/:id/survey`. The editor is desktop-first and stays that way. The page shows the plan (read-only, pinch to zoom) with numbered arrows, and under it the open spots as a list in walking order. Tap one: the instruction, then a big "Take photo" button that opens the phone camera. After upload it moves to the next spot. Model it on the inventory count page, which is already phone-first. If the back of the store has weak signal, reuse the count page's catch-up-later queue.
- **In the editor:** a Survey layer that shows the arrows; a manager can add a spot by hand; clicking a spot opens its history (photos in time order, who, when, the measured number).
- **How Claude adds spots:** as a staged Request the owner approves in Dash → Requests, like other production data.
- **How Claude reads the results:** a read-only export of a plan's spots and captures (a list plus short-lived links to the photos), saved into `workspace/floorplan/survey/`. This is a read from production, so it needs the owner's standing OK (see § Owner decisions).
- **Who may capture:** managers and up to start. Two new entries in the capability list.
- **Privacy:** photos may show customers and staff. They stay private (never public links). Best taken before opening or after closing. Read `extended/thrift-plus-legal-memo.md` (photos, privacy) before the build.

Acceptance:
- [ ] Claude stages 3 test spots (2 photo, 1 measure) on a test plan; the owner approves them; they appear as arrows on his phone.
- [ ] The owner taps a spot, takes a photo, and it shows in that spot's history with the date, time and his name.
- [ ] A second photo on the same spot adds to the history; the first one is still there.
- [ ] A measure spot accepts feet and inches and shows the plan's number beside it.
- [ ] A skipped spot keeps its reason.
- [ ] Claude can pull the photos and numbers for a plan and open them.
- [ ] Photos are not reachable without a staff sign-in.
- [ ] Tests for the new API pass; the floorplan test suites still pass; nothing in the editor's save path changed.

### Phase 3 — Rebuild `Canfield - Main` as it really is
An accurate, complete plan of today's store, built from the survey.
**Gated by:** Phase 1 and Phase 2.
Detail when Phases 1 and 2 are built. Thinking so far:

- **Measure the shell first:** the four outside walls and both diagonals (the diagonals show whether the building is square). Then each room, each door's distance from a corner, the columns, then the fixture runs.
- **Shelves are 4 ft modules.** Count sections in a photo and measure where the run starts; do not measure every shelf. Measure the aisle widths.
- A rough size for the first walk: 60 to 90 photos and 40 to 60 measurements, about an hour. This is an estimate.
- A laser distance measure makes the long walls a one-person job. It is the one thing worth buying.
- Build in a copy and swap names at the end, so the July plan stays as history.
- Fill in what is empty now: the back strip, the two small rooms, the eight west rooms, Furniture, Clothing.
- Give fixtures real names (aisle and bay) so photos, the count and the plan can all point at the same shelf.
- Record for every measured line: plan before, measured, plan after.

### Phase 4 — `Canfield - NEW`: a better store, in a few versions
Two or three thought-out layouts, each a tab in one plan, each with a scorecard, so the owner can choose.
**Gated by:** Phase 3.
Detail when Phase 3 is built. Thinking so far:

- **Work only with real fixtures.** The as-built plan gives the count (about 118 gondola sections, 124 half-shelf sections, 6 glass cases). A version that needs more says so, with the number.
- **Customer path:** an open area inside the entrance, one clear main loop, checkout seen from the entrance, tall fixtures on the walls and low ones in the middle.
- **Aisles and exits:** at least 36 in everywhere, wider where carts pass; clear paths to every exit; 36 in clear in front of electrical panels.
- **Security:** what each camera sees and where the blind spots are; high-value goods and glass cases near the registers; staff-only doors; the path cash takes to the office. 18+ graphic items stay separate and out of view (legal memo).
- **Space by sales:** sales and sell speed per department against the floor area it has now. This uses the local warehouse; name the data-quality register IDs when it is built. Map floor departments to the product taxonomy first.
- **Thrift+:** where signup happens, where the three posters hang, where a customer scans a tag.
- **Operations:** dock → Processing Room → testing and restoration → floor, and the cart route between them. Zones could become the inventory count's Sections.
- **Scorecard per version:** shelf feet per department, narrowest aisle, camera coverage, number of fixtures that must move (the cost of the change).

### Phase 5 — `PR - NEW`: the new Processing Room
A layout for processing that follows the work: pallet in, sort, test, process and label, cart out.
**Gated by:** Phase 3. The owner's order puts it after Phase 4.
Detail when Phase 3 is built. Thinking so far:

- Today the PR is drawn as an empty 12 × 19 ft zone with no walls of its own.
- The element types for it already exist and no plan uses them yet: pallet racks, work tables, workbench, computer, platform truck, shopping cart, rollout trash.
- Design from the stations: where a pallet lands, the sort table, the processing computer and label printer, the testing bench with power, where full carts wait.
- Size it from real throughput (items processed per day).
- First question: which space is it? (See § Owner decisions.)

---

## Owner decisions (answer these to start)

1. **Production check.** Has any plan been edited in production since 09-25? If yes, Phase 1 starts with a fresh pull (needs the owner's go).
2. **The two "Final Design" plans.** They are crops of Main. Use them as starting points for `PR - NEW` and `Canfield - NEW`, or delete them and start from the rebuilt Main? Claude's pick: delete; start from the rebuilt Main.
3. **What `PR - NEW` covers.** The 12 × 19 ft Processing Room only; the whole west strip (Restoration, PR, Testing); or a move into the back strip?
4. **Reading survey photos from production.** A standing OK for Claude to pull a plan's photos and measurements whenever it works on this initiative.
5. **When.** Phase 1 needs no ship. Phase 2 needs a Mon to Thu ship slot. Before launch it competes with launch fixes; 10-16 to 10-19 is a freeze. Claude's pick: Phase 1 now, Phase 2 shipped in the first slot after launch (from 10-21), unless the owner wants the survey sooner.
6. **Tabs.** Keep one tab on Main and drop "Davids Design" and "Carries Design" as names (the layouts are identical)?
7. **Laser measure.** Buy one before the Phase 3 walk?

---

## Notes for whoever picks this up

- Build from a worktree off `origin/main`. The main checkout is behind (`comm/RUNNING-NOW.md`, standards row T55); never ship from it.
- Tests: `pytest apps/floorplan` and `npx vitest run src/features/floorplan` (see `scripts/dev/lean_test.py` for the area names).
- A plan can be exported and imported as a JSON or YAML file (`frontend/src/features/floorplan/planFile.ts`). That is the easy way to hand a whole drafted plan to the editor.
- The existing "Adjust with AI" tool (`apps/floorplan/ai.py`) proposes plan edits inside a 25-second limit. It is for small edits, not for a rebuild.
- The scripts that produced this review are in `workspace/floorplan/` (`inspect_plans.py`, `analyze.py`, `render.py`, `check2.py`), with the drawings as PNG files. `workspace/` is scratch; re-run them if they are gone.

---

## Acceptance

- [ ] Phase 1: the checklist under Phase 1.
- [ ] Phase 2: the checklist under Phase 2.
- [ ] The three plans exist under their final names.
- [ ] Out-of-scope items stay out.

---

## Record

**2026-10-02 — Written as pending.** From the owner's five steps. Claude reviewed the plans and element types in the local copy and drew them; the findings are above. Claude added three things to the owner's plan: measure requests beside photo requests, photos in S3 rather than the database, and a separate phone page. Nothing was built or changed.

---

## See also

- Archive index: [`ARCHIVE.md`](./ARCHIVE.md)
- The editor's own initiative (completed): [`floorplan_builder.md`](./floorplan_builder.md), and [`ai_settings_floorplan.md`](./ai_settings_floorplan.md)
- Editor contract: [`apps/floorplan/README.md`](../../../apps/floorplan/README.md)
- Phone-first pattern to copy: [`inventory_count.md`](../inventory_count.md)
