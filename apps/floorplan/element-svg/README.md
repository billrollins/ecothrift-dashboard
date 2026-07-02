# Floorplan element SVGs (source files)

Top-down SVG artwork for floorplan **element kinds**. These files are **source assets** in the repo — they are **not** served directly by Django. After review, upload via the floorplan editor or `POST /api/floorplan/assets/` and attach to the element kind’s `default_image`.

## Layout

```
element-svg/
├── README.md          ← this file
├── structural/        ← wall, door, window, column, …
├── fixtures/          ← gondola, wallShelf, racks, …
├── service/           ← checkout, register, fitting room, …
├── misc/              ← pallet, trash, genericRect, …
└── custom/            ← Super Admin–created kinds (optional slug subdirs)
```

## Naming

| Rule | Example |
|------|---------|
| Filename = element **`kind` slug** + `.svg` | `gondola.svg`, `wallShelf.svg` |
| Match seeded slugs in `migrations/0004_seed_element_kinds.py` | `checkoutCounter.svg` |
| Custom kinds | `custom/my-fixture.svg` or `custom/{kind}.svg` |

## viewBox

Set `viewBox="0 0 W H"` to the kind’s **default footprint in inches** (same ratio as `default_w` × `default_h`). See [`PROMPTS_svg_generation.md`](../PROMPTS_svg_generation.md) for AI generation rules and upload sanitizer constraints.

## Seeded kinds (expected filenames)

| Category | kind | Footprint (W×H in) | File |
|----------|------|-------------------|------|
| Structural | `wall` | 96×6 | `structural/wall.svg` |
| Structural | `door` | 36×6 | `structural/door.svg` |
| Structural | `window` | 48×6 | `structural/window.svg` |
| Structural | `column` | 12×12 (circle) | `structural/column.svg` |
| Fixtures | `gondola` | 48×144 | `fixtures/gondola.svg` |
| Fixtures | `wallShelf` | 24×96 | `fixtures/wallShelf.svg` |
| Fixtures | `displayTable` | 48×72 | `fixtures/displayTable.svg` |
| Fixtures | `rackRound` | 42×42 (circle) | `fixtures/rackRound.svg` |
| Fixtures | `rackStraight` | 24×60 | `fixtures/rackStraight.svg` |
| Fixtures | `bookcase` | 12×36 | `fixtures/bookcase.svg` |
| Fixtures | `glassCase` | 24×48 | `fixtures/glassCase.svg` |
| Fixtures | `binTable` | 48×48 | `fixtures/binTable.svg` |
| Fixtures | *(custom)* | **48×24 single-sided shelf** | `fixtures/shelfSingle48x24.svg` |
| Fixtures | *(custom)* | **48×48 double-sided shelf** | `fixtures/shelfDouble48x48.svg` |
| Service | `checkoutCounter` | 96×30 | `service/checkoutCounter.svg` |
| Service | `register` | 18×18 | `service/register.svg` |
| Service | `fittingRoom` | 48×48 | `service/fittingRoom.svg` |
| Service | `cartCorral` | 48×120 | `service/cartCorral.svg` |
| Misc | `pallet` | 48×40 | `misc/pallet.svg` |
| Misc | `trash` | 24×24 | `misc/trash.svg` |
| Misc | `genericRect` | 48×48 | `misc/genericRect.svg` |

Solid-color kinds may omit an SVG until artwork exists; the editor falls back to `fill_color`.
