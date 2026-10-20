<!-- Last updated: 2026-10-16 (written from the Thrift+ poster method; social posts added) -->
# Creative method: built from elements, never one AI picture

How Eco-Thrift makes print and social creatives (posters, signs, Facebook posts). It was proven on the Thrift+ wall posters (approved 2026-10-15) and is the owner's standing method (2026-10-16: "it removes a lot of the AI look, and has clean vector font").

The poster build itself, with every measurement and test, is in [`../reference/thrift-plus-posters/05-production.md`](../reference/thrift-plus-posters/05-production.md). This file is the method in one place, plus what changes for social posts.

## The idea

A creative is **assembled**, like a page layout, not generated:

- **Words, numbers, logos, QR codes, icons, diagrams:** live type and vector in HTML, never inside an AI image. They stay sharp at any size, and every word can be checked.
- **Photos:** separate AI plates, one subject per generation at the model's top resolution (2k), each placed no larger than its pixels allow. Several plates side by side give the creative far more real resolution than one stretched image.
- **The real app:** screenshots of the actual Thrift+ app beat any illustration (owner: "show the real app").

Every plate joins the page in one of five ways (never a pasted rectangle): melt into the page colour, cutout with its own shadow, clip to a shape, halftone or duotone, or full-bleed with type over it.

## Pipeline

```
copy (JSON, every line from the rulebook) + shared CSS (brand tokens) + a Jinja2 template per creative
  -> HTML at the output size
  -> headless Microsoft Edge: PDF for print, or a screenshot at 2x for screens
  -> automatic QA (layout, fonts, dpi, banned words, required lines, QR decode)
  -> review at full view and at 100% crops; rejects logged
```

- Tools and assets: `workspace/posters2/` (gitignored, rebuildable). Logos (`assets/logos/`), icons, vector QR, the photo shoots (`art/R/shoot/`), plates (`art/*/out/`), the S collection tokens (`templates/S/collection.css`).
- Edge: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe --headless`, with `--virtual-time-budget` so web fonts land first.
- Type: Manrope for words, Nunito for numbers. Colours: the S collection greens (`--gt #1d5424`, `--gd #237a26`, `--g #3f9f35`) on `--dpage #f2f2ee`.

## The rules

- **Every word from the rulebook** ([`thrift-plus-decisions.md`](thrift-plus-decisions.md) for Thrift+). The build fails on a banned word (V2, plus "card", "guest", "rewards" as the name) or a missing required line.
- **Numbers on a creative are real:** pulled from production on the day, with the query kept beside the creative. Only numbers true on the day it runs (P9).
- **AI-slop gate** on every plate at 100%: no people, hands or faces; no text, numbers or logos; no warped geometry; no plastic or render gloss; **no money imagery** (coins, cash, stacks); edges sharp at the placed size. Regenerate until it passes.
- **Owner's taste** (posters, 10-15): few words in a fixed shape (label, short heading, one or two short lines); side-by-side boxes the same size; steps in the order a customer meets them (join, ThriftBucks, returns); photos framed for atmosphere, no dead space; show options and act on his markup literally.
- **Image API** (xAI): `grok-imagine-image-quality` reads as a real photo of a used object; `2.0` is cleaner (fields, textures). 2k maximum, fixed aspect list; the edit endpoint recomposes, so it is never an upscaler.

## Social posts (Facebook, 2026-10-16)

- **Sizes.** Feed 4:5 is the main canvas: HTML at **1080 x 1350** CSS px, rendered at device scale 2 to **2160 x 2700** PNG (upload that; Facebook downsizes cleanly and text stays crisp). The same template also renders 1:1 (1080 x 1080) and Stories 9:16 (1080 x 1920; keep the top and bottom 250 px clear of words).
- **Read at thumb size.** On a phone the post shows about 400 px wide: headline 80 px or more, body 34 px or more, fine print 22 px or more at the 1080 canvas. One idea per post; the caption carries the detail.
- **Text on the image** is the hook, the numbers and the call to action. The required legal lines go in the caption and in a small footer on the image.
- **Promoted posts** (the owner boosts them) are advertising: the legal memo's pricing rules (Q20) apply in full. Members-only claims say "members"; price claims are about ThriftBucks, never "prices dropped" or a dollar saving off tags; the B12 rewards line and ecothrift.us/terms are always there.
- **A series is one template.** Same frame, logo row and footer every time; each post changes the headline, the number block and the photo. Files: `workspace/social/` (tools, copy per post, out/).
- **The build:** `python workspace/social/tools/build.py post-01 --pct N --bucks N` (copy in `copy/post-NN.json`, template `templates/post.html.j2`). It fails on a banned word or a missing required line, and checks the layout (fixed boxes hold their words, blocks in the safe area, no overlaps). A number not given stays a marked placeholder. Edge's launcher returns before its headless child finishes and `--dump-dom` comes back empty here, so the layout QA runs as a second screenshot (`page.html#qa`): a green corner square means pass, red adds a bar naming the problem.
- **An ad is not an infographic** (owner 10-16, rejecting the first post: "that poster was not supposed to look like the instruction info graphics in the store. this is a social media AD"). An ad is one hook in huge type, one full-bleed hero photo, at most one drawn store tag or badge, and a slim brand bar with the call to action; the rules and fine print sit in a small strip and the caption. The template is `templates/ad.html.j2` (copy sets `"template": "ad"`, `photo`, `sticker`, `h1`, `sub`, and a `tag`, `chips` or `big3` badge). The in-store explainer template (`post.html.j2`) is for pages people read, not for the feed.
- **Ad photos: products on white, never a room** (owner 10-16: "people will be confused if they see a different store layout than ours"). Generate the item alone on a seamless white studio backdrop (`tools/gen_white_plates.py`; take 1 on the quality model, take 2 on 2.0, pick the one with believable geometry), then flatten the backdrop to pure white (flat-field by a dilated, blurred backdrop estimate, then melt the last levels to 255, protecting the object) so it vanishes into the white page. The page is white, the headline dark green with a yellow highlighter word, the bar green. Check every plate at 100% for brand marks and leftover backdrop smudges. A real store photo (our own floor) is the only exception to "never a room". A plate shows a similar item, never the item named on the tag, so the fine print says "Photo shows a similar item"; a real photo of the item is better for boosted ads.
- **Ad layout grid** (owner 10-16): no buttons or links drawn on the image; Facebook adds its own button, and the join link goes in the caption. One grid: every left edge on 48 px (the headline set 6 px left so its first stem lands on the line), every right edge on 1032 px. The top row is the store (Eco-Thrift logo) on the left and the news pill on the right, centred on one line; the program (Thrift+ white logo, a thin rule, "Free to join. Nothing owed.") signs the green bar with the fine print under it.
- **Replace one object, keep the rest** (10-16: the returns ad's lamp "looks too AI gen", then the toaster's cord was far too long: "VET it first for does something look off"). Generate several single objects on white (`tools/gen_objects.py`, quality model, 1:1), at least four takes of the kind you want, and **vet every take at full size before using it**:
  - **Proportions and common sense:** cords a believable length (or hidden), controls present and the right count and size (no blank panels, no merged buttons), parts that connect, nothing floating.
  - **Marks:** no letters, numbers, logos, embossing or stickers (tape and residue read as price stickers).
  - **Light and camera:** light from the upper left like the rest of the plate; a camera height close to the other objects; a scale that matches real life (a blender stands about as tall as a stand mixer).
  - **Retouch only when the fix is invisible.** A broken seam or a notch is a reject; generate again instead.
  Then composite with `tools/composite_counter.py` (multiply blend on the shared floor line, canvas widened if needed, the old object wiped, cut shadows and the pasted photo's own edges feathered on a ramp, light shadow tones smoothed) and vet the composite again: a below-246 mask must show no straight seams. The returns ad uses o_blender_4 (10-16).
- **No web addresses in organic post text** (10-16): the Eco-Thrift page gets only 2 posts with links a month without Meta One, and Facebook counts any typed address (ecothrift.us/...) as a link. Say "join at any register, or start on your phone from our website" and "full terms on our website and at every register". An address printed inside the image is not a link and may stay. Boosted (paid) ads are not limited and carry the link on Facebook's own button. Ready-to-post folders: `workspace/social/ready/<date> <name>/` (PNG, a post-text file whose blank lines hold U+2800 so Facebook keeps the spacing, a READ ME).
- **Price words in ads** (owner 10-16: people should read ThriftBucks as lower prices): "cheaper" and "lower prices" are allowed when "Thrift+ members" sits in the same view (legal memo Q20). "Cash back", "discount" and "$" next to ThriftBucks stay banned.
- **Post 1 numbers** (ThriftBucks on the floor, share of floor items with ThriftBucks): the read-only query `workspace/fb/prod_numbers.py`, run on production (needs the owner's go in the session).
