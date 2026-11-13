<!-- Last updated: 2026-11-13 -->
# Eco-Thrift logo: the vector master files

Every file here is vector: filled shapes only, with no fonts to install, no strokes, and no pictures inside. Any size prints sharp.

## Which file to use
| Need | Folder |
|---|---|
| Website, Dash, apps, slides, anything on a screen | `svg/` |
| Printing, documents, the Canon PRO-100, a print shop | `pdf/` |
| Sign shops, vinyl cutting, embroidery, Illustrator/CorelDRAW users who ask for "EPS" | `eps/` |
| Email, Word, social posts, anywhere that only takes pictures | `png/` (transparent background; `-600w`, `-1200w`, `-2400w` = pixels wide) |

## The versions (each in every folder)
| File name starts with | What it is |
|---|---|
| `eco-thrift-logo-` | **The main logo** (Bill's 2025 update): the leaf mark, "Eco-Thrift", and "another chance for everything & everyone" |
| `eco-thrift-logo-store-line-` | The main logo plus "THRIFT AND WHOLESALE / RETAIL STORE" over the green rule (banners, the store front) |
| `eco-thrift-mark-` | The leaf mark alone (app icons, small spaces, stickers) |
| `eco-thrift-wordmark-` | "Eco-Thrift" and the tagline, no mark |
| `eco-thrift-logo-stacked-2021-` | The designer's original 2021 logo: the mark over ECO-THRIFT |

Colourways (the last word of the name):
- `color`: the green gradient mark, black text, for white or light backgrounds.
- `color-on-dark`: the gradient mark, white text, for dark backgrounds.
- `black`: one colour, for one-colour printing and stamps.
- `white`: one colour, for dark backgrounds and photos.
- `forest`: one colour, in Forest green.

In the one-colour versions the leaf is cut out of the circle, so the background shows through.

## Colours and fonts
| What | Value |
|---|---|
| Mark gradient | `#8DC63F` to `#528540` (the designer's file) |
| Store-line rule | `#6FA641` |
| Forest (one-colour) | `#1D5424` (the brand board) |
| "Eco-Thrift" | Varela Round with a synthetic bold: every edge widened by 1/48 of the font size, matching how GIMP draws "bold" for this font |
| Tagline | Crimson Pro Bold |
| THRIFT AND WHOLESALE / RETAIL STORE | Montserrat Bold |
| ECO-THRIFT (2021 stacked) | the designer's outlines |

All three fonts are free Google Fonts. The logo files don't need them installed, because the letters are already shapes. Use the logo as a whole: never retype "Eco-Thrift" in a font to stand in for it.

## How it was made, and how close it is
- **The mark and the 2021 wordmark** come straight from the designer's Illustrator file (`source/eco-thrift-logo-2021-designer.ai`; Bill's OneDrive copy is `Media/Images/Brand/EcoThrift Logo - AI.ai`). Every shape and both gradients were translated exactly. A 300 dpi render of the new file differs from the original by at most 21/255 in colour, and only on anti-aliased edges.
- **The 2025 lockup** follows Bill's GIMP file (`Media/Brand/Logo & Text.xcf`, 600 dpi). The text is set in the real fonts at the exact sizes in that file, and each piece is placed by where its ink sits in that file (`tools/xcf-ink.json`).
  - Rendered at 600 dpi, every pixel of the mark, "Eco-Thrift", the tagline, RETAIL STORE and the rule is within 2.5 px (0.1 mm) of the GIMP file. The only differences are the soft edge pixels.
  - THRIFT AND WHOLESALE has a few letters 2 to 3 px off, because GIMP snaps each letter to whole pixels. This file keeps the font's true letter spacing.
- The original EPS (`Media/Images/Brand/EcoThrift Logo - EPS.eps`) holds the same artwork as the AI file.

## Copies in the apps
The apps can't read this folder, so they keep copies. When the master changes, copy the SVGs again and scale the PNGs again from `png/` (Pillow, Lanczos).

| Copy | Made from | Used by |
|---|---|---|
| `frontend/src/assets/eco-thrift-logo-color.svg`, `eco-thrift-logo-white.svg`, `eco-thrift-mark-color.svg` | `svg/`, as is | Dash: sidebar, phone top bar, sign-in, consignee bar, Design Lab |
| `frontend/src/assets/eco-thrift-logo-white-600w.png` | `png/`, as is | Social Studio photo mark (drawn into a canvas that is exported) |
| `frontend/src/assets/eco-thrift-mark-color-32.png` | `png/eco-thrift-mark-color-1024w.png`, scaled | Dash favicon |
| `frontend-public/src/assets/eco-thrift-logo-color.svg`, `eco-thrift-logo-white.svg` | `svg/`, as is | ecothrift.us header and footer |
| `frontend-public/public/eco-thrift-logo-color.svg` | `svg/`, as is | the holding page (`/static/site/`) |
| `frontend-public/public/favicon.png` (32 px), `apple-touch-icon.png` (180 px on white), `logo-full-halfsize.png` (1466 x 360), `logo-full-240x80.png` | `png/`, scaled | ecothrift.us favicon, and the old public addresses |

Not made from these files: the print server's receipt and label logo, `frontend/src/printing` (`label-logo-bw.png`), and the Thrift+ app icons.

## Rebuild
`workspace/signage/.venv/Scripts/python.exe design/brand/logo/tools/make.py` remakes `svg/`, `pdf/`, `eps/` and `png/` in about 30 seconds.
- It needs Edge, found on PATH, then in the `EDGE` env var, then in `docs/machines.md`.
- It needs PyMuPDF from the sign tool venv.
- Scratch files go to `workspace/logo-build/`.

What the steps are is listed at the top of `tools/make.py`.
