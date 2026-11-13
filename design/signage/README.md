<!-- Last updated: 2026-11-13 -->
# Store signage: sources

The sources for every Eco-Thrift store sign (Dash Updates project "Retail Signage", #111 to #115 and the rows that follow). Each sign's approved print PDF is stored on the sign in Dash (Facilities > Signage). This folder holds what makes the PDF, so any sign can be rebuilt after a change (hours, wording, rules).

| Path | What it holds |
|------|---------------|
| [`brand-board.md`](brand-board.md) | **Start here for any sign theme:** the brand board (logo, colour, materials, type, pictograms, Spanish footer, wall mock-ups) |
| [`signs.md`](signs.md) | The full list of store signs: name, where, size, wording, copies, status, and the questions for Bill |
| [`research/`](research/) | Legal research behind a sign (Nebraska / Omaha trespass posting, required notices), with source links |
| `copy/` | The exact words of each sign, one JSON file per sign (every line cites its source: the rulebook, a Dash setting, or the research) |
| `templates/` | One HTML template per sign family, plus the shared CSS (brand tokens, print sizes) |
| `tools/` | `build.py` (copy + template to HTML to PDF with headless Edge, previews, QA, 600 dpi flat copy for the Canon PRO-100), `brand_board.py` (builds the board), `mockup.py` (a sign on a wall photo at true scale) |
| `art/` | Small vector art and the few photo plates a sign uses (each plate with a JSON sidecar: model, prompt, date) |

Build output (PDF, flat PDF, PNG previews) goes to `workspace/signage/out/` (gitignored), never into this folder.

## House rules for every sign

- The method is [`.ai/extended/creative-method.md`](../../.ai/extended/creative-method.md); the measurements and QA are in [`.ai/reference/thrift-plus-posters/05-production.md`](../../.ai/reference/thrift-plus-posters/05-production.md).
- Words, numbers, logos, QR codes, icons and diagrams are live type or vector. AI art only where it reads as a real photo at 100%.
- Few words in a fixed shape; side-by-side boxes the same size; steps in the order a customer meets them; no money imagery.
- Thrift+ words only from [`.ai/extended/thrift-plus-decisions.md`](../../.ai/extended/thrift-plus-decisions.md). Store hours only from Dash (`online_sales.hours`, shown at ecothrift.us).
- Bill prints on a Canon PIXMA PRO-100 (up to 13 x 19 in): hand over the 600 dpi flattened PDF, printed at Scale None.
