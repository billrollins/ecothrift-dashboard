<!-- Design language for the three Thrift+ posters. Owned by the master poster session ("Thrift+ Design"); poster sessions follow it and propose changes in 09-thread.md. Each new version is announced in the thread and messaged to every poster session. -->
# Thrift+ posters: design language

**Version 3.4 · 2026-10-15 · LOCKED: the owner approved the set for print (workspace/posters2/print/v4/)** (3.2 was the first approved set; 3.3 makes the title areas congruent, owner: "thought through and not necc identical but consistent or congruent from p1 to p3") (v1 was the morning's baseline; v2 adds the owner's 10-14 decisions, marked **v2**; 2.1 drops the money stack from posters; 2.2 sets the order of work and which part of the app each poster shows; 2.3: P1 is the scan of the toy truck; 2.4: P2 keeps the whole phone; 2.5: one app block, the same on all three; 2.6: no card at all; 2.7: the membership seal and the big MEMBER / NON-MEMBER labels; 2.8: "non-member" everywhere, the brush logo everywhere; **3.0: one template for all three posters**; 3.1: the QR above the phone, corner ribbons, the bottom cards' words; 3.2: the seal retired on all three, one code to act on per poster, the set approved and frozen). Details, history and the reasons behind each rule are in `08-design-rules.md`. The rulebook (`.ai/extended/thrift-plus-decisions.md`) wins on words and policy.

## The set
- Three 13 x 19 in posters hung in a row: **1 Meet Thrift+ · 2 Get ThriftBucks · 3 3-day returns**. They read as one wall: one sky across all three headers (`art/R/out/sky_trio.jpg`, shifted 13 in per poster), the same white app bar (Thrift+ left, Eco-Thrift right), the same footer.
- Each poster has **one job** and one hero. Attention order on each is planned (owner 10-14 for poster 2: what ThriftBucks are → guests don't get them → the scanning app).

## Layout
- Margins 0.7 in left and right; safe area 0.6 in (all text inside it). Title block from about 2.15 in; the footer rule at 16.78 in; the body sits between.
- Title: Manrope 800, 104 pt (`.h1.xl`), dark green, two lines at most; an optional line or pill above it; an optional one-line subline.
- Panels: white, 0.3 in corners, soft green shadow; green panels in member green with white type.
- **Footer, the same on all three:** four justified lines (11.5 to 15.5 pt, sized to the longest; keep the four within about 10% of each other in length) and the 1.06 in TERMS QR on the right. Line 1 is the terms line, line 4 the Spanish line; both are the same words on every poster.

## The poster template (v3.0, owner 10-15: "a consistent approach on all three posters. layout: L/R/Bottom... then the footer is always a bit of fine print plus spanish push to terms page and the terms QR")
Every poster has the same five zones (13 x 19 in). The master owns the geometry and the shared macros; each poster fills them in.

| Zone | Where | P1 Meet Thrift+ | P2 Get ThriftBucks | P3 3-day returns |
|---|---|---|---|---|
| **Header** | left column, from 2.15 in: an optional line or pill, the title (2 lines), an optional subline | "New at Eco-Thrift" · Meet / Thrift+ | Once you are a member · Get / ThriftBucks. | Thrift+ 3-day returns · Doesn't work? / Bring it back. |
| **Seal** | shared, automatic: x 5.42-7.28, y 2.02-3.88 (the owner's P1 spot, "on all three") | | | |
| **Right** | `app_block`: the QR row on a white plate at the top (x 7.7-12.3, y 2.05-3.35; v3.1, readable on P3's night sky), the phone under it (y 3.5-13.08) | `scan_truck.png`, the app overall: scanning | `tag_lamp.png`, the ThriftBucks | `tag_lamp.png` + the ring on the 3-day returns badge |
| **Zone L** | x 0.7-7.3, from `--zl-top` (just under the header) down to 13.18 in, level with the QR row's foot | the three steps (Membership, ThriftBucks, 3-day returns) | `s.compare(member, non)` | `s.compare(member, non)` |
| **Zone B** | full width, 13.55-16.5 in | the join steps: Start on your phone → Finish at the register | `s.bottom(boxes)`: the FAQ, the details moved out of the comparison | `s.bottom(boxes)`: the further details |
| **Footer** | `foot4`, unchanged | four lines of fine print, the Spanish push to /terms, the terms QR | same | same |

- **One code to act on per poster** (owner 10-15, after outside feedback: "I do not want information overload"), plus the small TERMS code in the footer. P1's is JOIN, so P1 turns off the app QR plate and the seal (`app_block(..., scan_qr=False, seal=False)`; its row 1 already says "Free and easy"). P2 and P3 keep both: the app QR is their code, and the seal is their only "free and easy" line. The phone stays in the same place on all three.
- **The app plate and the spotlight (v3.4, owner 10-15).**
  - The plate above the phone is small and centred (his pick A): the QR (0.74 in) sits in it with even margins, then one line, "Scan for the app", and the URL.
  - The phones show the app exactly as it is, re-shot 10-15 with its new top pill (12.40 ThriftBucks + the QR button).
  - P2 and P3 cover the screen with a dark mask (74%), all but a rounded window round the part the poster is about, edged in white: P2 the ThriftBucks band, P3 the 3-day returns badge. This replaces P3's ring (`app_block(..., spot=spots['tag_lamp']['band' or 'badge'])`; tag_shot.mjs writes the boxes beside each shot as .spots.json, so a re-shoot moves the window with the app).
- **The header block (v3.3): `s.header(kicker, title, sub, size, dark)`** on all three. It has a green kicker pill (P1 "New at Eco-Thrift", P2 "Once you are a member", P3 "Thrift+ 3-day returns"), a two-line title at the largest size that fits the left column (P1 80, P2 80, P3 70 pt: "ThriftBucks." and "Doesn't work?" set the limit), and a one-line 24 pt subline ("ThriftBucks, 3-day returns and more!" / "They grow as an item sits." / "Within 3 days, for any reason."). It is anchored at the bottom: every subline ends at 5.95 in, so zone L starts at 6.25 in on all three and the panels line up across the wall. P3's type is white on its night sky. The old seal rule is gone with the seal. A long title starts its lines lower or is set smaller; it never runs under the seal or into the phone.
- **`s.compare(m, n, top)`:** two stacked panels, each with its label as a **ribbon across the top-right corner** (v3.1, owner's markup: "use Non-Member like this... the labels across the corner seem to stand out more"): MEMBER (white ribbon on the green panel), **NON-MEMBER** (charcoal ribbon on the white panel; `who_non` = "Non-member"). The text sits bottom-left, clear of the ribbon. Each panel has one big line (Nunito 44 pt, one line, up to about 18 characters) and two short lines (19 pt, up to about 30 characters each). Keys: `{big, lines}`.
- **`s.bottom(boxes)`:** two or three equal white boxes. Each has a heading (21 pt, one line, up to about 19 characters; a question where it can be) and up to three lines (19 pt, **up to 24 characters each**; the build flags a longer line). Keys: `[{h, lines}]`. The boxes follow the order a shopper asks in, and never repeat what the panels above already say.
- **The word is "Non-member" everywhere,** the posters' ribbons included (v3.1).
- **/terms** has an English / Español toggle (owner 10-15); terms-es.md is its Spanish. The page picks its language by ?lang=, then the phone's remembered choice, then a Spanish-language phone (Eco-Thrift, 10-15). So every poster's QR and Spanish line stay at plain **ecothrift.us/terms**; a Spanish phone lands in Spanish.

## The app block (v2.5, owner 10-14: "coordinate all three posters to have consistent look with the phone app... with the QR below with one line... the placement and the look of the phone all is the same on all three")
- Every poster shows the phone with **`{{ s.app_block(art('R/shoot/<shot>.png')) }}`** (`templates/S/_s.j2`, master). It is the same on all three:
  - the phone is 4.6 in wide at the right margin (x 7.7 to 12.3 in), top 2.05 in (just under the app bar), bottom 11.63 in;
  - under it, from 11.98 in, are the scanner QR (1.2 in, ecothrift.us/scan) and one line, "Scan for the / Thrift+ app" (`app_line`, shared; owner 10-15), with the URL under the line.
- Each poster lays out around it. The left column runs from 0.7 to 7.3 in; full-width content starts at 13.5 in or lower. A title must fit the left column (P2: two lines).
- The screens: **P1** `scan_truck.png` (scanning), **P2** `tag_lamp.png` (the result), **P3** `tag_lamp.png` with a green ring around the real "3-day returns" badge on the screen (owner to P3 10-14: the pop-out "is weird and hard to connect what it would look like on the phone"). The ring is P3's only addition to the block; it marks the screen and never covers or redraws it.
- No poster restyles the phone or the QR row, or keeps its own scan QR. Changes go to the master.

## Member vs non-member (v2.7, owner 10-14: "Member and Non-Member. Need to be LARGE and a focus so people understand... I have to get member")
- **Labels:** `{{ s.who('member') }}` and `{{ s.who('non') }}` (`_s.j2`). These are big pill tabs (Nunito 900, 30 pt, caps): MEMBER in green (white on a green panel), NON-MEMBER in charcoal. Each is the first thing in its side's panel. Use them wherever a poster compares the two (P2, P3), and never in small caps.
- **Word:** "Non-member" replaces "Guest" everywhere a customer reads (v2.8, owner 10-15: "I think non-member is better"): posters and footers, the terms, the app, receipts, the register. The shared keys are `who_member` and `who_non`.
- **The seal is retired** (owner 10-15: removed from P1 after outside feedback, then "free and easy needs to be removed from p2 and p3"). `app_block` draws none by default; `free_seal()` stays in `_s.j2` unused.

## Colour
- Member **#3f9f35** (panels, buttons, the "+"); titles **#1d5424**; deep **#237a26**; tint **#e7f3e0**; page **#f2f2ee**; ink **#2a2d28**.
- **Guest is white, member is green**, on every poster. **v2:** the guest's big "0" may sit on a charcoal tile inside the white guest panel (P2), the guest's one accent.

## Type
- Manrope (text), Nunito 900 (big numbers), Spectral (rare accents). Body at least 14.5 pt; small print only where a template marks it (`data-min-pt`).
- Labels: 14.5 pt caps, letter-spaced, green.
- No dashes in copy (the build counts them); no awkward breaks: URLs, amounts, "Thrift+ credit", "SOLD AS IS", "3-day returns" never split; no one-word last line (the build checks `widows` and `too_many_lines`).

## Words
- **ThriftBucks** is the only noun (one ThriftBuck); "redeem instantly" is the verb, at 50%. A ThriftBucks amount is a number next to the word ("19 ThriftBucks"), never "$" and never the TB mark.
- **One big number per idea** (poster 2: 19 ThriftBucks, with the 50% as a note; no $9.50).
- **v2: the "free" line is "Free to join. Nothing owed." everywhere** (posters, app, terms; rulebook C3). Where there's room for only the short form, "Free to join" alone is right (poster 1's badge); the second half is never replaced by other words. Never "ever" next to free, never "free forever", never "fee". "Free to join" may stand alone. Never the V2 words (rewards as the name, cover, warranty except "not a warranty", earn, fee, points, cash back, store credit, InstantBucks...). The build's banned-word list enforces most of them.
- Spanish: only the one footer line (V5): "En español: Thrift+ es gratis. Escanee aquí para español o visite ecothrift.us/terms →"

## Pictures
- AI images only where they read as a real photo (shelf photos). Text, QR codes, diagrams and labels are live type or vector.
- The phone always shows the **real scanner app** (a screenshot), never a mock.
- **v2: the app on all three posters, from one shoot** (owner 10-14, to P3: "p1 will have scanning phone app again... p2 may also but like zoomed in"; P3 "show the app too with the 3-day returns shown on it, so we know what it is marked"). One screenshot of the **scanned-tag screen** of one real qualifying item, used by all three, so the wall tells one story:
  - **P1: the full app, scanning** (v2.3, owner to P1: "use the scanning photo like we had before, scan and use the toy truck, that was good"): the whole phone in camera view, aimed at the toy truck's kraft tag (`art/R/shoot/scan_truck.png`). P1 prints no numbers about the truck;
  - **P2: the whole phone on the lamp's tag screen** (v2.4, owner to P2: "no we are definately going to have the phone in p2"; `art/R/shoot/tag_lamp.png`);
  - **P3: the returns part** (the lamp's tag screen with a ring around its real "3-day returns" badge; no pop-out).
  (v2.2 had P2 as a band snapshot; the owner then told P1 and P2 directly what he wants, v2.3 and v2.4. Each poster has its own phone moment: P1 scans, P2 shows the result, P3 shows the returns mark.)
  **Order of work (v2.2): the app is finished first** (APP designs, Eco-Thrift builds, locally is enough), **then the master re-shoots** (`tools/tag_shot.mjs`), **then P1 to P3 drop the new shots in.** Until then the posters keep today's shots (`art/R/shoot/`) as placeholders. Each poster crops the one image in its own template; no poster takes its own shots.
- **v2: numbers agree.** An example number on a poster must match the screenshot when it's the same item, or the example must clearly be a different item. Never two numbers for one item.
- **v2: the example item** (the one whose numbers are printed) is the shoot's lamp on P2 and P3; P1's scan photo shows the toy truck, with none of its numbers printed (v2.3). The lamp replaces the glove (a glove may read as soft goods under W6, and the returns poster can't show a doubtful item).
- The ThriftBuck certificate (`.ai/reference/thriftbucks-mark/art/`) is brand art and may be used; it always carries its QR. **v2.1: no stack of ThriftBucks on posters** (owner 10-14 to P1: "I hate the stack of money"). Whether the app keeps its stack icon is APP's question for the owner.
- Every QR is decoded from the PDF by the build.

## The scanner app (10-14)
- The app follows this language too: the same colours, words, ThriftBucks art and "one big number per idea". Its type differs today (Roboto, Roboto Condensed, Nunito 900 for numbers; the posters use Manrope). Decided 10-14: no font change in the app before launch (it would change the shots); Manrope for the app's running text is the first change after launch (APP tested it: it fits every screen).
- Poster 2's phone shows the real app, so a change to the app's look changes poster 2: APP and P2 coordinate in the thread.

## Decided 10-14 (owner, through the Eco-Thrift session)
- **Terms address:** one page at **ecothrift.us/terms** holds both the website / email terms and the Thrift+ terms. Every QR stays as it is; nothing is reprinted.
- **Wordmark (v2.8, owner 10-15: yes to the brand plan):** one Thrift+ logo everywhere, the original 10-08 **brush Thrift+**, traced to vectors (`workspace/scanner_art/brand/`: thriftplus-brush.svg, -white.svg, wordmarkPath.brush.ts). The app drops the Black Anemone wordmark; nothing to buy. Text in Manrope (the app switches after launch), numbers in Nunito 900. The ThriftBuck note loses the TB symbol and the oval: the owner picked **layout A** (10-15): the terms QR left, the Eco-Thrift seal large in the middle, Thrift+ right (`scanner_art/tb_note_v4.py` A; the kit has it).
- **v2.6: there is no card** (owner 10-14: "we are doing away with the card altogether... no mention of CARD anywhere"). A member shows the **member QR in the Thrift+ app** or gives their **phone number** at the register. The word "card" appears nowhere a customer reads: posters, app, terms, receipts, register screens, emails. Payment cards too: say "the way you paid". Poster 2 says "Once you are a member". The app's screen is called **"Member QR"** (short address ecothrift.us/qr; APP, 10-14); posters and terms use the same name.
- **v2: the app's tag screen stays as built** (the price biggest, the ThriftBucks band under it) unless the owner asks; APP designs the new member QR screen first.
- **v2: policy words** (for anyone writing copy): kept ThriftBucks come off at the register by themselves (B3; never write "automatic"); redeeming instantly is offered only on what's left (B1); "3 days" means the day of sale plus 3 (W2); staff glance for clear damage (W7).

## Open (the owner decides; the master updates this page and announces a new version)
- Nothing open on the shared look right now. Next from the master: one Thrift+ wordmark for posters, certificate and app.
