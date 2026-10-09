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
