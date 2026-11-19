<!-- Last updated: 2026-11-19 (v2: R materials) -->
# Sign brand board v1: what every sign theme is built from

Dash Update #134. Every round-3 theme (Customer, Information, Staff, and Warning after A) starts here. A theme may choose
*from* the board; it may not add its own colours, fonts, icon style or logo treatment. Round 2 failed because each theme
was invented alone from generic sign references and judged as a blank sample (Bill, 11-13: Customer "nothing to do with
Eco-Thrift", Information "doesn't have ANY branding").

- **Board:** [`brand-board.png`](brand-board.png) (150 dpi copy, committed; rebuild output in `workspace/signage/out/brand-board/brand-board.png`), `board-flat.pdf` (Tabloid landscape, 600 dpi, print this one), `board.pdf` (vector).
- **Source:** `copy/brand-board.json` (the palette values), `templates/brand-board.html.j2`, `templates/brand-icons.html.j2`, `art/materials/`, `art/walls/`.
- **Rebuild:** `workspace/signage/.venv/Scripts/python.exe design/signage/tools/brand_board.py` (Warning A, its door mock-up, then the board).

## 1. Logo
- Files: the vector masters in [`design/brand/logo/`](../brand/logo/README.md) (v2.300.1): `svg/` for sign builds, `pdf/` for print. `eco-thrift-logo-color` (light grounds), `eco-thrift-logo-white` (dark grounds), `eco-thrift-logo-black` (one-colour signs: Warning, black-only Staff), `eco-thrift-mark-color` (the leaf mark alone); `-forest` and `-color-on-dark` are there too. The templates still point at the older raster copies in `art/logos/` (`eco-full-*.png`); new work takes the vector files.
- Leaf mark + wordmark + tagline ("another chance for everything & everyone") stay together. The tagline is part of the artwork: never retyped, restyled or dropped from the full logo.
- Clear space: x on every side, x = one quarter of the logo's height. Smallest full logo: 2 in wide; below that, the leaf mark alone at 0.5 in or more.
- On a photo or texture: white logo only where the photo is dark and calm; otherwise the colour logo on a white plate (board: "On photo: on a plate").
- Every sign carries the logo (Staff too). Round 2's unbranded looks are the thing being fixed.

## 2. Colour (exact values; contrast is WCAG against white or ink type)
| Family | Swatch | HEX | RGB | Type on it | Role |
|---|---|---|---|---|---|
| Green | Forest | #1D5424 | 29 84 36 | white 9.0:1 | brand panels, headings, Staff |
| | Leaf | #3F9F35 | 63 159 53 | white 3.4:1, big words only | accents, Thrift+ member green |
| | Mint | #E7F1E3 | 231 241 227 | ink 14.4:1 | light panels |
| Brown | Bark | #4B3424 | 75 52 36 | white 11.6:1 | dark warm panels (Customer) |
| | Kraft | #B98E65 | 185 142 101 | ink 5.7:1 | kraft-coloured panels (sampled from the kraft plate) |
| | Oat | #F1E8DA | 241 232 218 | ink 13.7:1 | warm paper |
| Blue | Denim | #22406B | 34 64 107 | white 10.4:1 | Information panels |
| | Sky | #92B6D0 | 146 182 208 | ink 7.8:1 | sampled from the Thrift+ sky |
| | Mist | #E6EFF5 | 230 239 245 | ink 14.3:1 | light panels |
| Neutral | Ink | #1B1F1B | 27 31 27 | white 16.7:1 | all text |
| | Stone | #6B716B | 107 113 107 | white 5.0:1 | small notes only |
| | Page | #F2F2EE | 242 242 238 | ink 14.9:1 | background |
| | Paper | #FFFFFF | 255 255 255 | ink 16.7:1 | sign stock |
| Safety | Signal | #FF7A00 | 255 122 0 | ink 6.4:1 | Warning only, never decoration |

Text needs 4.5:1; 3:1 is allowed only for headline-size words. No jet-black signs and no notebook/index-card paper (Bill, 11-13).

## 3. Materials (`art/materials/r4/`, plates with JSON sidecars): R Real surface, Bill 11-19 "R is 100% done"
| Plate | File | Swatch it sits on | Type on it | Use |
|---|---|---|---|---|
| Kraft cardboard | `r4/kraft.jpg` | Kraft #B98E65 (plate mean #BC8B5E) | Ink, 5.4:1 worst | Customer: department and price headers |
| Pallet wood | `r4/wood.jpg` | Bark #4B3424 (mean #513626) | White, 10.1:1 worst | Information: wayfinding boards, the store map |
| Denim | `r4/denim.jpg` | Denim #22406B (mean #1C324F) | White, 10.3:1 worst | Clothing department; on a wood directory, only the Clothing marker |
| Thrift+ sky | `../thriftplus/sky_trio.jpg` | | | Thrift+ signs; the sky option for Customer (use the day third, x 30 to 60%) |

How a material sits on a sign (Astra's direction, picked by Bill): one real surface fills the sign or panel edge to edge,
no colour filter, no box; live type goes straight on its quiet middle, with joints, knots and wear kept out from under
the words. One surface per sign: a second material appears only as a small marker (a denim tab for Clothing on a wood
directory). Before printing, measure the darkest pixel under every ink word and the lightest under every white word
(4.5:1, 3:1 for headline-size words only); if it fails, move the word. A plate must read as a real photo at 100%
(`.ai/extended/creative-method.md`) and is logged in a sidecar. Sample signs: `templates/texture-sign-r.html.j2`.
History: round 1 plates `kraft.jpg`, `wood.jpg`, `denim.jpg` (rejected), rounds 2 to 4 in sections 9 to 11.

## 4. Type (Google Fonts; one pairing per sign)
| Pairing | Heads | Text | Themes |
|---|---|---|---|
| 1 Friendly | Atkinson Hyperlegible Next 800 (Bill 11-19, replaced Nunito 900) | Manrope 600 | Customer, Thrift+, Information |
| 2 Plain-spoken | Barlow Condensed 700 (caps) | Barlow 500 | Warning, Staff, hours lists |
| 3 Warm | Fraunces 700 | Manrope 600 | Customer headers, quiet plaques |

Body text at least 14 pt on Letter (scale with the sign). Few words in a fixed shape; cut words before shrinking type.

## 5. Pictograms (`templates/brand-icons.html.j2`)
`{% import 'brand-icons.html.j2' as bi %}{{ bi.icon('restroom', '#1B1F1B', '#fff') }}`. Set: restroom, exit, hours, returns, id, camera, noentry, staff, alert, arrow (points right; rotate it, added 11-19). Solid shapes on a 100-unit grid, square ends, cut-outs in the background colour, no faces, hands or detail; ink on light or white on dark, one colour per glyph. Every sign that asks for or forbids something carries one (Samantha, 11-13: easy pictures anyone gets at a glance, whatever their language, reading or eyesight). A new icon is drawn into this file in the same style, never taken from another set.

## 6. Spanish footer (every sign except Staff)
A band at the foot of the sign, under a rule: the Spanish on the left, the logo on the right. It says the headline and the key line in Spanish, never more than the English. Set in the sign's text font, regular weight, about half the size of the smallest English line. Copy: an `es` key on the sign in `copy/*.json`. Reference implementation: Warning A (`templates/warn-a.html.j2`, `.foot .es`). Staff signs keep the logo-only footer.

## 7. The families (round 3 starting points)
| Theme | Start from | Board pieces |
|---|---|---|
| Warning | **A Safety label, chosen** (B+ to A). Done here: Spanish footer added. | pairing 2, Ink + Signal, ink logo, pictograms |
| Customer | Leaf panel as a customer variation; Market stall (staff #1); Quiet plaque; the Thrift+ sky; kraft and wood | pairings 1 or 3, Green + Brown, kraft/wood/sky plates |
| Information | Trail sign (everyone's #1), Swiss Poster and Nordic Tiles *with branding*, swatches from green, brown, blue | pairing 1, Denim/Forest/Kraft, wood plate, pictograms |
| Staff | Leaf panel (staff #1), Room label (Bill's #1), Backstage band in brand colours | pairing 1 or 2, Forest + neutrals, no Spanish |
| Thrift+ | the approved posters (`.ai/reference/thrift-plus-posters/10-design-language.md`) | Sky, Leaf, pairing 1 |

## 8. Mock-up method: judge every look on a wall, at true scale
`workspace/signage/.venv/Scripts/python.exe design/signage/tools/mockup.py <wall> <sign.pdf>[@x,h] [more signs] [--out file.png]`
- Walls: `art/walls/door-block.jpg` (back-room steel door in block wall; scale from the 8 in block courses) and `store-front.jpg` (sales-floor wall by the entry; scale estimated). Both are AI stand-ins until Mainline sends real store photos.
- A sign's true size comes from its PDF page; `@x,h` puts its centre x inches from the wall's reference and h inches above the floor (default: the wall's first spot, 60 in high).
- A new wall photo needs a sidecar: the four pixel corners of one tape-measured rectangle (a door leaf), its size in inches, and its top edge's height above the floor (format in the script's docstring). Perspective is handled.
- Every round-3 look is shown to Bill as its signs mocked up on our walls, side by side with Warning A, not as blank samples.

## 9. Round 2, 11-19: textures A-D and the headline font (on the Signage page for votes)
*Rounds 2 and 3 were rejected: their plates (`art/materials/r2/`, `r3/`), the `tex-A..D` / `tex-W1..3` variants, `texture-sign.json` / `.html.j2` and their builders were removed before shipping R (11-19). Bill's photos stay in the main checkout's `workspace/signage/refs-1119/`. Headline font: Bill picked Font 4, Atkinson Hyperlegible Next 800 (11-19; Font 1 first, then changed his mind), now pairing 1 (section 4); the font study builder was removed too (the four options stay on the Signage page as draft #77).*
Bill 11-19: board liked, "textures are weird. need more subtlety" (kraft, pallet wood, denim; pallet wood, not barn wood) and
"i kind of hate the nunito font". Nothing else on the board changes. Two vote packages, manifest
`signage/drafts/manifests/20261119T205142Z.json`: `brand-textures-r2` (A-D) and `brand-fonts-r2` (Font 1-4).
- **Textures** (`templates/textures.html.j2`, one macro draws a material panel in a treatment at any size; plates in
  `art/materials/r2/` with sidecars). Each letter: the whole board with that materials section (`copy/brand-board.json`
  tex-A..D) + a department directory sign using all three materials (`copy/texture-sign.json`) on the store wall.
  - **A Whisper:** the calm photo's grain high-passed into one brand swatch (Kraft, Bark, Denim), words right on it. Worst
    case: ink on kraft 4.66:1, white on wood 10.0:1, white on denim 7.3:1.
  - **B Edge only:** flat Forest / Bark / Denim panels; a torn kraft strip, a pallet-board rail or a denim seam on the top edge.
  - **C Close and calm:** macro photos, light evened, contrast eased, no holes, seams or stains; words on solid plates.
  - **D Real pieces:** white paper, a kraft tag, a pallet board and a denim patch as cut-outs (multiply keeps their own
    shadow), the word on the piece: ink on tag 4.8:1, Bark on board 6.2:1, white on patch 7.4:1 at stroke scale.
- **Fonts** (study files removed after the pick), replacing Nunito 900 in pairing 1 only, Manrope
  stays the text font: 1 Bricolage Grotesque 800, 2 Archivo Narrow 700, 3 Plus Jakarta Sans 800, 4 Atkinson Hyperlegible
  Next 800. Each: the same Customer sign + a specimen with Spanish accents.
- **Rebuild:** `brand_board.py` once, then `workspace/signage/.venv/Scripts/python.exe design/signage/tools/texture_study.py`.
  Photo takes and processing: `workspace/signage/t134/` (gen.py, process.py; gitignored).
- **Plates, 100% log (Google gemini-3-pro-image 4K vs xAI grok-imagine-image-quality 2k, one take each):** kraft calm
  Google (fibre real; mean shifted to Kraft, it came out mauve), pallet wood calm xAI (clear pine grain; Google read as
  beech), denim calm Google (xAI twill too uniform, read as CG), denim seam xAI (near brand Denim), kraft strip, pallet
  board and kraft tag Google, denim patch xAI (Google's was wrinkled). Rejected at 100%: the first calm denim (eased to
  0.6, went teal), the first kraft whisper (4.32:1 ink), the first B denim band (too thin to see), the cut-out pallet rail
  (ragged white fringe and backdrop shadow on both edges; now the board face cropped inside its edges), the tag word over
  the grommet (moved onto the tag body).
- Fonts 2 to 4 first looked alike (Archivo 800 regular width); Font 2 became Archivo Narrow so the four are four ideas.

## 10. Round 3, 11-19: Whisper picked, made from Bill's own photos (local review, no vote package)
Bill 11-19: "A. Whisper is ok ... whisper needs a bit more cardboard and denim", then "send it mine": his photos are the
plates, not inspiration. Votes bypassed for now; he reviews PNGs in this session and picks here.
- Plates: `art/materials/r3/` `kraft-ref.webp` (1408 px), `wood-pallet-ref.webp` (1408 px), `denim-ref.webp` (1125 px), as
  given, sidecars "source: Bill, 2026-11-19". No AI plate. (A first round 3 from new AI takes was dropped unseen.)
- `workspace/signage/t134/whisper3.py`: duotone of log-luminance high-passed at 15% of the image size (his mottle, fibre,
  grain, knots and twill kept) into Kraft / Bark / Denim at three strengths: `r3/whisper-{kraft,wood,denim}-w{1,2,3}.jpg`.
  Kraft's dark side softened (x0.45) so ink holds 4.5:1 without lifting the colour off Kraft.
- Measured on the rendered pages, every word: kraft (ink) 4.9 to 5.7:1, denim (white) 6.8 to 9.1:1, wood 9.9 to 11.1:1.
- **Resolution:** on the directory sign columns (about 3.2 x 5.4 in) kraft and wood print at about 260 ppi, denim about
  210: fine. A full-bleed Tabloid panel (17 in) would be about 80 / 65 ppi: soft; a bigger sign needs a bigger photo.
- Build: `texture_study.py whisper` (board `tex-W1..3`, sign `W1..3`, `wv: r3/w<n>`); previews
  `workspace/signage/out/texture-study/W1-3.png` and `whisper-steps.png`. Fonts 1-4 unchanged, no pick yet.

## 11. Round 4, 11-19: R Real surface (Astra art-directed)
Bill 11-19 on every Whisper strength, his own photos included: "i hate them all. get some API help from astra (latest)
... or whoever the best image gen is". `gpt-6.2-astra` was shown his refs and every rejected round
(`workspace/signage/t134/astra-brief.txt`, reply `astra-reply.md`). Its verdict: each version put a filter or a frame
between the shopper and the material; use one real surface already close to the brand swatch, edge to edge, live type
straight on a quiet patch, no duotone. On a wood directory, denim only as the Clothing marker.
- Plates (`art/materials/r4/`, used as generated, sidecars): Astra's three prompts on `gpt-image-2.6` sunburst and flare,
  plus a sunburst edit with Bill's photo as the reference. Picked at 100%: kraft = the edit from his kraft photo (the
  others read as crumpled), pallet wood = sunburst (flare had a fake crosshatch), denim = sunburst. Means: kraft #BC8B5E,
  wood #513626, denim #1C324F, all close to Kraft / Bark / Denim.
- Measured: board tiles ink on kraft 5.4:1, white on wood 10.1:1, white on denim 10.3:1; signs lowest 5.2:1 (kraft) and
  8.1:1 (wood). 2048 px across 11 in prints at about 186 ppi.
- Build: `texture_study.py real` (board `tex-R`, `copy/texture-sign-r.json`, `templates/texture-sign-r.html.j2`); preview
  `workspace/signage/out/texture-study/R.png`.
