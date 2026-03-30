VERSION = "1.2.38"
RELEASE_NOTES = "Labels: big_base tiers by digit count — first fit at scale 1.0 for long prices."

# Default URL for the public version-check endpoint on the dashboard backend.
# Users can override this in settings.json via the /manage page (useful for local dev).
UPDATE_CHECK_URL = "https://dash.ecothrift.us/api/core/system/print-server-version-public/"

CHANGELOG = """\
## [1.2.38] — 2026-03-28

### Changed
- **Price stripe:** finer ``big_base`` ladder by dollar **digit count** (``nd`` 4–8+), so long comma-formatted amounts fit at **scale 1.0** on 1.5×1 / 3×2 without shrinking

---

## [1.2.37] — 2026-03-27

### Changed
- **Price stripe:** smaller **``$``** glyph; larger **dollar line** and **cents** (``big_base`` tiers + cent scale; fallback sizes aligned)

---

## [1.2.36] — 2026-03-27

### Changed
- **Price stripe:** when **whole dollars are 0** (e.g. ``$0.75``), draw **``$`` + cents only** — no large middle ``0`` line; separate fit loop for two glyphs

---

## [1.2.35] — 2026-03-27

### Changed
- **Price stripe:** fit loop uses scales **1.0 → 0.5** step **0.01** (``int()`` may plateau across steps); optional ``price_fit_stats`` on ``generate_label`` reports ``first_fit_scale`` and ``used_fallback``
- **Dev:** ``scripts/label_price_fringe_grid.py`` — fringe PNGs + console summary under ``output_label_fringe_review/`` (gitignored)

---

## [1.2.34] — 2026-03-26

### Changed
- **Price stripe:** large **dollar digits** use extra **left inset** (``pad_x + max(3, col1_w // 22)``); ``$`` stays at ``pad_x``; layout fit check uses the new x

---

## [1.2.33] — 2026-03-26

### Changed
- **Label QR:** **plain QR** (no center logo overlay); removed ``services.branded_qr``
- **Label footer:** **legacy** ``ecothrift_logo_bw.png`` only; removed wide lettermark (``ecothrift_logo_letters.png``) and lettermark-specific inset
- **PyInstaller:** bundle only ``ecothrift_logo_bw.png`` (no icon/letters assets)

---

## [1.2.32] — 2026-03-26

### Changed
- **Label QR:** **minimum QR version floor 1** so ``best_fit`` can pick **v1** for short SKUs (largest modules at a given pixel size); floors 3–4 were still forcing a denser grid when v1 fits
- **Local label test:** default data file ``workspace/testing/data/retag_e2e_10_items.json`` (``--sample`` for embedded rows; ``--file`` to override)

---

## [1.2.31] — 2026-03-26

### Changed
- **Label QR:** branded default **logo ratio 0.38**; **minimum QR version 3** (larger modules on short payloads; long payloads still upgrade)

---

## [1.2.29] — 2026-03-26

### Changed
- **Right column footer:** **wide wordmark** (``assets/ecothrift_logo_letters.png``) scales to **fill column width**; QR column still uses round branded icon. Slightly shorter footer band; legacy ``ecothrift_logo_bw.png`` still used if letters asset missing

---

## [1.2.28] — 2026-03-26

### Changed
- **Label QR:** default branded logo ratio **0.42**

---

## [1.2.27] — 2026-03-26

### Changed
- **Label QR:** default branded logo ratio **0.40** (ratios **~0.48+** often fail to scan on phones despite H correction)

---

## [1.2.26] — 2026-03-26

### Changed
- **Label QR:** **larger** branded center logo (``DEFAULT_LOGO_RATIO`` **0.42**)

---

## [1.2.25] — 2026-03-26

### Changed
- **Label QR:** enforce **minimum QR version** (default **4**) so short payloads still use a finer module grid; long payloads still auto-scale up as needed

---

## [1.2.24] — 2026-03-26

### Changed
- **Label QR:** center icon updated to **100×100** B/W source; **larger** default overlay (``DEFAULT_LOGO_RATIO`` **0.32**)

---

## [1.2.23] — 2026-03-26

### Changed
- **Label QR:** **branded** — circular logo composited in center (white pad ring) over QR; still **error correction H**; grayscale for thermal. Icon file ``assets/ecothrift_logo_icon.png`` (bundled in exe).

---

## [1.2.22] — 2026-03-26

### Changed
- **Right column:** title/brand clipped to **leading words** (ellipsis if cut); fewer lines (bold **2** + sub **1** + brand **1**); slightly **larger** title/sub/brand fonts

---

## [1.2.21] — 2026-03-26

### Changed
- **Label QR:** error correction **H** (high, ~30% recovery) instead of **L** (~7%)

---

## [1.2.20] — 2026-03-26

### Fixed
- **Price stripe:** cents used **wrong anchor** (``lb`` at the inner corner drew text to the **right** of the band). Now **``rb``** so cents sit bottom-right **inside** the black stripe.

---

## [1.2.19] — 2026-03-26

### Changed
- **Price stripe:** large **$** top-left; **cents** bottom-right (~23×fs); **dollar digits** left at ``pad_x``, vertically centered between ``$`` and cents; **equal** price/QR column heights (50/50)

---

## [1.2.18] — 2026-03-26

### Changed
- **Price stripe:** top-aligned stack (no vertical centering); **taller** left price band (~54% height); tighter internal gaps; larger **$** / dollar / cents sizes and **big_base** tiers (esp. 3–5 digit dollars)
- **Right column:** smaller **logo band** (~28% height); slightly higher text start

---

## [1.2.17] — 2026-03-26

### Changed
- **Margins:** slimmer price-stripe padding, column gap, right margin, QR inner margin, text column inset; slightly shorter logo band (~34% height); tighter line spacing for title/brand
- **Typography:** title **25×fs**, subtitle **20×fs**, brand **18×fs** bases
- **Price stripe:** larger **$** (23×fs) and **cents** (21×fs); dollar line tiers slightly larger; fallback fonts bumped

---

## [1.2.16] — 2026-03-26

### Changed
- **Right column:** larger **title** (22×fs), **subtitle** (17×fs), **brand** (15×fs) bases; N/A price uses same title weight
- **Price stripe:** larger **$** and **cents**; **dollar amount** line smaller; dollars **left-aligned** starting at ``pad_x + width($) + gap`` (no longer centered); removed post-loop dollar **growth** pass; slightly tighter dollars↔cents gap

---

## [1.2.15] — 2026-03-25

### Removed
- **Printed SKU** line under the logo (reverted)

### Changed
- **Logo** again **vertically centered** in the bottom band (~36% height); uniform contain-fit in full column × band unchanged

---

## [1.2.14] — 2026-03-25

### Added
- **SKU** under the logo: **`product_model`** if set, else **`qr_data`**, up to 2 centered lines (small type)

### Changed
- **Logo** pinned to the **top** of the bottom band with height above the SKU strip (~38% band); slightly **taller** band so the mark sits a bit higher

---

## [1.2.13] — 2026-03-25

### Changed
- **Logo:** scales with **uniform “contain”** in the full text-column width × logo band height (no inner margin); **taller band** (~36% height); **vertically centered** in the band (reads higher than bottom-pinned); **1px** clamp from outer border only

---

## [1.2.12] — 2026-03-25

### Changed
- **Price stripe:** larger **$** glyph; **dollars** line **horizontally centered** in the stripe; cents line unchanged (right)

---

## [1.2.11] — 2026-03-25

### Changed
- **Price stripe:** **$**, **dollars**, and **cents** on **separate lines** again (dollars left, cents right); **comma thousands** in dollar display; font tiers + extra scale step for long amounts (`$##,###` and similar)

---

## [1.2.10] — 2026-03-25

### Changed
- **Price stripe:** smaller **vertical** insets and **$**→dollars gap; **larger** dollar cap (+grow pass to fill usable height); **tighter** dollars↔cents gap; slightly smaller **$** / cents so the main figure dominates

---

## [1.2.9] — 2026-03-25

### Changed
- **Price stripe:** **``$``** small, upper-left of the band; **dollars** large, left-aligned; **cents** immediately to the right of dollars, **bottom-aligned** to dollars (reads as one figure, not three stacked lines)

---

## [1.2.8] — 2026-03-25

### Changed
- **Price stripe:** **``$``** small, **top-left**; **dollars** left-aligned under it; **cents** right-aligned (retail-style decomposition)

---

## [1.2.7] — 2026-03-25

### Changed
- **Price stripe:** larger vertical gaps; **dollars↔cents** gets extra spacing; lines drawn with **anchor ``lt``** and **y** advanced from each line’s ``textbbox`` bottom (fixes overlap from ascender/default metrics)
- **QR:** target side is **~98% of stripe column width** on all presets (same relative layout as before for 3×2 vs 1.5×1; no separate inch constants)

---

## [1.2.6] — 2026-03-25

### Fixed
- **GDI label print:** after fitting to the printable rect, bitmap is **top-aligned** vertically (``py = 0``). **Vertical centering** could place art in the middle of a driver page taller than one label, clipping the top and using **two** physical labels.

---

## [1.2.5] — 2026-03-25

### Fixed
- **Windows GDI printing:** label bitmap **fits** inside **HORZRES×VERTRES** and is **centered** (avoids left clip / right gap when driver DPI and printable area disagree)

---

## [1.2.4] — 2026-03-25

### Changed
- **Unified layout** for **3×2** and **1.5×1** (same 3:2 geometry): stripe column **⅓** width, text/logo **≈⅔**
- Column 1: **top half** black price band, **bottom half** white QR cell; square QR centered with modest margins
- QR target side: **~1″** (3×2) / **~0.5″** (1.5×1), clamped to the lower cell (snug, not wider than column)
- Right column: shared **logo zone** fraction (~32% height); title fonts scale only via `fs` (no preset-specific type sizes)

---

## [1.2.3] — 2026-03-25

### Changed
- **3×2 layout:** price column ~**48%** width; QR uses padded inner box with **~0.68″** max side (still square, still bounded by available height under the price band)
- **Logo:** scale to target **full text column width** first, then shrink by height if needed
- Title/meta font sizes tuned slightly for 3×2 vs 1.5×1

---

## [1.2.2] — 2026-03-25

### Changed
- Price column: **SKU removed** from black band; **$ / dollars / cents** laid out **vertically** using measured heights + font scaling so values do not overlap
- **QR size capped** (~0.52″ max side on 3×2, ~0.48″ on 1.5×1, also limited by column width) so it no longer fills the lower-left panel

---

## [1.2.1] — 2026-03-25

### Changed
- Label columns: **wider price band** (~44% width); **QR below price** in column 1, sized to column width with margins
- Column 2: **larger** title / brand / model (upper area); **logo scaled to column width** at bottom

---

## [1.2.0] — 2026-03-25

### Changed
- **Label design:** "Concept C: Side Stripe" per consultant spec (see `.ai/reference/Consult Label/`): landscape image built directly (no rotation); left ~33% black column with white `$` / dollars / cents / separator / SKU; right area title (bold then regular lines), centered QR (`ERROR_CORRECT_H`, NEAREST resize), logo at bottom; 1px border; only black/white gray values (0/255)
- **Code128** linear barcode removed from labels (QR + SKU in stripe only)
- Layout scales from reference 305×203px to both `3x2` and `1.5x1` presets at 203 DPI

### Removed
- `python-barcode` dependency (no longer used)

---

## [1.1.1] — 2026-03-25

### Added
- Optional `product_brand` and `product_model` on `LabelPrintRequest` (right column under title)
- `label_test_data.SAMPLE_LABEL_ROWS` + `scripts/print_label_local_test.py` and `dev_print_label_test.bat` — print sample labels without starting the server (default queue: `DEFAULT_LABEL_PRINTER`); `--dry-run` writes PNGs to `output/`
- `generate_label(..., label_size_preset=...)` override for one-off renders

---

## [1.1.0] — 2026-03-25

### Added
- **Label redesign:** three-column layout (logo + wordmark | QR | vertical price + product title), optional tagline on 3×2
- **Paper presets:** `label_size_preset` in `settings.json` — `3x2` (3″×2″) for testing, `1.5x1` (1.5″×1″) for production; exposed on built-in `/` UI and `GET`/`PUT` `/settings`
- Bundled monochrome logo at `assets/ecothrift_logo_bw.png` (skipped gracefully if missing)

### Changed
- Label width/height are derived from preset × `LABEL_DPI` (203); legacy `LABEL_WIDTH_INCHES` / `LABEL_HEIGHT_INCHES` kept as documentation fallback only
- **Code128:** drawn only on `3x2` (narrow bottom strip); omitted on `1.5x1` for scan reliability

---

## [1.0.7] — 2026-03-25

### Added
- Windows installer (`setup.py`) runs `cleanup_legacy_prior()` on **Install** and at start of **Uninstall**:
  stops `ecothrift-printserver.exe` and listeners on port 8888, removes V2 Startup
  `Eco-Thrift Print Server.vbs`, deletes `C:\\DashPrintServer` / `C:\\PrintServer` only when
  both `print_server.py` and `venv\\` are present (avoids wiping unrelated folders)
- Optional IT batch: `printserver/installer/uninstall_legacy_prior.bat` (best-effort CMD mirror)

---

## [1.0.6] — 2026-02-25

### Fixed
- Update check no longer blocked by browser CORS policy — version check is now proxied
  through the print server itself (GET /manage/check-update) so no cross-origin request
  is ever made from the browser
- Auto-start toggle now shows an "Enabled" (green) / "Disabled" (grey) text label next
  to the switch so the current state is always unambiguous

---

## [1.0.5] — 2026-02-25

### Fixed
- Uninstall from /manage now works correctly (no longer requires setup.exe in install dir)
- Update check runs automatically on /manage page load — no button click required
- Update check URL defaults to production dashboard; no manual settings.json editing needed
- Download link on /manage now correctly resolves to the S3 download URL
- Installer now kills any process on port 8888 (not just ecothrift-printserver.exe) — fixes
  silent reinstall failure when dev server was running as python.exe
- distribute.py version check no longer breaks when Django shell prints import noise
- Post-uninstall page shows clear "Server stopped" message instead of silently failing window.close()

---

## [1.0.4] — 2026-02-25

### Fixed
- Setup exe is now self-contained: server exe is bundled inside the installer
- Users download one file (ecothrift-printserver-setup-vX.exe), run it, and it installs
- distribute.bat now uploads the setup exe (not the raw server exe) to S3

---

## [1.0.3] — 2026-02-25

### Added
- /manage page: status, uptime, auto-start toggle, latest-version check, changelog, uninstall

---

## [1.0.2] — 2026-02-25

### Fixed
- Installer GUI now appears correctly (Tkinter font keyword conflict resolved)
- Print/test calls no longer time out when using PDF or virtual printers (timeout raised to 120s)
- Build script now kills locked exe before rebuilding (no more PermissionError if server is running)

---

## [1.0.1] — 2026-02-25

### Fixed
- Labels and receipts now print correctly on all Windows printers (GDI via win32ui instead of raw bytes)
- Print server no longer crashes when launched silently via the installer (--noconsole PyInstaller mode)
- Distribution script no longer requires credentials - uses Django management commands directly

---

## [1.0.0] — 2026-02-25

### Added
- Initial release
- FastAPI server on localhost:8888
- GET /health - server status, version, printer count
- GET /printers - enumerate Windows printers with status
- GET /settings / PUT /settings - persist label/receipt printer assignment
- GET / - built-in browser-based configuration UI
- POST /print/label - print inventory labels (GDI, works with any Windows printer)
- POST /print/test - test label
- POST /print/receipt - print POS receipts (GDI text, monospace)
- POST /print/test-receipt - test receipt
- POST /drawer/control - ESC/POS cash drawer kick via receipt printer
- Windows installer (setup.exe) with auto-start option
- Settings persisted to settings.json next to executable\
"""

HOST = "127.0.0.1"
PORT = 8888

LABEL_DPI = 203
# Default Windows printer queue for local/dev label scripts (Rollo thermal, etc.).
DEFAULT_LABEL_PRINTER = "Rollo Printer"
# Default Windows queue name for receipt role when unset / not saved (must match an installed printer).
DEFAULT_RECEIPT_PRINTER = "Receipt Printer"
# Legacy fallback if preset unknown (prefer label_size_preset in settings.json).
LABEL_WIDTH_INCHES = 2.25
LABEL_HEIGHT_INCHES = 1.25

# Landscape label sizes: preset key -> (width_inches, height_inches).
LABEL_SIZE_PRESETS: dict[str, tuple[float, float]] = {
    "3x2": (3.0, 2.0),
    "1.5x1": (1.5, 1.0),
}
DEFAULT_LABEL_SIZE_PRESET = "3x2"

RECEIPT_WIDTH_CHARS = 48  # 80mm thermal printers ≈ 48 chars at standard font

# Native render scale for ``render_receipt_to_image`` (canvas, fonts, spacing) and matching
# ``send_image(..., source_dpi=LABEL_DPI * RECEIPT_RENDER_SCALE)`` so physical width stays ~80mm
# while Pillow rasterizes at higher resolution.
RECEIPT_RENDER_SCALE = 3

DRAWER_PIN = 0  # 0 = pin 2 (most common), 1 = pin 5
DRAWER_ON_MS = 25
DRAWER_OFF_MS = 250
