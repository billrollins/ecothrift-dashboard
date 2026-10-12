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
