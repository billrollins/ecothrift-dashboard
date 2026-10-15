<!-- Last updated: 2026-10-08 -->
# Log

Newest at the bottom. Costs are list prices per image from `GET /v1/image-generation-models`.

## 2026-10-08

**First attempt (superseded).**
- Three quick posters in `workspace/posters/`: one 832 px art plate per poster, upscaled.
- Two problems:
  - The warranty text used old numbers (3 days, 95%, "store credit").
  - The headline pitched waiting ("The longer it sits...").
- The owner asked to start over with a written record. The old warranty PDF must not be used.

**Sources gathered.**
- Rulebook (Form 5).
- The owner's launch-kit notes (Member vs Guest framing; three signs).
- The main session's facts and its one-poster copy (by message).
- The main session's 10-08 sign drafts (old form, kept for reference only).

**Brand assets found.**
- Eco-Thrift logo master 10013 x 2459 px (`frontend/src/assets/logo-full-fullsize.png`), enough for print.
- The Thrift+ brush wordmark is 720 px only.
- The scanner art (field header, coins, brush) is in `frontend/src/assets/thriftplus/`.
- Decision: no coin or money imagery on posters (B5, V2).

**Image API measured.**
- **Models.** Three on our key: `grok-imagine-image` $0.02, `-quality` (pro) $0.05, `-2.0` $0.06.
- **Resolution.** Accepts 1k, 1.5k and 2k. 4k is refused (422).
- **Aspect ratio.** Accepts a fixed list (see 05). 13:19 is refused (422).
- **Output.**
  - 2:3 at 2k: 1664 x 2496 PNG, on both quality and 2.0.
  - 1:2 at 2k: 1456 x 2912.
- **Look.** Same lamp prompt on both. Quality/pro reads as a real used object; 2.0 reads as a catalog shot. Both are clean.
- **Edits.**
  - Without `resolution`, the output is 832 x 1248 or 1024 x 1024.
  - With `resolution: 2k`, the output is 2048 px but re-composed (zoomed out, new shade, new backdrop colour).
  - **Rejected as an upscaler.**
- **Cost so far:** 7 generations and edits, about $0.40.

**Chrome PDF engine tested.**
- Kept sharp: images, multiply blend, clip-path, SVG clip.
- Rasterised: CSS filter at 300 dpi, CSS mask at 72 dpi. **Never use CSS masks;** bake alpha in Python.
- Spectral embeds as TrueType. Manrope embeds as Type3 outlines (it is a variable font). Both are vector.

**Tools added:** Pillow, numpy, vtracer, qrcode (pip, system Python 3.14). PyMuPDF is in the repo venv.

**Record written:** files 01 to 05. Collections A Specimen, B System, C Tag, D Field. Creatives K1 to K5. 15 variations planned per collection.

**Brand assets built** (`tools/assets.py`):
- 18 Material icons (Apache 2.0, from the repo's `@mui/icons-material`).
- Logos at 3600 px in colour, white, ink and forest. The one-colour versions knock out the icon's chevrons.
- The Thrift+ brush wordmark rebuilt 6x (4320 px): alpha re-thresholded, and the plus classified by position. The first try left green specks on the word edges; fixed.
- Vector QR codes for /thriftplus, /scan and /thriftplus/warranty.

**Plates, round 1:** 24 generated (about $1.30). Every one reads as a real photograph.
- **Reject: camera.** Garbled engraving and lens numbers at 100%. Replaced by brass candlesticks.
- **Reject: toaster.** The lever sticks out like a crank, which is impossible. Replaced by an electric kettle.
- **Problem: objects were small in frame** (about 580 px wide, so about 115 dpi as a hero). All objects regenerated to fill the frame, with landscape ratios for wide ones. The small versions are kept in `art/A/raw_small/`.

**Plates, round 2:** 13 regenerated (about $0.65).
- **Reject: radio.** A picture-in-picture frame artifact; regenerating.
- **Kettle passes.** Its rear grip is plausible.
- Blank tags checked at 100%; all blank.

**Pipeline proven** (`tools/build.py`): Jinja2 templates go to HTML, then PDF through isolated Edge instances, then PyMuPDF previews, then QA.
- Edge `--dump-dom` gives no output on Windows (msedge is a GUI app). So QA prints a second time with `?qa=1`: `qa.js` appends a base64 report page, which is read back from that PDF.
- QA covers:
  - text outside the 0.6 in safe area, text overflowing its box, text overlapping text, text running into a panel it does not belong to;
  - type under 14.5 pt, font loading, effective image dpi;
  - banned words, dashes, stray dollar amounts, required lines per creative, and QR decode (whole page, then tiles).
- QA caught, and these were fixed:
  - a no-break rule that pushed a grid column off the page;
  - fine print below the safe line (several posters);
  - a QR drawn white on white (B-K4-1);
  - claim steps colliding with list panels (B-K4-3);
  - labels under minimum size.

**Collection A photo pipeline** (`tools/plates.py`, all checked at 100% crops on page and on forest):
- **Melt** (object on the page colour). The backdrop is modelled with a 2D polynomial plus a smoothed local residual, divided out and replaced by the page colour (near-paper pixels also take the page's exact hue). Alpha is the object from a GrabCut segmentation plus its shadows within about 7% of the object. Several earlier tries were rejected in review:
  - a frame-sized alpha (paper rectangles showed);
  - a difference-only alpha (far wall shading showed as grey clouds);
  - a strict core (light objects such as a cream vase vanished).
- **Chroma cutout** (object over type or over forest). Objects are shot on chroma-blue paper. The key uses blueness relative to the locally estimated paper, and the shadows go on a separate multiply layer. Fixed along the way:
  - blue bounce on a shaded underside keyed as see-through (pale rim on a sweater);
  - lighter paper keyed as object (a smear by a chair leg);
  - wood hue bleeding onto cream fabric (hue now matched by lightness);
  - glossy legs mirroring the blue paper. Silhouette closing is now gated on darkness. The glossy chair was finally replaced by a matte, oiled-teak chair, which keys cleanly.
- **Colour bleed under alpha 0** in every RGBA, so no PDF viewer can show dark fringes.
- **Plates used:** melts of lamp, lamp_tag, decanter_tag, blender, kettle, candlesticks, radio, teapot and vase; cutouts of chair_matte_key, pitcher_key and sweater_key.
- **Rejects:**
  - glossy chair_key (legs);
  - chair melt over type (not needed);
  - sweater melt (light knit on light paper loses edges, so the keyed sweater is used);
  - radio round 1 (a frame artifact).
- **Cost to date:** about 45 generations (about $2.40).

**Glass and keying, round 2:**
- **The decanter** keeps its real photograph on white paper:
  - one convex hull over all its textured parts forms the object;
  - background caught in the hull is snapped to the exact page colour;
  - the caustic shadow is replaced by a drawn, neutral contact shadow;
  - a premultiplied "over" fixed a dark line at the hull edge.
- **A chroma-blue reshoot** of the decanter (relit onto the page) is kept as an alternate. It reads high-key and frosted, so it is not used.
- **The keyer** now keys on the red-to-blue ratio relative to the local paper (measured: paper q <= 0.35, objects q >= 0.93). Blue bounce light on a shaded side stays opaque. That fixed a white rim on the pitcher.
- **Crops** now keep shadows until they fade below 0.3%. Before, an 8% cut left a visible edge under the decanter.
- **QA** now knows each object's box inside its crop, so text over a transparent shadow margin is not flagged but text over the object is.
- **Edge exports** retry once (two timed out under load).

**Collection A (Specimen) built: 15 of 15 pass QA.**
- Review PDF: `out/Thrift+ posters - Collection A Specimen - review.pdf` (55 MB, print resolution).
- Preview PDF: `... - preview.pdf` (4.9 MB, images at 110 dpi, for viewing only).
- K1: field guide 13 x 19, spread 19 x 13, catalog 18 x 24.
- K2: single specimen, plate of finds, depth (chair in front of "Thrift+").
- K3: the split, gallery label, two callouts.
- K4: the lamp lights, covered vs not covered, editorial numerals.
- K5: museum label, framed band, gallery tag.

**Collection C (Tag) building blocks** (`tools/tags.py`, `tools/prep_C.py`):
- **Die-cut tags** in vector, filled with the generated kraft card (made seamless and tiled to a 4096 x 6144 sheet, about 300 dpi). Each has a punched hole, a reinforcement ring, two-tone cotton twine and a soft shadow.
- **Perforation lines.**
- **Rubber stamp:** live HTML text in a double frame, with real ink flecks traced to vector from the generated stamp print and knocked out on top.
- **Thermal slip** with torn edges.
- **One photo-in-a-tag:** the teapot photograph clipped to a tag shape.
- `vtracer` segfaults on this machine, so tracing uses OpenCV contours (`plates.trace_mask_svg`).

**Mistakes caught and fixed in C:**
- The text inset for top-hole tags used the wrong axis.
- Bold fine print was ink on forest (unreadable).
- A rewards sticker showed only the 80% option (V4 needs both).
- The first SVG stamp clipped "SOLD AS IS" to "OLD AS I". Rebuilt as fitted HTML.
- "CROSSBOWS" overflowed a narrow stub column.
- A tag corner covered the logo tagline.
- A receipt URL ran off the slip.
- A connecting string read as a stray line. Replaced by strings tied off to the page edge.
- An ad-hoc phrase ("Members choose:") was replaced by deck copy.
- A duplicated "Saving is the default." line was removed.

**QA upgrades:**
- Geometry is measured unrotated, so tilted tags don't make false overlaps. It runs only in the `?qa=1` print; the real PDF is untouched.
- Tags and stickers count as solid panels.
- Things stuck on top (stickers, stamps) are marked `data-on-top`.
- Overflow reports carry coordinates.

**Collection C (Tag) built: 15 of 15 pass QA.**
- Review PDF: `out/Thrift+ posters - Collection C Tag - review.pdf`. A 12 MB preview is next to it.
- K1: tags on strings 13 x 19, bunting 19 x 13, hang-tag 18 x 24.
- K2: giant tag with stickers, mobile, photo tag.
- K3: two tags with stubs, the sticker, tear-off on kraft.
- K4: stamped guest tag, the 7, thermal slip.
- K5: stamp, tag, stub.

**Collection D (Field) building blocks** (`tools/prep_D.py`, `templates/D/`):
- The scanner's palette, with Nunito numerals (the scanner's money face).
- Field and bokeh plates: 2k sources, about 128 to 192 dpi, upscaled to 300 dpi with grain. Horizons were measured, so headlines sit on sky.
- Field bands fade into the page over the bottom 1.6 in. The first build showed a hard photo edge in the margins.
- A dark-green bokeh is baked in Python (not a CSS blend) for white type.
- The sage mug is melted onto the page.
- The paint stroke is traced to vector.
- The phone mock is HTML.

**Mistakes caught and fixed in D:**
- A CSS specificity slip kept the D-K2-2 cards full width, so they ran under the phone and their text was cut off. QA caught it.
- The phone mock showed a "Save it" button, implying the choice is made in the app. Per B1 it is made at the register, once per trip. The phone now shows both numbers (V4), the default, and "The register asks once each trip."
- An undecided claim ("Your card works today") was removed from the copy.
- "SOLD AS IS" broke across two lines in a narrow card.
- The wordmark's green "+" vanished on a green banner. An all-white version was added.
- The result card was clipped under the cards in D-K3-1.
- "Guests / Guests pay the tag." was redundant.

**Collection D (Field) built: 15 of 15 pass QA.**
- K1: app flow 13 x 19, three rows 19 x 13, hero and grid 18 x 24.
- K2: morning field, phone, brush swash.
- K3: scan a tag, the choice, two cards.
- K4: shield card, the promise, split cards.
- K5: card, bokeh pill, banner.

**Final full rebuild (10-08, evening): 60 of 60 built, 60 of 60 pass QA.**

`tools/sweep.py` then read every PDF and found zero issues:
- no placeholder except the marked warranty version date;
- no banned words, no em or en dashes;
- every page at its trim size;
- only Spectral, Manrope, Nunito and DM Mono embedded.

One sweep bug was fixed along the way: its "TODO" check had been case-insensitive and matched the Spanish word "todo".

Review PDFs repackaged: A 55 MB, B 25 MB, C 79 MB, D 55 MB, with previews of 5 to 18 MB.

Main session confirmed on 10-08:
- ecothrift.us/scan is live.
- ecothrift.us/thriftplus and /thriftplus/warranty return "not found" until those pages ship (the warranty page is due 10-12).
- The launch-kit to-do cr-posters points to this record.
- The three copy changes (no $ example, "clothing and soft goods", "hallazgo") match the rulebook.

**Image cost, whole job:** about 50 generations and edits on the xAI key, roughly $2.70.

**Collection B (System) built: 15 of 15 pass QA.** Review PDF: `out/Thrift+ posters - Collection B System - review.pdf`.
- K1: flow 13 x 19, three rows 19 x 13, numbers 18 x 24.
- K2: the plus, number tiles, halftone.
- K3: table, fork, scan.
- K4: two fields, timeline, checklist.
- K5: stripe, block, split (3 areas each).

## 2026-10-09: round 2 wall proofs

- **Words:** rewritten to the signed rulebook. See `02-copy-deck.md` § Round 2 and `workspace/posters2/copy/copy_r2.json`.
- **Build:** `templates/R/` (P1 Meet Thrift+, P2 Rewards, P3 Limited Warranty) from shared parts in `R/_r.j2`:
  - header, title block (number badge, kicker, H1 70pt, sub);
  - footer (one line, three short lines, the terms QR);
  - phone and Instant | Full choice.
- **Run:** `python workspace/posters2/tools/build_r2.py [field|band]`. Out: `out/R/`: PDFs, `wall-field.png`, `wall-band.png`, `footer-*.png`.
- **Two header styles:**
  - *field:* the hero_18x9p6 photo spread across all three posters at 39 in, horizon at 6.0 in on each, so it runs straight across the wall;
  - *band:* a scanner-green band.
  - Both have the white Thrift+ and Eco-Thrift logos with a two-layer shadow.
- **QA:** all six built clean (text fit, safe area, sizes, banned words, required lines). Every QR reads `https://ecothrift.us/thriftplus/terms`.
- **No new AI art:** reused D's field and mug plates and C's kraft (the blank tag on P2). The phone screen is a placeholder until the real scanner screenshot.
- **Open for finals:**
  - the field photo is about 138 dpi at 39 in wide (soft sky and grass, likely fine; check at 100%);
  - CSS drop-shadows on the logos get rasterised by Chrome (check at 100%, or bake them into the PNG);
  - the terms page must be live before printing.

## 2026-10-09: round 3, three groups of three (owner's markup of round 2)

- **Owner's picks from round 2:** header A (field).
  - Footer: `ecothrift.us/terms`, with "Scan for terms" under the QR.
  - Titles: no 1/2/3 and no kicker.
  - Logos: no white logo with a blurred shadow; try a flat plate, or go back to dark.
- **Meet:**
  - the phone ends where card 3 ends;
  - no full stop after "Thrift+";
  - the join panel in two halves, Start on your phone (QR or `ecothrift.us/join`, your info) | Finish at the register (photo, ID), with no numbers.
- **Rewards:**
  - "Once you have your card / Get Rewards.";
  - no brown tag and no loose string: the owner's shelf label rebuilt as live type, with "Scan to see Rewards" (QR `ecothrift.us/scan`);
  - Full on the left as the default; Instant is "Want it today? Tell the cashier." (rulebook B1 updated).
- **Guest vs member** in the same colours on Rewards and Warranty: guest white, member green.
- **Warranty:** no black, even column widths, less text, stats like the owner's sample (rule, big figure, short line); AS IS | AS IS | AS IS against Limited Warranty | 7 days | 80%.
- **Groups** (`templates/S/G<n>-P<m>`, shared parts in `S/_s.j2`, built by `tools/build_r3.py`):
  - **G1:** forest logos straight on the field;
  - **G2:** white logos on flat forest plates (a solid offset shadow, no blur);
  - **G3:** a white app bar like the scanner, with photo finds.
- **New photo plates** (Grok Imagine quality, 2 takes each, `art/R/raw` with sidecars):
  - the glowing sage lamp, take 2, shown as a photo card with the scanner's corner marks, because its white shade vanished as a cutout;
  - the cream enamel kettle, take 2, cut out (`kettle_t.png`: the halo removed over the grass).
- **QA:** all nine built clean (text fit, safe area, sizes, banned words, required lines). Every QR decodes: terms, join and scan.
- **Open:**
  - `ecothrift.us/terms` and `ecothrift.us/join` must exist before printing;
  - the label's sample prices ($12.99, was $29.99) are illustrations;
  - the Spanish lines need a native check;
  - the phone is a placeholder for the real scanner screenshot.

## 2026-10-09: the final set (owner picked group 3, with parts from groups 1 and 2)

- **Templates:** `templates/S/F-P1..3` (`F-P3` variant `chart: band` = F-P3b). Run `python workspace/posters2/tools/build_final.py`. Out: `out/S/wall-F.png`, `wall-Fb.png`, `footers-F.png`.
- **Header:** group 3's app bar; the Eco-Thrift logo enlarged to fill it like Thrift+.
- **Meet:**
  - group 1's cards and group 3's join cards;
  - the phone holds a real screenshot of the scanner (`art/R/out/scanner_shot.png`) and ends where card 3 ends.
- **The screenshot** (`tools/scanner_shot.mjs`):
  - a photo of a wooden toy truck on a thrift shelf (Grok, `shelf_toy3_1`), with the green label warped onto its kraft tag (`shelf_truck.jpg`), fed to the real app as the phone camera (canvas stream);
  - local dev servers, a member session staged in the browser only (no database change), 390 x 844 at 3x.
  - To retake after the scanner's wording update: copy `art/R/out/shelf_truck.jpg` to `frontend/public/_tp_fakecam.jpg`, run the script, then delete the copy.
  - The app still says "Banked rewards".
- **Rewards:**
  - "Scan any tag" under the title;
  - a baseball glove (sporting goods; Grok `glove_1`, cut out) with a big kraft tag carrying the green label, its string tied to the glove.
- **Warranty:**
  - the owner's words (Qualifying items, Qualifying reason, Not covered) in one card, with the guest vs member table below;
  - F-P3b has the green-over-white chart instead.
- **Footers:** four lines each, one row each, justified to the full width. The type is sized by script from the column width, up to 15.5 pt.
- **QA:** all four built clean.

## 2026-10-09: the final set, revised (the consult's notes and the owner's answers)

- **All three posters:**
  - "Collect", not "Earn".
  - "Default" stays, not "Automatic" (owner: "Automatic" reads like two things you get).
  - A smaller terms QR (0.82 in) captioned "TERMS" on every poster. It reads correctly in a close crop.
- **Meet:**
  - sub: "Collect Rewards that grow as an item sits.";
  - card 2: up to 95% of the tag, keep the Full reward for 30 days or take 80% of it today;
  - the cover line rewritten: "The first $10 of Rewards you collect each month pays for your card. The rest is yours."
- **Rewards:**
  - the glove's tag at $20.00, with the strikethrough smaller;
  - a callout by the tag: "New today: $0. Grows as it sits. Up to $19 back.";
  - the member box in dollars, as an example: Full reward $10 (Default) | Instant reward $8 off, tell the cashier.
- **Warranty:**
  - "Qualifying items", "Qualifying reason" and "What's not covered" as big centred headings, no icons;
  - the cutoff stays "$10 or less after Rewards" (owner);
  - the warrantor line on its own footer line.
- **Rulebook:** P3 now 95% (cap shown only as an example; the rate never printed); W6 notes the owner's call on the cutoff.

## 2026-10-09: fixes, and sky options

- **Terms QR:** back up to 1.06 in.
- **Meet:**
  - sub: "Rewards on most items.";
  - card 2: "Grow as items sit." (one line), with the detail on two lines.
- **Rewards:** the boxed callout replaced by a red-pen note (Caveat 700, #c8261f, no box), "Rewards here could grow to $19.00!", with a drawn arrow to the label's QR.
- **Warranty:** back to the row layout (label column + text), no icons, left-aligned; bigger labels and text; the cards keep their size and place.
- **Skies:** five header options (Grok quality, 16:9, `art/R/raw/sky/`): morning, day, sunny, twilight, night. They are shown across the three posters in `out/S/skies.png`. Twilight and night would need white headlines.

## 2026-10-09: morning | day | night header (owner's pick)

- **The panorama:** one 39 in header (`tools/sky_trio.py`, out `art/R/out/sky_trio.jpg`, 150 ppi): morning across poster 1, day across poster 2, night across poster 3, horizon at 6.0 in on all three.
- **Features that cross the gaps:**
  - wide soft blends across both seams;
  - a cloud from the day photo laid across the first seam, so it shows on both posters 1 and 2;
  - stars come up on poster 2's right edge;
  - the night frame is shifted so the Milky Way sits right of the headline.
- **Night poster:** the title is in white (`.fin.night`).
- **Source sharpness:** about 90 ppi for morning, 126 for day, 128 for night, all soft sky. Check at 100% before printing; regenerate morning with a lower horizon if it reads soft.

## 2026-10-09: the warranty chart is green over white (owner)

- **Warranty:** green over white is the chart (F-P3b). The wall is now `out/S/wall-F7.png`.
- **Meet, join row:**
  - "Start on your phone" takes about 60% of the row, with a 1.75 in join QR at the left and the steps at the right; no phone icon.
  - "Finish at the register" ends with "18+, ID is used for verification only." (members stay 18+: the legal reasons; rulebook J3 updated).
- **Rewards:**
  - the red-pen note reads "This item could have up to $19 in Rewards!" in two lines;
  - the member tiles show the percent big (100% Default | 80%) with this glove's maximum underneath (up to $19 | up to $15.20 off).

## 2026-10-09: polish

- **Phone:** no camera cut-out.
- **Join QR:** no border.
- **"Finish at the register":** the note is centred and lighter: "18+ only. ID is used for verification."
- **Rewards:** a real scanner QR (`ecothrift.us/scan`, the same as the tag's QR) now leads the "Scan any tag" line: "Scan any tag to see its Rewards. Open the scanner: ecothrift.us/scan".
- **Warranty, "What's not covered":**
  - "Reasons: a change of mind, or scratches and wear."
  - "Items: clothing, consumables, parts, $10 or under."
  - The full rule ($10 or less after Rewards) lives on the terms page.
- **For the terms page build:** it also carries a big "Scanner" button and QR and a "Join" button and QR, so any poster QR leads anywhere.
- 2026-10-09: the qualifying-reason example is now "A blender blends. A TV shows a picture." on its own line (a lamp was a bad example: a dead bulb is a part, owner). Rulebook W1 updated.
- 2026-10-09: on the green label the QR has even margins (3.3 em, centred in its band) and the call to action is set as 'SCAN TO SEE / REWARDS →'. The red arrow now points straight up at the QR's centre (x 11.56 in, measured from the PDF). The Instant tile reads 'Of the Full reward, if you use it today. Tell the cashier.' (owner's words; 'use it today' is no longer flagged).
- 2026-10-09: Meet card 2 detail, owner's wording on two lines: 'Use Full rewards the next day, expires 30 days later.' / 'Or use Instant rewards at 80% of the Full amount.' (16.25 pt, one line each). The Rewards Full tile: 'Use the next day. Expires 30 days later.'
- 2026-10-09: Meet card 2 detail shortened to fit at the cards' normal size: 'Full rewards: use the next day, for 30 days.' / 'Instant rewards: use today, at 80% of Full.' The JOIN caption scales with its QR (19 pt for 1.75 in, against 11.5 pt for the 1.06 in terms QR).
- 2026-10-09: the Rewards member headline now reads 'Collects Rewards that grow as an item sits, up to 95% of the tag.' (owner; rulebook P3: the cap may be printed, never the rate). The chart moved up to 11.12 in to keep clear of the footer. Warranty: “Limited Warranty” is bold in the qualifying-items line.
- 2026-10-09: 'pays for your card' became 'covers your card' everywhere (Meet card 1 and the Rewards footer). The owner's rule: cover is the noun and covers is the verb (rulebook C1).
- 2026-10-09: Rewards uses the example in dollars. The red-pen note reads 'Rewards can grow to / 95% of the tag price!'. The tiles: Full reward $19 (Default), 'Use the next day. Expires 30 days later.' | Instant reward $15.20, '80% of the Full amount', 'If you use it today. Tell the cashier.' A line above the tiles: 'Example: this $20 glove at 95%'.
- 2026-10-09: each Rewards message has one job. The member headline gives the rule (up to 95% of the tag). The example line and tiles give the numbers ($19 | $15.20). The red pen is the call to action: 'Scan me to see today's / Rewards on this glove!', centred between the tag and the green card, with a longer looping hand-drawn arrow from the note's end to the QR's centre.
- 2026-10-09: the phone screenshot was retaken with the new scanner (v2.160.0: Rewards Balance coupon tile, velvet-rope cover, no coins), with a staged balance of $12.40.
- 2026-10-09: the screenshot was retaken again, with the cart icon on the item-count pill (another session's uncommitted ScannerTop change, served by the local dev server).
- 2026-10-09: the warranty's claim line reads 'Bring it to any register with your Thrift+ card.' with a cash-register icon (MUI PointOfSaleRounded, assets/icons/register.svg). The phone-number lookup (W7, W13) stays a register fallback, for the terms page.
- 2026-10-09: the claim line reads 'Bring it to any register with your Thrift+ card or phone number.' (owner).
- 2026-10-09: the screenshot was retaken from the working tree's newest scanner (the cart-bag picture on the item pill; uncommitted work by another session).
- 2026-10-10: Warranty chart matched to Rewards: the member band uses the same green (#3f9f35) and the labels are singular 'Member' / 'Guest' in the Rewards label style (member pale green on green, guest green on white). The qualifying-reason example reads 'A blender blends. A drill drills.' (owner: non-kitchen, the same noun-verb pattern; a TV was dropped). Rulebook W1 updated.
- 2026-10-10: the qualifying-reason example reads 'A blender blends. A mower mows.' (owner pick). Rulebook W1 updated.
- 2026-10-10: the screenshot's staged trip is 5 items with $26.40 in rewards (cover already paid). The app shows '5 items +$26.40' and '+$26.40 this trip' on the Rewards Balance.
- 2026-10-10: print files written to workspace/posters2/print/ (three 13 x 19 PDFs + a combined set, README with printer settings). Checked: exact size; text as Type 3 vector glyphs (sharp at 600 dpi); photos 213 to 300 ppi; sky panorama 150 ppi; the 72 ppi pieces are only the header's two gradient washes.
- 2026-10-10: the Meet subline reads 'Get Rewards and a Limited Warranty.' (echoes 'Get Rewards.' on poster 2). The print files were refreshed.
- 2026-10-10: the Meet subline reads 'Get Rewards, a Limited Warranty, and more.' on one line. The perks behind 'and more' are recorded in the rulebook (M1 to M4: holds online, consignment priority, member-only sales via event notifications, more in the scanner). They are listed on the terms page, its FAQ and the scanner's Thrift+ explainer, never on the posters. The print files were refreshed.
- 2026-10-10: the Meet subline reads 'Rewards, Limited Warranty and more!' (owner: shorter). The print files were refreshed.

## 2026-10-10: handoff, and the terms documents

- **The split (Bill):** the main session (`data_platform`) builds all the system, Dash, register, scanner and website work. The build list is `.ai/reference/reports/2026-10-10-thrift-plus-signed-policy-build-list.md` (delivered by peer inbox and acknowledged; the main session put it in `thrift_plus_rewards.md`). The poster session writes the documents.
- **The terms words**, `.ai/reference/thrift-plus-terms/`:
  - `terms-en.md`: hero, all you need to know, Scanner and Join buttons, numbered chart A.1 to D.3 linking to §1 to §12, FAQ, live perks, full terms;
  - `terms-es.md`: a courtesy translation, needing a native check; the English controls;
  - `limited-warranty-register.md`: also rendered as `workspace/posters2/print/ThriftPlus-Limited-Warranty-register-letter.pdf`, one letter page.
  - All are drafts for Bill, then the CPA and attorney (V7).
- **Rulebook:** old wording brought in line (F1, F3, C1, J5, P1, B5, B12, W8, V2, V3, V4).

## 2026-10-10: field feedback, and the Spanish lines

- **The Spanish footer lines** are now short: the benefit, then "Escanee aquí o visite ecothrift.us/terms →" (rulebook V5).
  - Meet: "¡beneficios gratis con su tarjeta Thrift+!"
  - Rewards: "Thrift+ le da Recompensas en sus compras" (not "money back", V2)
  - Warranty: "Thrift+ le da una garantía limitada"
- **Print files:** `workspace/posters2/print/v2/` (the v1 files were locked open in the PDF viewer).
- **Open from the field (Bill, 10-10):**
  - "Free" next to "$10 a month" reads as a monthly charge. This is the biggest issue.
  - A rename of the rewards to "Thrift Bucks" (the membership stays Thrift+) is under discussion, with its own symbol in place of $.

## 2026-10-10: the rewards rename, and symbol options

- **Names:** Bill is focus-grouping a rename of the rewards (the membership stays Thrift+). Claude's pick is **PlusBucks** over ThriftBucks:
  - it is the Thrift+ "+" and can be owned (local stores already use "Thrift Bucks");
  - its symbol can be the logo's brush "+";
  - "10 PlusBucks cover your card" doesn't read as a $10 charge, which helps the "free" problem.
- **Symbol voting sheet:** `workspace/posters2/symbols/symbol-options.pdf` (letter, landscape; built by `tools/symbols_sheet.py`).
  - 8 options: 1 Brush Plus (cut from the logo), 2 Plus Coin, 3 Tag Plus (kraft), 4 Coupon Ticket, 5 T-Plus, 6 Leaf Plus, 7 Plus Badge, 8 Coupon Stack.
  - Each is shown big, as an amount, in the scanner's cart pill and on a black-only receipt line, with a tally line for votes.
- **Not decided:** the name and the symbol. Nothing in the rulebook changes until Bill picks. The CPA and attorney then check the name, because "Bucks" reads as money; it must stay a discount, with no cash value and the expiry printed.
- 2026-10-10: the symbol sheet is made for both names: symbols/symbol-options-plusbucks.pdf and symbol-options-thriftbucks.pdf (the same 8 options; only the name changes).
- 2026-10-10: AI symbol concepts (the owner's prompt; Grok Imagine quality, 2 takes per name; `symbols/ai/`).
  - `tools/ai_symbols.py` numbers all 120 (A1 to D30). Copies of real currency signs (¥ £ $ ₿ ₽ ₱ ₸ ¢ ₵) and PayPal look-alikes are marked in red.
  - It builds a 12-pick shortlist sheet per name: `symbols/shortlist-thriftbucks.pdf` and `shortlist-plusbucks.pdf`, each pick shown big, as an amount and at text size.
  - The strongest idea across both is a "+" fused with a letter: the owner's lowercase t (a plus with a tail) or "+B".
- 2026-10-10: vector mark sheets.
  - `symbols/t-marks.pdf` (`tools/t_marks.py`): a lowercase t whose crossbar ends in a +, or flows into a hand-drawn script b (one pen stroke out of the tapered arm; `tools/t_b_lab.py` holds the b's tuning).
  - `symbols/tb-marks.pdf` (`tools/tb_marks.py`): the owner's sketch, a T whose stem is the B's spine, with the B running out as a $-style slash. 12 variations: pen, clean, bold, broad-nib x2, compact, long slash, italic, two-tone, lowercase t, stencil, with a +.
- 2026-10-10: the owner picked the broad-nib calligraphy TB (#4 on tb-marks) and wanted more script, simple to elaborate. `symbols/tb-script.pdf` (`tools/tb_script.py`): each stroke is a centre line whose width follows the pen (broad nib, pointed copperplate, brush, monoline), outlined into clean vector shapes. 12 options: 1 to 5 simple; 6 to 10 add one flourish each (wave bar, ink drops, looped stem, swash slash, curled bar); 11 and 12 have them all.
- 2026-10-10: the owner picked the brush-pen TB (#4 on tb-script) as the mark. Kit in `.ai/reference/thriftbucks-mark/`:
  - SVGs: the master as one path in currentColor, a text cut, and fixed colours;
  - PNGs, 64 to 1024 px;
  - the receipt glyph, hand-drawn on the 12 x 24 ESC/POS dot grid, with escpos_glyph.py bytes;
  - a one-page usage guide and a README for the main session.
  - Built by `tools/tb_kit.py` and `tools/tb_guide.py`.
  - The rename is not final: the name needs the owner's final word, then the CPA and attorney.
- 2026-10-10: owner switched direction: a serif TB monogram with a big B ("Bucks is the main thing"), from two references (a high-contrast serif TB with a curled tail; a script TB crossed by two strokes). Other mark work stopped. `symbols/monogram.pdf` (`tools/monogram.py`, fonttools installed): real typeface outlines (Playfair, Bodoni Moda, Cormorant, DM Serif, Great Vibes, Pinyon; open licence, fonts in symbols/fonts/). The T's bar is clipped from the T, its stem carried through a scaled B on the same stem, with an optional tail, crossing strokes (1 or 2) and swash bar. 12 options.
- 2026-10-10: owner moved to a font-based mark (a TB from two overlapping letters of one brush font, plus a matching Thrift+ wordmark), to buy the font he picks. Built a font lab: `workspace/posters2/fontlab/fontlab.html` (opentype.js; fonts packed into `fonts.js` by `build_fonts_js.py`; run as `fontlab` in .claude/launch.json, port 5191). Big T + B/3/b/ß with size, x/y, tilt, slant; Thrift+ with size, spacing and + placement; small previews (amounts, receipt size, on dark); "Save as this font's best" per font; "Compare saved bests" view; SVG download as real outlines. More fonts can be added in the page. Licences: Basilk = personal-use demo (commercial licence from Pekotype on Creative Market); Kabur = free for commercial use per its readme; Angler Fish = no licence file, check before use.
  - Same day: added 8 fonts from the owner's zips (Bambe, Bambe Swash, Black Anemone, Polisher, Raffles Bryant, Red Joo, Whispur; Angler Fish Underlines removed); each font shows its licence in the list. Only Kabur is free for business use; the rest are personal/demo until bought. + / − buttons on every slider (steps of 1; hold to repeat).
  - Same day: Angler fish 4 tuned (owner asked for the best one). Symbol uses Angler Fish's "ß" glyph, which in this font is a heavy brush B: solid at 18 px and on receipt dots, where the thin B breaks up. T 220, B(ß) 600, B 4 left of stem-centre and tilted -4 so the T stem hides inside the B; the T bar sweeps over the top like a currency stroke. Thrift+: + 280, raised level with the T/t tops, clear of the t crossbar. High-res check tool: `fontlab/render_tb.py` (same geometry as the lab; proofs in fontlab/work/).
- 2026-10-10: owner picked a strong TB in Black Anemone (font-lab save "Black Anemone 8": heavy brush T, B on its stem, reads like a $) and asked for it on the scanner art. `workspace/scanner_art/tb_coupons.py` erases the $ from the AI coupon art (inpaint) and sets the exact TB (font outlines): straight on the single coupon, on the brick's top coupon along its isometric axes. Out: workspace/scanner_art/tb/ (PNG, app-size webps, preview). Not swapped into the app: waiting on the owner's OK, and Black Anemone is a personal-use demo (must be bought first). Coins stay out (owner 10-09: paper, not coins).
- 2026-10-10: owner: "run with this" (Black Anemone 10), all Rewards → ThriftBucks, built into prod behind a test switch; this session does art and fonts, the Eco-Thrift session all code. Coupons now read like a bill: [TB]1.00 / One ThriftBuck (Nunito Black, OFL). Kit rebuilt at `.ai/reference/thriftbucks-mark/` (SVG master, PNGs, ESC/POS 24x24 two-char glyph + raster, coupon art, guide, README) by `workspace/posters2/fontlab/build_kit.py`. Rulebook V8 (Testing). Brief in `.ai/comm/inbox-data_platform.md`; Eco-Thrift nudged. Black Anemone is a demo: buy from sizimon before public use.
- 2026-10-10: certificate face → "[TB]1 / ThriftBuck" (owner), on AI-drawn engraved certificates (owner: "take advantage of AI image gen for the certificate background"). xAI made the paper + guilloche border only (T1_cert x3 flat, T2_cert_brick x3), blank centre; `workspace/scanner_art/tb_certs.py` lays the vector face flat or along the brick's axes, ink colour sampled from the engraving, and cuts the grey AI backdrop out. Kit art now T1_cert_2 (single) + T2_cert_brick_3 (stack); README, rulebook V8 and the data_platform brief updated.
- 2026-10-10: certificate final (for testing): owner asked for banknote-style corner numbers - a 1 in each of four AI-drawn empty medallions (prompt T3_cert_corners, pick T3_cert_corners_2), the symbol alone in the middle and "One ThriftBuck" centred under it (vector, Nunito Black, engraving green). "Build it once, then transform it for stacks": `workspace/scanner_art/tb_cert_final.py` makes the stack from the flat certificate (isometric top face, layered paper edges, green band clear of the words). Guardrail kept: no portrait, seal, serial or government wording. Kit art, README, rulebook V8, brief updated.
- 2026-10-10: certificate v2 (single only, owner): vector engraved oval (rings + guilloche band) around the symbol, symbol fills it; "One ThriftBuck" low between the bottom leaf sprigs; 1s in the corners. `workspace/scanner_art/tb_cert_v2.py` -> tb/v2-*. Stack on hold (owner: band off centre; focus on the one certificate).
- 2026-10-10: certificate v2 oval now like the dollar's portrait frame: taller, its bottom cut flat above "One ThriftBuck" (cut made in the geometry - PyMuPDF ignores SVG clip paths), band ends closed with short bars.
- 2026-10-10: certificate v3, three variations (`workspace/scanner_art/tb_cert_v3.py` -> tb/v3-*), owner: slogan "another chance for everything & everyone", "No cash value" OK as test words. Banknote anatomy: top plate set into the border (Eco-Thrift wordmark from the logo file, or engraved caps), bottom plate with the slogan in the logo's own lettering, left Eco-Thrift seal (toothed ring, ring text "ECO-THRIFT • OMAHA, NEBRASKA", leaf icon in engraved hairlines) or the icon alone, right Thrift+ in bright green (the one second ink, like the dollar's green seal) as logo / seal / logo + "OMAHA, NEBRASKA", captions "No cash value" / "ecothrift.us/terms" where a dollar's signatures sit. Logos recoloured from the real files, never redrawn. Mark source now save "Black Anemone 11" (same numbers as 10, which left the lab file).
- 2026-10-10: certificate "final" (owner picked 3 simple, with changes): left = the Eco-Thrift seal; the symbol re-fitted to equal margins inside the oval (`tb_cert_v2.balanced_fit`: 376 px tall, top/bottom gaps 130, sides 153/176, T-bar ends 42 px clear - the old 471 px symbol touched the curve); right = the leaf icon beside Thrift+ ("Thrift" in the money green, "+" bright), OMAHA, NEBRASKA under it, and a terms QR (https://ecothrift.us/terms, ECC M, 25 modules, vector) above the URL caption; decodes framed down to a 52 px code. `tb_cert_v3.py final` -> tb/v3-final*. /terms must be live before public use.
- 2026-10-10: certificate final: the leaf removed from the right (the seal carries it); Thrift+ sized to exactly the width of OMAHA, NEBRASKA under it (307 px each, a size step down so both clear the oval and the leaves). QR re-checked.
- 2026-10-10: packed (owner "pack it up"). `workspace/scanner_art/tb_pack.py` -> tb/pack/: full certificate (QR, captions, city), app certificate (none of those; Thrift+ alone on the right), the stack made from the app certificate (band centred, the TB printed on it in cream), app webps under the kit's names (thriftbucks-ticket 160, thriftbucks-brick 256), masters, preview. Kit rebuilt (`build_kit.py` now reads tb/pack/; README kept, status "in use": owner dropped the test switch in the code chat). Mark unchanged: the print server's TB_DEFINE and the screens' tbMarkPath.ts match the kit, so the code session only recopies the two webps. Rulebook V8 certificate line updated. Brief to data_platform.
- 2026-10-10: data_platform confirmed: thriftbucks-ticket.webp and thriftbucks-brick.webp recopied into frontend/src/assets/thriftplus/, mark untouched, not shipped. Their note: Bill's scanner changes in the code chat (rulebook V8): price first, cover in ThriftBucks, Thrift+ written in Black Anemone (workspace/wordmark_gen.py), three ThriftBucks looks (TB before / TB after / words only; he leans to TB after), simple item card (Retail, Our price, You get back). Open for the art side: the certificate's Thrift+ is still the original brush logo - match it to the Black Anemone Thrift+ if Bill keeps that.
- 2026-10-10: owner: the stack "much taller" -> 36 sheets (was 16), each a hair off square (jitter 1.6 px, fixed seed). Owner: "put the QR on (full cert), never do it without" -> the "app" cut (no QR/captions/city) is gone; the ticket webp and the stack are made from the full certificate. Kit rebuilt (same names); data_platform asked to recopy the two webps.
- 2026-10-12: owner policy changes (poster chat, after the poster feedback): no monthly cover; ThriftBucks the only noun, kept at full value (Default) or "redeemed instantly at 50% of their value" (no InstantBucks; 50% replaces 80%); the Limited Warranty becomes "Thrift+ 3-day returns" - any reason, qualifying items only (AI marks; Processing/Restoration mark AS IS on the tag), 80% back as Thrift+ credit, never to the card. Rulebook updated in place (41 blocks, IDs kept; F4 books per item added); data_platform briefed and nudged. Claude's fill-ins for the owner to confirm: 3 days = sale day + 3; a glance for damage since the sale; tagline "ThriftBucks, 3-day returns and more!". Waiting: Carrie's signature, CPA/attorney look (free without cover, 20% kept on returns, no warranty name). Next here: terms EN/ES (s2, s4, s8), the register returns text, posters.
- 2026-10-12: policies documented first (owner: "focus on the policies being documented, then on the posters"): terms-en.md and terms-es.md rewritten (hero "ThriftBucks, 3-day returns and more!"; s2 Free; s4 kept or redeemed instantly at 50%; s8 Thrift+ 3-day returns; s9 every item AS IS; FAQ and chart); `returns-register.md` replaces limited-warranty-register.md (rendered by the new `tools/register_sheet.py` to print/ThriftPlus-3-day-returns-register-letter.pdf); terms README and rulebook links updated.
- 2026-10-12: design rules written: `08-design-rules.md` (every visual edit and why, the slot budgets, a checklist). QA gained line-break checks (`too_many_lines`, `widows`); the banned-word list catches the retired words, and its old earn/automatic checks, broken by stray backspace characters since 10-09, were fixed.
- 2026-10-12: posters rewritten to the 10-12 policy (copy_r3.json; backup copy_r3_before-2026-10-12.json): Meet (sub "ThriftBucks, 3-day returns and more!", cards Free to join / ThriftBucks / 3-day returns), poster 2 "Get ThriftBucks." (label CTA "SCAN TO SEE / THRIFTBUCKS", pen note, guest gets neither ThriftBucks nor 3-day returns, tiles 19 ThriftBucks (Default) | Redeem instantly $9.50 off today's price), poster 3 "Changed your mind? / Bring it back." (rows, band Easy | 3 days | 80%, footer "not a warranty, every item AS IS"). Spanish line, all three (owner): "En español: Thrift+ es gratis. Escanee aquí para español o visite ecothrift.us/terms →". All four build OK (fit, banned words, required lines, QR, line breaks); breaks fixed by eye after the first build. Not printed yet: poster 1's phone shows the old app (Rewards Balance, Card covered) and needs a retake after the main session ships the 10-12 scanner.
- 2026-10-12: owner: returns abuse goes in the policy, not on posters. Rulebook W14 (staff may refuse a return that looks like misuse; the owner may limit a member's returns or end the membership; the limit is a never-printed setting) + O1; terms EN/ES 8.7 and a FAQ; register sheet (rebuilt, still one page).
- 2026-10-12: posters rebuilt for print (owner: 'make the posters again now'): the shelf photo's label now says SCAN TO SEE THRIFTBUCKS (new tools/shelf_label.py: renders the label from the posters' macro, finds the old label by ORB + homography, lays the new one on the label-free photo; old files kept as *_rewards); the scanner screenshot retaken from today's app (Black Anemone Thrift+, 'Your ThriftBucks 12.40'; still a 'Card covered' tile until the 10-12 code work). Print set: workspace/posters2/print/v3/ (three posters, wall set, register sheet, README with the known screenshot caveat). All four build OK.
- 2026-10-12: owner: the phone leaves poster 1 (it moves to poster 2 once the app is reworked); keep Meet Thrift+, the 1-2-3 and Start / Finish; "could show the card instead". Poster 1: the Thrift+ card (front, placeholder design in the brand greens: Thrift+ white, MEMBER pill, Eco-Thrift white; a white card behind) beside the title, until the owner sends a photo of the real stock-card front (the backs print from Dash; the fronts are pre-printed); the 1-2-3 cards became full-width rows (number, label + heading left at 29 pt, detail right at 19 pt behind a rule). QA caught card 2's lines overflowing at 20 pt; columns rebalanced.
- 2026-10-12: owner on returns: doubts about selling "any reason" ("we shouldn't make them feel good about it... if it doesn't work return it"), then "any reason helps them not damage it". Policy unchanged (any reason). Poster 3 leads with "Doesn't work? / Bring it back.", the subline states it plainly ("Within 3 days, for any reason, on qualifying items."); rows: Qualifying items | At the register ("We check it's the item you bought, in the shape it left the store.") | Not returnable; band: 3 days | 80% | Credit. Meet card 3: "On qualifying items. / 80% back as Thrift+ credit."
- 2026-10-12: owner wants the scanner reworked (goals passed to data_platform, not a spec: simpler, no cover tile, Add / Remove buttons back, the bigger number is the real reward, poster 2's hero screenshot). data_platform put a first layout to Bill in the code chat. Poster 2's redesign (the phone as hero, the kept ThriftBucks as the big number, "up to") waits for that app.
- 2026-10-12: owner: returns must also not be heavily used ('someone use/abuse something and returns it'). Rulebook W7, terms EN/ES (s8.4 and FAQ), register sheet (rebuilt) and poster 3's Not returnable row: 'Heavily used, broken or damaged after the sale.'
- 2026-10-12: poster 2 redesigned (owner: "keep the phone, just move it to poster 2, have the glove in it... reword the cards, probably vertical, do not have 19 and 9.50, just 19 with the 50% note"). New glove shelf photo (xAI, art/R/raw/shelf_glove_2.png; take 3 rejected for marks on the shelf) with the green label laid on its blank kraft tag (new tools/shelf_glove.py, measured edges); the real scanner fed it as its camera (zoom 1.25 on the tag) -> art/R/out/scanner_shot_glove.png. Layout: Member card (green) left with one white tile (THRIFTBUCKS, Default, 19 at 150 pt, "Use them next visit, within 30 days.") and the note "Or redeem them instantly at 50%. / Tell the cashier."; the phone (5.6 in) right; the Guest strip full width below, covering the phone's foot (today's app is empty under the camera); the shadow from a phone-shaped box so it rounds off past the strip. Glove photo, kraft tag and red pen retired. Required words: '$9.50' and 'Redeem instantly' out, 'instantly at 50%' in. scanner_shot.mjs now takes 4x pixels (TP_SCALE); the 3x shot prints at 222 dpi, accepted until the retake. All four build OK. 08-design-rules.md sections 3-8 brought up to date (poster 1's card and rows too). Still to do: the retake after the app rework, then print/v4.
- 2026-10-14: poster 1 livened up (owner: "a bit bare... make it a touch more exciting... seems easy to miss"): green pill "New at Eco-Thrift" over the title (`meet_pre`); the Thrift+ card (still the placeholder front) now leans on the ThriftBucks stack (art/R/out/tb_stack.png, copied from the ThriftBucks kit's brick master) instead of a plain white card; round badge "Free / to join" (`free_badge`); the 1-2-3 rows moved onto one member-green panel with white type and white number dots. All four build OK. The owner asked whether we have the real Thrift+ card design: none found (no card-front file in the repo or the owner's Downloads / Desktop / Pictures / Documents; the code only says the stock cards come with full-colour fronts). Also 10-14, from the launch hub (data_platform): rulebook V8's Spanish line now matches V5; 08 §1's font line corrected (Manrope is the posters' own; the scanner uses Roboto, sharing only Nunito for numbers).
- 2026-10-14: owner split the poster work: this session is the master ("Thrift+ Design": design language, shared files, the wall, the ThriftBucks art) plus one session per poster, all talking in one thread (`09-thread.md`, append-only via `tools/thread_post.py`). Design language v1 written (`10-design-language.md`; decided 10-14: ecothrift.us/terms stays as one page for both terms, no QR changes; the wordmark is the master's call, brush Thrift+ on posters for now). build_final.py gained `--only P1|P2|P3` and per-poster word files (`copy/F-Pn.json` over the shared copy_r3.json; `_need` replaces a poster's required words). P2's owner feedback (whole phone, wider member card, "Once you are a member", an eye-catching guest card: what ThriftBucks are, guests don't get them, the scanning app) handed to the P2 session in its brief.
- 2026-10-14: a fifth session, APP, designs the scanner app in line with the posters (Eco-Thrift builds; APP sends exact specs). Design language v2 sent to all four (thread + messages): free line "Free to join. Nothing owed." (C3); the card optional (J2: card, app QR or phone number; posters may show it, never say it's needed); the app on all three posters from one master shoot of the scanned-tag screen of one real qualifying item (P1 whole phone, P2 zoom on the ThriftBucks band, P3 zoom on the title + "3-day returns" badge; owner via P3), after the Calculator Save, SKUs from Eco-Thrift; numbers on a poster agree with the shot; the glove gives way to that item (W6 soft-goods doubt); P2's charcoal "0" tile approved. Still to do here: the shoot tool for the tag screen (waiting on Eco-Thrift's answer: local preview + ?type=1, or staged item responses); 08 sections 3 and 5 for P2's new keys once P2 settles; one wordmark.
- 2026-10-14: design language v2.1 (owner to P1: "I hate the stack of money": no stack on posters; "Free to join" alone is fine where there's no room). The shared shoot done: new `tools/tag_shot.mjs` drives the real scanner (local frontend, /scan?type=1, the tag typed in) with only its public API staged (Eco-Thrift's way 2: member session, trip, tag lookup; items in `tools/tag_items.json`, real SKUs with launch-day ThriftBucks). Out: art/R/shoot/tag_lamp.png (LumiSource Table Lamp 2pk, 3-day returns, $100.25, +27.81) and tag_shirt_asis.png (Minnie Mouse T-Shirt 4pk, AS IS, $43.05, +12.26), 1560 x 3376. Crops for P2 (the ThriftBucks band) and P3 (title + badge) posted in the thread.
- 2026-10-14: design language v2.2 (owner to the master): P1 = the full app (whole phone, tag screen), P2 = a snapshot of the ThriftBucks band, P3 = a snapshot of the title + 3-day returns badge; order of work: the app is finished first (APP designs, Eco-Thrift builds), then the master re-shoots (tag_shot.mjs), then the posters drop the shots in. The master's camera-view call for P1 is withdrawn. Re-shoot to-dos: the header's stack icon (owner hates the stack), and stage the trip so the trip bar doesn't show a second number beside the lamp's. Owner: the sessions are too slow; all run Opus 5.5 at xhigh effort (inherited); a one-poster build takes about 10 s, so the model and the reading are the cost, not the build.
- 2026-10-14: re-shoots. The owner wanted a cheaper example ("retails for 99, sells at 48, $16 in ThriftBucks"); Eco-Thrift: 16 isn't true on launch day (38 growth days at the 45-day cap = 28.5%), so the real Threshold Table Lamp 24in ($95.00 / $49.36 / +13.69) is the example. tag_shot.mjs: the trip now holds the item itself (trip bar and tag both +13.69, "1 in your trip"), and a camera mode feeds a photo as the phone camera from a data URL (nothing copied into frontend/). Out: tag_lamp.png (Threshold), tag_shirt_asis.png, scan_truck.png (owner to P1: "use the scanning photo like we had before... the toy truck"; the truck photo extended at the bottom with a soft blur so the zoomed camera view fills: art/R/shoot/_src/shelf_truck_ext.jpg). Design language v2.3/v2.4: P1 scans the truck (whole phone), P2 the whole phone on the lamp's tag screen (owner to P2), P3 the badge. Terms EN/ES summary aligned with the app's lines ("Free to join. Nothing owed.", "stay on your account"; no "fees"). Pending the owner: one brand plan (brush logo everywhere, drop Black Anemone, Manrope text, the note's new centre = the brush "+"), and whether to move the children to Sonnet 5.5 medium.
- 2026-10-14: prepared for the owner's yes on the brand plan: `tools/trace_logo.py` traces the original brush Thrift+ (assets/logos/thriftplus-forest.png) into vectors, word and "+" apart (scanner_art/brand/: thriftplus-brush.svg, -white.svg, wordmarkPath.brush.ts with the app's export names, a check overlay: the trace sits on the original). `scanner_art/tb_pack_plus.py` makes the ThriftBuck note with a new centre, the brush "+" in the certificate's BRIGHT green, fitted in the oval like the old TB (owner to APP: "going away from the currency symbol"); QR on; no stack. Out: tb/pack-plus/ (certificate, 1200 webp, 160 ticket, 256 note, preview). Not handed to Eco-Thrift until the owner says yes.
- 2026-10-14: design language v2.5 (owner: "the placement and the look of the phone all is the same on all three", QR below with one line): new shared macro `s.app_block(src)` in _s.j2 with its CSS in collection.css: the phone 4.6 in at x 7.7-12.3, top 2.05, bottom 11.63; under it from 11.98 the scanner QR (1.2 in) and the shared `app_line` "Scan here for / the Thrift+ app." with ecothrift.us/scan. Tested alone (QA clean, both QRs decode). build_final now wants the scanner QR on every poster. The three poster sessions told to switch (P1 scan_truck, P2 tag_lamp + a two-line title, P3 tag_lamp + its pop-out).
- 2026-10-14: owner: "we are doing away with the card altogether... no mention of CARD anywhere". Design language v2.6 (members show the member QR in the app or give their phone number; payment cards become "the way you paid"). Master did: terms EN/ES (A.3, C.3, FAQ, 1.3, s6 title, 6.4 removed, 8.1, return steps; the lost-card FAQ became "How do I show I'm a member?"), the returns register sheet (rebuilt), the shared copy base, and "card"/"tarjeta" added to the posters' banned words. Told: P1-P3 (their words), APP (the app's strings; the member QR screen is now the only way), Eco-Thrift (rulebook J2, J5, B7, B12 and all code; B12's 30-day-expiry disclosure loses its card, so the app, receipts and terms carry it: attorney).
- 2026-10-14: design language v2.7 (owner: "Member and Non-Member. Need to be LARGE and a focus... I have to get member"; "membership is free and easy like poster 1... a universal tag/symbol/call out that is on all three"). Shared: `s.who('member'|'non')` big pill labels (Nunito 900 30 pt caps; MEMBER green, NON-MEMBER charcoal) and `free_seal()` ("Membership / FREE / & easy", a green sticker on the phone's top-right corner, built into app_block, covering only the app's balance pill). "Non-member" replaces "Guest" on posters. Consultant direction posted: P1 drops its own badge, footer Guests -> Non-members; P2 leads each panel with the big label, mirrors the two panels, cuts the member tile's dead space; P3 moves MEMBER vs NON-MEMBER up under the title as the hero, cuts the text to two rows, drops "What qualifies?" (the pop-out shows it).
- 2026-10-15: J11 decided by the owner (master chat): sign-in by phone number + a 6-digit texted code (Twilio Verify), the one exception to email-first. Terms EN/ES: s10 now "photo, ID, email and phone"; new 10.4 "Sign-in codes by text" (only one-time codes on request, Msg & data rates may apply, HELP/STOP, email and password always work, never a condition, Twilio and carriers deliver, the house no-sharing sentence word for word); chart row D.3 updated. Also 10-14: s6.4 lost phone (matches B7). The /privacy wording sent to Eco-Thrift (the page is code: frontend-public/src/data/legal.ts NO_TEXTS).
- 2026-10-15: the owner changed sign-in again (master chat): no texts, no Twilio; join online with name + email, one "Tap to finish joining" email signs in; "Email me a sign-in link" (single use, up to 30 min) on a new phone; the register asks the phone number, checks ID, takes the photo; no email = join at the register (J8, J11, J12). Terms EN/ES: 10.4 sign-in codes removed, "We don't send text messages" restored, new 10.4 "Signing in" (email links), D.3 and 1.3 updated. The /privacy NO_TEXTS replacement withdrawn; an optional email sign-in line sent to Eco-Thrift.
- 2026-10-15: owner: (1) "I think non-member is better": design language v2.8, "Non-member" replaces "Guest" in every customer word; terms EN/ES done (summary, chart D.1, the AS IS line; ES "quienes no son miembros"), the register sheet rebuilt; Eco-Thrift (rulebook, receipts, register, emails) and APP told. (2) Yes to the brand plan: the brush Thrift+ everywhere, Black Anemone dropped (drop-in wordmarkPath.brush.ts sent). The ThriftBuck note without the TB and the oval, the owner's layout ("QR on the left, Seal in middle, and Thrift+ etc on the right"): new `scanner_art/tb_note_v4.py`, three variations in tb/v4/ (A his layout with the Eco-Thrift seal large in the middle; B a scalloped Thrift+ seal in the middle, the Eco-Thrift seal right; C the brush logo large in the middle, the Eco-Thrift seal right); captions moved up under the centred QR; every QR decodes. (3) The children stay on Opus.
- 2026-10-15: design language v3.0, one template for all three (owner: "a consistent approach on all three posters. layout: L/R/Bottom"): header (left) | seal (shared, now at the owner's P1 spot on all three, x 5.42-7.28 y 2.02-3.88; titles keep left of 5.25 in above 3.9 in) | right app_block | zone L (x 0.7-7.3, --zl-top to 13.18, level with the QR row's foot) | zone B (full width, 13.55-16.5) | foot4. New shared macros `s.compare(m, n, top)` (member vs "Not a member yet" panels, Nunito 44 pt big line) and `s.bottom(boxes)` (2-3 equal white boxes, 23 pt heading, 19 pt lines, about 26 characters a line), tested (QA flagged a 28-character line, so the budget is real). `who_non` = "Not a member yet" (owner: "BEFORE member or Pre-Membership or something"; policy word stays non-member). Directions posted for P1 (zones, join words per J8), P2 (compare + FAQ boxes, title clears the seal), P3 (title lines from 3.9 in, compare + three detail boxes). Eco-Thrift: /terms needs an English/Español toggle.
- 2026-10-15: /terms built by Eco-Thrift (EN | ES toggle, auto Spanish on Spanish phones; posters keep plain ecothrift.us/terms). Wording answers sent: the legal name is EcoThrift LLC (the approved Twilio profile and the filings), fixed in terms EN/ES (header line, 1.1, s12) and the register sheet (rebuilt); the chart's "Each number links..." line is a build note (now an HTML comment); the store terms' "savings, gift card balance" -> "ThriftBucks, receipts and returns"; the site's Price check tooltip "Member Price" -> "ThriftBucks"; the holds perk hidden while holds are off; Eco-Thrift's Spanish UI labels go to the native-speaker check.
- 2026-10-15: final re-shoot from Eco-Thrift's final build (:5186, worktree ecothrift-dashboard--nocardapp): brush Thrift+ header, Member QR pill, no money stack. Same files and framing (scan_truck, tag_lamp, tag_shirt_asis; old ones in art/R/shoot/_prev/). tag_shot.mjs updated for the final app: it waits up to 25 s for the tag box and submits the form the React way, waits for real camera frames, and gives headless Edge a stand-in BarcodeDetector (the app now loads its decoder with the camera; without one the camera never starts). P1-P3 told to rebuild; APP told about the decoder (its d9/scan.png camera was blank).
- 2026-10-15: POSTER 1 APPROVED by the owner ("Poster 1 is approved as it is."). Frozen to workspace/posters2/print/v4/ThriftPlus-1-Meet-13x19.pdf (13 x 19, 1 page; banned 0, missing 0, dashes 0, QR terms/join/scan all decode; sha256 84e6e67f668aab4f...). print/v4/README.md tracks approvals, the pages that must be live before printing (/terms, /join, /scan, with the sign-in release), and the rule that a change to a shared piece needs the approved poster rebuilt and re-approved. Also: my screenshot tools had leaked 63 headless Edge processes (killing the launcher left its children); stopped, and both tools now send Browser.close first.
- 2026-10-15: design language v3.1 (owner, across all three): (1) the app QR row moves ABOVE the phone on a white plate (y 2.05-3.35, readable on P3's night sky), the phone under it (y 3.5-13.08, its foot level with zone L); (2) Member / Non-member as ribbons across each panel's top-right corner (his markup; `who_non` back to "Non-member"; panel text bottom-left, big line 42 pt); (3) bottom cards: headings 21 pt one line, lines 24 characters at most (QA caught a 26), in the order a shopper asks, never repeating the panels; exact words given to P2 (use later / today / exceptions) and P3 (what qualifies / how to return / not returnable). P1 (approved) must be rebuilt and re-approved; P3's ring moves down 1.45 in.
- 2026-10-15: outside feedback on P1 triaged for the deadline (owner: "we cant be going back and fourth... what do you feel is important to actually fix"). Doing: P1 panel body text to about 18 pt with fewer words, the register card centred with the 18+ note under its steps, one gap value between blocks (P1 session); the seal about 10% smaller (1.68 in) off the QR plate, and the footer's Spanish line bold dark green (master, shared). Skipped as teardown: dropping the seal or the app QR, a 25-30% smaller phone, moving the Spanish line out of the footer. The pre-fix P1 kept for the before/after.
- 2026-10-15: owner (after the critic): "remove both on p1": P1 drops the app QR plate and the seal (`app_block(..., scan_qr=False, seal=False)`; one code to act on per poster, P1's is JOIN; the phone stays put; build_final no longer wants the scan QR on P1). Final tweaks: P2 an exact 0.3 in gap under its subline (its pre-line already cleared the seal at 4.92 in; my read was off); P3 the pre-line moved down onto its title, 0.3 in to zone L. New `tools/wall_view.py` (the three as one self-contained page) served by a new launch config "posters" (python http.server :5195 on out/S), since the browser pane snapshots local files. All three pass the checks; waiting on the owner's approval to freeze them into print/v4.
- 2026-10-15: THE SET IS APPROVED. Owner: "ok. but free and easy needs to be removed from p2 and p3": the seal is off on all three (app_block's default). All three rebuilt and frozen into workspace/posters2/print/v4/ (P1 re-frozen; P2 and P3 for the first time), each clean (banned 0, missing 0, dashes 0, QRs decode); README with sha256s and the pages that must be live before printing (/terms, /join, /scan, with the sign-in release). Design language 3.2 (final).
- 2026-10-15: design language 3.3, congruent title areas (owner: "make the title area thought through and not necc identical but consistent or congruent from p1 to p3"): shared `s.header(kicker, title, sub, size, dark)`: green kicker pill, two-line title at the largest size the left column allows (measured from the PDF: P1 80, P2 80, P3 70 pt; 104 ran "ThriftBucks." into the phone), a one-line 24 pt subline; bottom-anchored (subline ends 5.95 in), zone L at 6.25 in on all three. The master edited the three templates while the sessions held (P2 subline one line "They grow as an item sits."; P3 gets back a subline "Within 3 days, for any reason.", its member panel's first line "On qualifying items."). All three build OK; shown in the browser; the print/v4 files are now older than the builds and get re-frozen on the owner's OK.
- 2026-10-15: design language 3.4. Owner picked plate option A of four mocked (small pill, frosted, tab on the phone, plain): now the default plate, 3.1 x 0.96 in, centred over the phone, QR 0.74 in with even margins, "Scan for the app" + URL. Re-shot all three from the latest app (:5186, v2.167.0: top pill "12.40 ThriftBucks" + a QR button); tag_shot.mjs now saves the badge and reward-band boxes (data-testid badge-returns / reward-band) as <shot>.spots.json. New spotlight mask in phone_shot (owner: "a greyed out mask over the screen except for the thing being referenced... pretty dark/obvious"): 74% dark, a rounded window with a white edge; P2 on the band, P3 on the badge (P3's ring removed). All three build OK; the new header, plate and masks shown in the browser; print/v4 to be re-frozen on his OK.
- 2026-10-15: LOCKED FOR PRINT (owner: "ok lock all three into print"). print/v4 re-frozen from the design language 3.4 builds: ThriftPlus-1-Meet (sha256 d48825be0cd5d1e1...), -2-ThriftBucks (8d803c8b023ae32b...), -3-Returns (7caef8ac0a9bd6ed...); each 13 x 19, one page, fonts embedded, banned 0, missing 0, dashes 0, every QR decodes. README updated. Print only once /terms, /join and /scan are live (the sign-in release).
- 2026-10-15: owner picked ThriftBuck note A (the terms QR left, the Eco-Thrift seal large in the middle, Thrift+ over OMAHA, NEBRASKA right; no TB, no oval). Packaged under the kit's names in workspace/scanner_art/tb/pack-v4/ (certificate png, 1200 webp, 160 ticket, 256 ticket); the kit (.ai/reference/thriftbucks-mark/) updated, README rewritten for layout A, the stack/brick art moved to art/retired/ (the owner hates the stack). APP and Eco-Thrift told (ticket into TicketRain; rulebook V8's certificate line to update).
- 2026-10-15: owner: "thriftbucks WILL be on consignement... we aren't doing consignement now so remove that from all messeging". Terms EN/ES: the FAQ answer ("Yes, on anything you buy at Eco-Thrift."), 3.1 (only the first 7 days and unseen back stock), 5.2 (consignment sentence gone); the M2 perk note marked "only once Eco-Thrift starts consignment" (not printed). P2's last card now "When do they start? / After an item's first / 7 days on the floor. / Then they grow daily."; P2 rebuilt and re-locked in print/v4 (sha256 cf47c412312ab49f...); no poster PDF contains "consign". Eco-Thrift (rulebook P1, B3, the hub, code strings) and APP told. Eco-Thrift reports note A in the app, the brick deleted, V8 updated (ships in v2.167.2).
- 2026-10-15: Eco-Thrift finished the consignment clean-up (new rulebook P10: ThriftBucks will work on consignment once it starts; no customer words until then; the engine's exclusion to flip then). Owner: "hide the sell page until consignment starts": passed to Eco-Thrift (route and links off, /sell to home, the page kept in code, P10 to note its return; ships with v2.167.2).
- 2026-10-15: owner "ship and deploy": relayed to Eco-Thrift (it owns the release, v2.167.2; asked to include the uncommitted .ai docs from both sessions). Sell page: Eco-Thrift removed the nav tab, the footer link, old Shopify addresses and the sitemap entry; P10 brings it back with consignment. Website spec written (11-website.md): the home app band under the hero, the Visit "Bring your phone" block, and /thriftplus as "What is Thrift+?" from the three locked posters (EN/ES words, alt text, og image), all gated on the Thrift+ customer switch; assets in workspace/posters2/web/ (posters 1300 and 650 webp, framed app phone, og 1200x630).
