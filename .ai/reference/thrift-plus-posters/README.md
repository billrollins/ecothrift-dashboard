<!-- Last updated: 2026-10-08 -->
# Thrift+ posters: the record

The working record for the Thrift+ launch posters. Launch is Tue 2026-10-20; printing runs from 10-09.
Started 2026-10-08 in the poster session at the owner's request ("start over; write down a record as you go").
Everything about how the posters are made lives here. The files they are made from live in `workspace/posters2/` (gitignored).

## Read in this order

| File | What it holds |
|------|---------------|
| [01-sources-and-rules.md](01-sources-and-rules.md) | Where every word comes from, the rules the copy follows, facts, open items |
| [02-copy-deck.md](02-copy-deck.md) | The exact words for each creative, with the rule behind each line |
| [03-collections.md](03-collections.md) | The four collections: design language, goals, type, colour, imagery, do and don't |
| [04-creatives.md](04-creatives.md) | The five creatives and all 60 variations, as built |
| [05-production.md](05-production.md) | How the posters are built: HTML to PDF, the image API, high-fidelity methods, QA |
| [06-log.md](06-log.md) | What was done, in order: tests, generations, rejects and why, fixes |

## Status: 60 of 60 built, all pass QA, ready for the owner

| Collection | K1 All-in-one | K2 Meet Thrift+ | K3 Prices | K4 Returns | K5 Area signs |
|------------|---------------|-----------------|-----------|------------|---------------|
| A Specimen | ready (3) | ready (3) | ready (3) | ready (3) | ready (3) |
| B System | ready (3) | ready (3) | ready (3) | ready (3) | ready (3) |
| C Tag | ready (3) | ready (3) | ready (3) | ready (3) | ready (3) |
| D Field | ready (3) | ready (3) | ready (3) | ready (3) | ready (3) |

Status words: planned, building, QA, ready (for the owner), approved, printed.

**Review files** (in `workspace/posters2/out/`):
- `Thrift+ posters - Collection <X> <Name> - review.pdf`: print resolution, one page per variation; K5 has 3 pages each.
- `... - preview.pdf`: a light version, images at 110 dpi.

## What the owner decides before anything prints

1. **Path:** one all-in-one poster (K1), or the three-sign set (K2 Meet Thrift+, K3 Prices, K4 Returns). The K5 area signs are needed either way.
2. **Collection:** one look for the whole set, picked from A, B, C or D (variations can be mixed within one collection).
3. **Copy:** headlines and lines follow the rulebook, but none is owner-approved yet (02-copy-deck).
4. **Fill-ins and checks:**
   - The warranty version date, now shown as "[date the warranty page goes live]".
   - The pages ecothrift.us/thriftplus and /thriftplus/warranty must be live, and every QR scanned, before printing.
   - A native speaker checks the Spanish lines (V5).
   - The attorney reads the warranty wording (V7).
5. **Brand:** the Thrift+ brush wordmark (rebuilt from the scanner's 720 px file) is used in Collection D. Confirm it is the official mark.

## Printing

- Print the PDF at 100% ("actual size"), never "fit to page". Each PDF page is the trim size; content stays 0.6 in inside it.
- 13 x 19 prints on the owner's printer. The 19 x 13 is the same sheet turned. The 18 x 24 variations are for a print shop.
- K5 signs are 11 x 8.5 (letter, landscape): one page per area (clothing, 18+, crossbows).

## Ground rules

- Every word comes from the Thrift+ rulebook (`.ai/extended/thrift-plus-decisions.md`). The copy deck cites the rule.
- Nothing prints until the owner approves it.
- No AI image is accepted unless it reads as a real photograph at print size. Rejects are logged in 06.
- Words, numbers, logos, QR codes and diagrams are never AI images. They are live type or vector.

## Rebuild

From the repo root:

```
python workspace/posters2/tools/build.py            # every poster
python workspace/posters2/tools/build.py B K3       # one collection, one creative
python workspace/posters2/tools/package.py A B C D  # combined review PDFs
```
