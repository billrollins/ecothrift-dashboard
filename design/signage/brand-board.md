<!-- Last updated: 2026-11-13 -->
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

## 3. Materials (`art/materials/`, real-photo plates with JSON sidecars)
| Plate | File | Use |
|---|---|---|
| Kraft cardboard | `kraft.jpg` | Customer: department and price headers |
| Reclaimed wood | `wood.jpg` | Information: wayfinding boards, the store map ("Trail sign" was everyone's Information #1) |
| Denim | `denim.jpg` | Clothing department; an Information accent |
| Thrift+ sky | `../thriftplus/sky_trio.jpg` | Thrift+ signs; the sky option for Customer (use the day third, x 30 to 60%) |

Words never sit on bare texture: on a solid swatch panel, or on a plate area that measures 4.5:1. Plates are full-bleed, clipped to a shape or a band, never a pasted rectangle. A new plate must read as a real photo at 100% (`.ai/extended/creative-method.md`); log it in a sidecar.

## 4. Type (Google Fonts; one pairing per sign)
| Pairing | Heads | Text | Themes |
|---|---|---|---|
| 1 Friendly | Nunito 900 | Manrope 600 | Customer, Thrift+, Information |
| 2 Plain-spoken | Barlow Condensed 700 (caps) | Barlow 500 | Warning, Staff, hours lists |
| 3 Warm | Fraunces 700 | Manrope 600 | Customer headers, quiet plaques |

Body text at least 14 pt on Letter (scale with the sign). Few words in a fixed shape; cut words before shrinking type.

## 5. Pictograms (`templates/brand-icons.html.j2`)
`{% import 'brand-icons.html.j2' as bi %}{{ bi.icon('restroom', '#1B1F1B', '#fff') }}`. Set: restroom, exit, hours, returns, id, camera, noentry, staff, alert. Solid shapes on a 100-unit grid, square ends, cut-outs in the background colour, no faces, hands or detail; ink on light or white on dark, one colour per glyph. Every sign that asks for or forbids something carries one (Samantha, 11-13: easy pictures anyone gets at a glance, whatever their language, reading or eyesight). A new icon is drawn into this file in the same style, never taken from another set.

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
