# Eco-Thrift Print Server — Changelog

All notable changes to the print server are documented here.
Run `python distribute.py` from this directory to build and publish a new release.

---

## [1.2.38] — 2026-03-28

### Changed
- **Price stripe:** finer `big_base` ladder by dollar digit count (`nd` 4–8+), so long comma-formatted amounts fit at scale **1.0** on 1.5×1 / 3×2 without shrinking

---

## [1.2.37] — 2026-03-27

### Changed
- **Price stripe:** smaller **$** glyph; larger **dollar line** and **cents** (`big_base` tiers + cent scale; fallback sizes aligned)

---

## [1.2.36] — 2026-03-27

### Changed
- **Price stripe:** when **whole dollars are 0** (e.g. `$0.75`), draw **`$` + cents only** — no large middle `0` line; separate two-glyph fit loop

---

## [1.2.35] — 2026-03-27

### Changed
- **Price stripe:** fit loop uses scales **1.0 → 0.5** step **0.01**; optional `price_fit_stats` on `generate_label` reports `first_fit_scale` and `used_fallback`
- **Dev:** `scripts/label_price_fringe_grid.py` — fringe PNGs + console summary under `output_label_fringe_review/` (gitignored)

---

## [1.2.34] — 2026-03-26

### Changed
- **Price stripe:** large **dollar digits** use extra **left inset** (`pad_x + max(3, col1_w // 22)`); `$` stays at `pad_x`; layout fit check uses the new x

---

## [1.2.33] — 2026-03-26

### Changed
- Label QR: **plain QR** (no center logo); removed `services/branded_qr.py`
- Label footer: **legacy** `ecothrift_logo_bw.png` only; removed wide lettermark asset path and footer inset
- PyInstaller: bundle `ecothrift_logo_bw.png` only (no icon/letters)

---

## [1.2.32] — 2026-03-26

### Changed
- Branded QR: **minimum QR version floor 1** so short SKUs can use **v1** (fewest modules / largest cells at a given label QR size); previous floor still forced v3+ when v1 fit
- `print_label_local_test.py`: default rows from **`workspace/testing/data/retag_e2e_10_items.json`**; `--sample` for `SAMPLE_LABEL_ROWS`; `--file` / `--limit`

---

## [1.2.31] — 2026-03-26

### Changed
- Branded QR: default **logo ratio 0.38**; **minimum QR version 3** (larger modules vs v4 floor; long payloads still upgrade)

---

## [1.2.30] — 2026-03-26

### Changed
- Label footer lettermark: small **horizontal/vertical inset** so the wordmark is not flush to band edges

---

## [1.2.29] — 2026-03-26

### Changed
- Label footer: **wide lettermark** (`ecothrift_logo_letters.png`) width-first in the bottom band; bundled in PyInstaller

---

## [1.2.28] — 2026-03-26

### Changed
- Branded QR default logo ratio **0.42**

---

## [1.2.27] — 2026-03-26

### Changed
- Branded QR: default logo ratio **0.40** (very large overlays e.g. **0.48** are unreliable for scanning)

---

## [1.2.26] — 2026-03-26

### Changed
- Branded QR center logo: **larger** default (ratio **0.42**)

---

## [1.2.25] — 2026-03-26

### Changed
- Branded QR: **minimum QR version** (default **4**) for denser modules on short SKUs; longer payloads still upgrade as needed

---

## [1.2.24] — 2026-03-26

### Changed
- Branded QR center icon: **100×100** B/W asset; default logo overlay **larger** (ratio **0.32**)

---

## [1.2.23] — 2026-03-26

### Changed
- Label QR codes: **branded** center logo (Eco-Thrift icon + white pad) on top of QR; still **H** error correction; icon added to frozen `assets/`

---

## [1.2.22] — 2026-03-26

### Changed
- Label right column: **word limits** on title and brand (first words + `…`), tighter line caps, slightly **larger** fonts for readability

---

## [1.2.21] — 2026-03-26

### Changed
- Label QR codes use error correction **H** (high, ~30% recovery) instead of **L**

---

## [1.2.20] — 2026-03-26

### Fixed
- Price stripe: cents anchor corrected (`rb` at inner bottom-right) so `.XX` is not drawn past the right edge of the black band

---

## [1.2.19] — 2026-03-26

### Changed
- Price stripe: **diagonal layout** — large `$` top-left, cents bottom-right, dollar digits **left-justified** at `pad_x` and **vertically centered** between `$` and cents
- Left column: **equal** price band and QR band height (50/50)

---

## [1.2.18] — 2026-03-26

### Changed
- Price stripe: **top-aligned** (was vertically centered), **taller** black band (~54% height), larger dollar/`$`/cents and tier bumps for multi-digit prices
- Right column: **smaller logo band** (~28% height), slightly less top inset on title block

---

## [1.2.17] — 2026-03-26

### Changed
- Tighter margins (price band, columns, text inset, QR inset); slightly more room for copy (smaller logo band)
- Larger title, subtitle, and brand fonts; larger price-stripe `$` and cents

---

## [1.2.16] — 2026-03-26

### Changed
- **Typography:** larger title, title overflow, and brand on the label
- **Price stripe:** larger `$` and cents; smaller main dollar figure; dollars left-aligned to the right of the `$` column; cents still right-aligned on the third line

---

## [1.2.15] — 2026-03-25

### Removed
- Printed SKU under logo

### Changed
- Logo vertically centered in bottom band again

---

## [1.2.14] — 2026-03-25

### Added
- **SKU** text under the logo (`product_model` or `qr_data`)

### Changed
- **Logo** top-aligned in a slightly taller bottom band (room reserved above SKU)

---

## [1.2.13] — 2026-03-25

### Changed
- **Logo:** larger fit (uniform scale to cell), uses full column width and logo band; centered vertically in band

---

## [1.2.12] — 2026-03-25

### Changed
- **Price stripe:** bigger `$`; centered dollar amount line; cents still right-aligned

---

## [1.2.11] — 2026-03-25

### Changed
- **Price stripe:** stacked lines ($ / dollars / cents); thousands separators; scaling for long dollar strings

---

## [1.2.10] — 2026-03-25

### Changed
- **Price stripe:** tighter vertical padding and symbol gap; larger dollars with optional one-point grow to fill band height; cents closer to dollars

---

## [1.2.9] — 2026-03-25

### Changed
- **Price stripe:** `$` tucked upper-left; dollars + cents as one horizontal unit with cents tight to bottom-right of dollars

---

## [1.2.8] — 2026-03-25

### Changed
- **Price stripe:** `$` top-left, whole dollars left-aligned, cents right-aligned

---

## [1.2.7] — 2026-03-25

### Changed
- **Label price stripe:** clearer vertical spacing between `$` / dollars / cents (`anchor="lt"` + bbox-based advance; extra gap before cents)
- **QR sizing:** single rule from stripe width (~98% of column) so 3×2 and 1.5×1 share the same proportional logic

---

## [1.2.6] — 2026-03-25

### Fixed
- **GDI label print:** vertical placement is **top-aligned** (`py = 0`) after fit; horizontal **centering** unchanged. Vertical centering could split one label across **two** feeds when `VERTRES` is taller than a single label.

---

## [1.2.5] — 2026-03-25

### Fixed
- **GDI label print:** `send_image` now **fits** the bitmap inside the driver’s **printable** rectangle (`HORZRES`×`VERTRES`) and **centers** it. Drawing only from `LOGPIXELSX` at `(0,0)` often mis-sized or mis-aligned on thermal/Rollo (left clip + empty right when logical DPI and printable width disagree).

---

## [1.2.4] — 2026-03-25

### Changed
- Stripe column **⅓** width; **50/50** split: price band top half, QR bottom half (same proportions on 3×2 and 1.5×1)
- QR targets **~1″** (3×2) and **~0.5″** (1.5×1), snug within the lower cell

---

## [1.2.2] — 2026-03-25

### Changed
- Black price band: no SKU; price drawn as stacked lines (no overlap)
- QR code max size capped (especially on 3×2)

---

## [1.2.1] — 2026-03-25

### Changed
- Wider price column; QR placed under the price block in that column (full column width, margined)
- Second column: larger product text on top; logo fills column width at the bottom

---

## [1.2.0] — 2026-03-25

### Changed
- **Side Stripe label** (consultant Concept C): black left column for price + SKU, product copy + QR + logo on white; no rotation; no Code128; scaled for 3×2 and 1.5×1 stock at 203 DPI

### Removed
- Code128 strip and `python-barcode` dependency

---

## [1.1.1] — 2026-03-25

### Added
- Optional **brand** and **model** lines on labels (`product_brand`, `product_model` on `POST /print/label`)
- **Local test:** `dev_print_label_test.bat` / `scripts/print_label_local_test.py` — print sample rows without FastAPI (`--dry-run` → PNGs in `output/`)

---

## [1.1.0] — 2026-03-25

### Added
- V2-inspired label layout: branding column (logo + Eco-Thrift + tagline on large stock), centered QR, rotated price and product title with vertical rule
- `label_size_preset` in persisted settings: `3x2` or `1.5x1` (landscape inches at 203 DPI); configurable on built-in `http://127.0.0.1:8888/` and dashboard Settings when the print server is online
- Optional bundled logo `printserver/assets/ecothrift_logo_bw.png` for the branding column

### Changed
- Code128 linear barcode: **3×2** only (thin strip under content); **1.5×1** is QR-only

---

## [1.0.7] — 2026-03-25

### Added
- Installer (`installer/setup.py`) removes legacy **V2** print stack before installing **V3**: Startup VBS, `C:\DashPrintServer` / `C:\PrintServer` when they look like Python+v2 installs (`print_server.py` + `venv\`), plus existing port-8888 / frozen-exe stop
- `installer/uninstall_legacy_prior.bat` — optional manual cleanup for IT (same goals, CMD best-effort)

---

## [1.0.6] — 2026-02-25

### Fixed
- Update check no longer blocked by browser CORS policy — version check is now proxied through the print server itself (`GET /manage/check-update`) so no cross-origin request is ever made from the browser
- Auto-start toggle now shows an **"Enabled"** (green) / **"Disabled"** (grey) text label next to the switch so the current state is always unambiguous
- Added `http://127.0.0.1:8888` to Django `CORS_ALLOWED_ORIGINS` as an additional fallback

---

## [1.0.5] — 2026-02-25

### Fixed
- Uninstall from `/manage` now works correctly — no longer requires `setup.exe` in the install directory; cleanup is performed inline with a detached process
- Update check runs automatically on `/manage` page load — no manual button click required
- Update check URL defaults to the production dashboard (`dash.ecothrift.us`) out of the box; no manual `settings.json` editing needed
- Download link on `/manage` now correctly resolves to the S3 file URL (`download_url` field added to public version endpoint)
- Installer now kills any process listening on port 8888 (not just `ecothrift-printserver.exe`) — fixes silent reinstall failure when a dev server was running as `python.exe`
- `distribute.py` version check no longer breaks when Django shell prints import noise to stdout
- Post-uninstall page shows a clear "Server stopped — close this window" message instead of a silently failing `window.close()` call

---

## [1.0.4] — 2026-02-25

### Fixed
- Setup exe is now self-contained: server exe is bundled inside the installer
- Users download one file (`ecothrift-printserver-setup-v1.0.4.exe`), run it, installs everything
- `distribute.bat` now uploads the setup exe (not the raw server exe) to S3

---

## [1.0.3] — 2026-02-25

### Added
- `/manage` page: status, uptime, auto-start toggle, latest-version check, full changelog, uninstall
- Public (no-auth) Django endpoint for version checking from the management page
- Installer now opens `http://127.0.0.1:8888/manage` in browser automatically after install
- `--uninstall` CLI flag on `setup.exe` for headless uninstall triggered from `/manage`

---

## [1.0.2] — 2026-02-25

### Fixed
- Installer GUI now appears correctly (Tkinter `font` keyword conflict resolved)
- Print/test calls no longer time out when using PDF or virtual printers (timeout raised to 120 s)
- Build script now kills locked exe before rebuilding (no more `PermissionError` if server is running)

---

## [1.0.1] — 2026-02-25

### Fixed
- Labels and receipts now print correctly on all Windows printers (GDI via `win32ui` instead of raw bytes)
- Print server no longer crashes when launched silently via the installer (`--noconsole` PyInstaller mode)
- Distribution script no longer requires credentials — uses Django management commands directly

---

## [1.0.0] — 2026-02-25

### Added
- Initial release
- FastAPI server on localhost:8888
- `GET /health` — server status, version, printer count
- `GET /printers` — enumerate Windows printers with status
- `GET /settings` / `PUT /settings` — persist label/receipt printer assignment
- `GET /` — built-in browser-based configuration UI
- `POST /print/label` — print inventory labels (GDI, works with any Windows printer)
- `POST /print/test` — test label
- `POST /print/receipt` — print POS receipts (GDI text, monospace)
- `POST /print/test-receipt` — test receipt
- `POST /drawer/control` — ESC/POS cash drawer kick via receipt printer
- Windows installer (`setup.exe`) with auto-start option
- Settings persisted to `settings.json` next to executable
