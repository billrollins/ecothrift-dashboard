<!-- Last updated: 2026-10-08 -->
# Production

## As built (10-08): the tools

All in `workspace/posters2/tools/`, run from the repo root:

| Tool | What it does |
|------|--------------|
| `gen_plates.py` + `plate_specs.py` | Generates every AI plate (xAI, 2k). Each comes with a JSON sidecar holding the prompt and settings. |
| `prep_A.py`, `crop_A.py` | Collection A objects. "Melt" (backdrop modelled and replaced by the page colour; GrabCut object plus nearby shadows) or chroma-blue cutout (red-to-blue ratio key, shadows as a separate multiply layer). Crops are tight, with the object box recorded in `art/A/out/crops.json`. |
| `prep_C.py`, `tags.py` | Collection C. Seamless kraft and thermal sheets, vector tags, twine, perforations, the HTML rubber stamp, the thermal slip. |
| `prep_D.py` | Collection D. Field and bokeh print plates (300 dpi, grain, bottom fade into the page), the dark bokeh, the mug melt and the traced brush stroke. |
| `assets.py` | Icons, logos (including the rebuilt Thrift+ wordmark in four colourings) and vector QR codes. |
| `build.py` | Templates to HTML to PDF (Edge), previews, QA and contact sheets. |
| `package.py` | The combined review and preview PDFs. |

Glass objects (the decanter) get a drawn, neutral contact shadow, because the photographed caustics read as stains in print.

## Pipeline

```
copy.json + collection CSS + Jinja2 template (one per variation)
  -> HTML at print size (13in x 19in etc., CSS @page)
  -> PDF via headless Microsoft Edge (Chromium print engine)
  -> PNG previews via PyMuPDF (from the PDF itself, so QA sees what prints)
  -> automatic QA (below) -> my visual review at full size and at 100% crops
```

- **Files.**
  - `workspace/posters2/` holds `tools/`, `copy/copy.json`, `assets/` (logos, QR, icons), `art/<collection>/` (generated plates, each with a JSON sidecar), `templates/<collection>/`, and `out/<collection>/`.
  - Recreatable with `tools/build.py`.
- **Type.**
  - Spectral and Manrope load from Google Fonts at render time. Edge gets `--virtual-time-budget` so the fonts land before printing.
  - Spectral embeds as TrueType. Manrope, a variable font, embeds as Type3 vector outlines. Both are vector in the PDF.
  - QA checks `document.fonts` in the page.
- **Colour.** RGB PDF, which suits home inkjet and print-shop digital presses. No CMYK conversion needed unless the poster goes to offset.
- **Trim and safe area.**
  - The PDF page is the trim: 13 x 19 in, 19 x 13 in, 18 x 24 in, or 11 x 8.5 in for K5.
  - Backgrounds run to the trim, and all content stays 0.6 in inside it.
  - For a print shop, add 0.125 in bleed by rebuilding with `--bleed`.

## What Chrome's PDF engine keeps sharp (tested 10-08, `_probe/pdftest`)

| Technique | Result in the PDF | Use? |
|-----------|-------------------|------|
| `<img>` JPEG or PNG | Original pixels embedded (416 dpi in the test) | Yes |
| `mix-blend-mode: multiply` | Original pixels, blend kept | Yes |
| CSS `clip-path` polygon | Original pixels, vector clip | Yes |
| SVG `clipPath` with `<image>` | Original pixels, vector clip | Yes |
| CSS `filter` (grayscale) | Rasterised at 300 dpi | Avoid; bake effects in Python |
| CSS `mask-image` gradient | Soft mask rasterised at **72 dpi** | **Never.** Feathered edges are baked into PNG alpha at full resolution |
| Spectral (static font) | TrueType, vector | Yes |
| Manrope (variable font) | Type3 outlines, vector | Yes |

## The image API (measured 10-08)

- **Models on our key** (`GET /v1/image-generation-models`):

  | Model | Price per image | Notes |
  |-------|-----------------|-------|
  | `grok-imagine-image` | $0.02 | |
  | `grok-imagine-image-quality` (alias `-pro`) | $0.05 | |
  | `grok-imagine-image-2.0` | $0.06 | Newest |

- **`resolution`** takes `1k`, `1.5k` or `2k`. There is no 4k; asking for it returns a 422.
- **`aspect_ratio`** takes one of: 1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2, 9:19.5, 19.5:9, 9:20, 20:9, 1:2, 2:1, 21:9, 5:2, auto. 13:19 is refused.
- **Output at 2k:**
  - 2:3 is 1664 x 2496 PNG.
  - 1:2 is 1456 x 2912.
  - 1:1 is 2048 x 2048.
  - 16:9 is about 2816 x 1584 (reported by others).
- **Model look.**
  - **quality/pro** reads as a real photograph of a used object: patina, a cord, natural light. It's the choice for Specimen and Tag photos.
  - **2.0** is cleaner and catalog-like, with more symmetry. It's the choice for Field plates and textures.
  - Each plate is auditioned on both when the look matters.
- **The edit endpoint** (`/v1/images/edits`) with `resolution: "2k"` returns 2048 px. But it **re-composes the picture**: in the test it zoomed out, added a lampshade and changed the backdrop colour.
  - **It is rejected as an upscaler.** Tiling it would give visible seams and mismatched details.
  - It may be used to restyle a plate on purpose, never to enlarge one.

## High fidelity: the rules

Effective resolution = image pixels / printed inches. Targets at print size:

| Content | Minimum | How we get there |
|---------|---------|------------------|
| Hero objects (sharp detail) | 200 dpi (aim 250+) | One object per generation at 2k, so the object fills the frame. Placed no larger than about 8 in by 12 in. |
| Full-bleed soft plates (sky, field, bokeh, paper) | 125 dpi | 2k at the nearest ratio, placed full bleed. Lanczos upscale to 300 dpi plus a 300 dpi print-grain layer, so the softness reads as photographic, not blurry. |
| Halftone plates (System) | Any | Dots drawn at 600 dpi from the 2k source. The dot pattern itself is the detail. |
| Textures (kraft, thermal paper) | 400 dpi | 2048 px tile made seamless (offset and cross-fade), repeated about every 5 in. |
| Traced art (brush stroke, line art) | Vector | `vtracer` to SVG, recoloured. Rejected if the trace is lumpy at 100%. |
| Logos | 600 dpi+ | Eco-Thrift master is 10013 px. The Thrift+ brush mark (720 px) is rebuilt: alpha upscaled 6x and re-thresholded, or traced. It is only used when sharp at 100%. |
| Type, diagrams, icons, QR | Vector | Never images. |

**Composition beats enlargement.** When a poster needs a lot of photographic area, it is built from several separately generated plates, each sized to keep its own resolution, never from one image stretched over the whole sheet. Examples: a background plate plus a hero object plus a tag photo.

**Not square imports.** Every plate joins the page in one of five ways:
1. **Melt.** The backdrop is colour-matched to the page and the alpha feathered at full resolution.
2. **Cutout.** The object is masked from a uniform backdrop, and its real contact shadow is kept as a multiply layer.
3. **Shape clip.** A tag silhouette, rounded card, arch or circle, as a vector clip.
4. **Halftone or duotone.**
5. **Full-bleed background** with type set on it.

The `tools/plates.py` operations are `match_backdrop`, `cutout`, `feather`, `halftone`, `seamless_tile`, `grain`, `vectorize` and `fit_dpi`.

## Prompts

- **Every image prompt** says:
  - what the object or plate is,
  - the backdrop (seamless, with its colour named),
  - the light (soft window light from the upper left),
  - the camera feel (medium format, natural colour),
  - real wear,
  - "no text, no letters, no numbers, no logos, no people, no hands".
- **Thrift objects** are everyday secondhand things from the 1950s to the 1990s.
- **Tags in photos** are always blank. Any mark on a tag is a reject.
- Prompts are saved in each image's JSON sidecar.

## AI-slop gate (every plate, at 100%)

**Reject** if any of these is true:
- **People:** any face, hand or person.
- **Text:** any letter, number, glyph-like mark or logo.
- **Geometry:**
  - warped geometry (melted edges, bent cords that go nowhere, impossible joints),
  - duplicated parts,
  - an object that could not be manufactured.
- **Light:**
  - plastic or waxy surfaces,
  - "render" gloss,
  - HDR halos,
  - light that disagrees with the poster's light direction.
- **Money:** coins, cash, wallets or price stickers with numbers.
- **Backdrop:** gradients that will not colour-match cleanly.
- **Edges:** soft or smeared edges at print size (checked by a 100% crop at the placed size).

Every reject is logged in 06 with its reason; the plate is regenerated until it passes.

## Automatic QA (every build)

1. **Layout.** No text element overflows its box or the 0.6 in safe area; no two text blocks overlap. This runs as an in-page script, read back with `--dump-dom`.
2. **Fonts.** Spectral and Manrope are actually loaded (`document.fonts.check`).
3. **Image resolution.** Effective dpi of every placed raster against the table above.
4. **Words.**
   - No V2 word ("fee", "gift card", "store credit", "points", "cash back", "Member Price" as a name, "Bank it", and the rest).
   - No em or en dash.
   - No dollar amount except "$10" and "$5".
5. **Required lines per creative.**
   - K1 to K3: no cash value.
   - Wherever "Free to get your card" appears, the cover line too.
   - The Spanish line on every sign.
   - K4: the warranty title, the address, the SOLD AS IS box.
   - Every QR.
6. **QR.** Each QR decodes to its intended URL (rendered from the PDF and read back).

Then my review of every page at full view and at 100% crops, against the collection's do and don't list.
