<!-- Last updated: 2026-10-28 (one label-size setting; tags drawn in Dash) -->

# Print Server — Extended Context

## Overview

The print server is a **separate FastAPI application** at `http://127.0.0.1:8888`. Source: [`printserver/`](../../printserver/). Stores download **`ecothrift-printserver-setup.exe`** from the V3 dashboard (S3 + `PrintServerRelease`). **Not** a Windows Service — auto-start is **HKCU Run** (`EcoThriftPrintServer`).

## Architecture

- **Print server**: FastAPI on localhost:8888
- **Dashboard**: Django + React → HTTP (`frontend/src/services/localPrintService.ts`)
- **Timeouts**: ~5s normal, ~120s for print jobs (virtual PDF printers)

## Frontend: `localPrintService.ts`

| Method | Purpose |
|--------|---------|
| `isAvailable()` | Health check (2s timeout) |
| `getHealth()`, `listPrinters()` | Status and Windows printers |
| `getSettings` / `updateSettings` | **Requires V3** — persisted in `settings.json` next to installed exe |
| `printLabel`, `printTest`, `printReceipt`, `openCashDrawer`, etc. | Printing. `printReceipt` may return `drawer_opened` (`true`/`false`/`null`). Since 2026-10-21 `printReceipt` and `openCashDrawer` **throw `PrintFailedError`** when the server answers `success: false` (it answers 200 either way); `printErrorMessage(err)` gives the plain reason. |
| Receipt payload `copy: true` | A reprint (Dash logs it first). Print server **1.9.8** bands it **COPY - NOT THE ORIGINAL** at the top and the bottom (picture, tape and text, like TRAINING); Dash also puts COPY in `receipt_number` for older servers. |

Printer assignment is **on the print server**, shared by all browsers on the PC.

## Backend release tracking

- Models: `PrintServerRelease`, `S3File` in `apps/core/models.py`
- Authenticated: `/api/core/system/print-server-version/`, `print-server-releases/`
- Public (no auth): `/api/core/system/print-server-version-public/` — `@permission_classes([AllowAny])` so `/manage` can check without a JWT. Default `UPDATE_CHECK_URL` in [`printserver/config.py`](../../printserver/config.py); `/manage/check-update` proxies this (no browser CORS).

Upload path pattern: `print-server/ecothrift-printserver-setup-v{VERSION}.exe`. **Ship:** [`.ai/protocols/ship-print-server.md`](../protocols/ship-print-server.md) — skip-if-done build, S3, local + Heroku `PrintServerRelease`, and this-PC install. Script: [`printserver/distribute.py`](../../printserver/distribute.py) `--install-local`. Register: `manage.py publish_printserver` (idempotent). Silent install: `python printserver/installer/setup.py --install`. **Current release:** **1.9.9**.

## V2 vs V3 (migration)

| | V2 (old dashboard) | V3 (this repo) |
|--|-------------------|----------------|
| Path | `%SystemDrive%\DashPrintServer` (or manual `%SystemDrive%\PrintServer`) | `%LOCALAPPDATA%\EcoThrift\PrintServer\` |
| Runtime | Python **venv** + `print_server.py` | Single **`ecothrift-printserver.exe`** |
| Auto-start | Startup folder **`Eco-Thrift Print Server.vbs`** | HKCU **Run** `EcoThriftPrintServer` |
| `/settings` | **No** (404) | **Yes** |

**Stores:** Running **Install** on `ecothrift-printserver-setup.exe` calls **`cleanup_legacy_prior()`** in [`printserver/installer/setup.py`](../../printserver/installer/setup.py): stops port **8888** + frozen exe, deletes V2 Startup VBS, removes `%SystemDrive%\DashPrintServer` / `%SystemDrive%\PrintServer` only when both `print_server.py` and `venv\` exist, then wipes old V3 dir and installs fresh. **Uninstall** from setup GUI also runs that cleanup after removing V3. If `%SystemDrive%\...` removal fails, **Run setup as Administrator**.

**IT optional:** [`printserver/installer/uninstall_legacy_prior.bat`](../../printserver/installer/uninstall_legacy_prior.bat) — best-effort CMD mirror (not uploaded separately to S3 by default).

**Not used:** Windows Services, Task Scheduler (for both stacks per reference).

## Receipt template (PNG vs print)

- **Data:** one `receipt_data` dict (JSON fixtures: [`printserver/fixtures/README.md`](../../printserver/fixtures/README.md), same shape as `ReceiptPrintRequest` in [`printserver/models.py`](../../printserver/models.py)).
- **Rich preview (mockup / marketing layout):** [`printserver/services/receipt_printer.py`](../../printserver/services/receipt_printer.py) **`render_receipt_to_image`** — logo from `assets/ecothrift_logo_bw.png`, themes `professional` / `cool` / `emoji`. Local PNG: [`printserver/scripts/print_receipt_local_test.py`](../../printserver/scripts/print_receipt_local_test.py).
- **Production print today (1.9.2):** [`receipt_raster.py`](../../printserver/services/receipt_raster.py) draws the whole receipt as one 576-dot picture and sends it as ESC/POS `GS v 0` bands; on any failure [`format_receipt`](../../printserver/services/receipt_printer.py) falls back to `format_receipt_tape`, the text tape below. White-on-black text lines (`GS B`) print striped, so never use them for a block. **Never solid black (1.9.6, owner 2026-10-19):** the store POS-80s stall or restart on full-width solid black (tested on the office printer; driver density made no difference), and the restart reprinted the receipt top. Headings and the Thrift+ box are double frames (`OUTLINE` 4 dots + a 1-dot inner line) with heavy type (`_heavy`, Arial Black); `test_paced_print.NoSolidBlackTests` fails on more than 4 full-width black lines in a row. **Send it paced (1.9.5):** `receipt_job_parts` gives 64-row strips with a wait each (`SEND_ROWS_PER_SECOND`, more for dark strips) and `printer_manager.send_raw_paced` writes them in one RAW job; one big write let solid black slow the printer until Windows restarted the job, reprinting the top over and over. The text tape: ESC/POS bytes → [`printer_manager.send_raw`](../../printserver/services/printer_manager.py) (MUNBYN / POS-80C). Storefront (name, tagline, address, phone, hours, thank-you, the one-line Google review note) is **hardcoded** in that module — POS `receipt_data` only supplies the sale (lines, totals, payment, optional `savings`, optional CardX fields). **`receipt_data.savings`** is `{total, lines:[{label, amount}]}`; when `lines` is non-empty it prints a YOU SAVED block under TOTAL. Legacy `you_saved` (a single number) also prints under TOTAL. **CardX (1.7.0):** `card_type`, `card_amount`, `card_surcharge`, `card_charged_total`, `card_surcharge_percent` print after payment. Credit shows base + 3% line + charged total + disclosure; debit shows `Card (Debit)` only. **1.9.1 (owner 10-16):** the receipt ends with one black block (ESC/POS `GS B` white on black): member or non-member, this trip's ThriftBucks (or what a non-member missed), SOLD AS IS unless marked, and for members the 3-day returns and B12 lines; one small Google review line sits right above it; no coupon box. Without `thrift_plus` the block is NO REFUNDS. **1.9.7 (owner 10-20):** under a member's 3-DAY RETURN heading (and under the items on the text tape and plain-text receipts) one line, "Returns through Thu Oct 23 · 80% of value as store credit": the date is `receipt_data.returns_until` (ISO, sent by Dash from the cart's Thrift+ block, closed days counted), else the sale `date` + 3 days; with no date at all, "Returns within 3 days". Only a member receipt that has 3-day return lines prints it (`_returns_parts` in `receipt_printer.py`). Admin → Settings no longer shows `store_*` / `receipt_header` / `receipt_footer`. GDI `format_receipt_text` / `send_text` is the fallback path only. Policy: final sale + test-before-you-buy. Test receipts use the same layout as live sales.
- **Cash drawer (1.8.0):** `POST /print/receipt` with `open_drawer` **prepends** ESC/POS kick bytes to the receipt RAW job (same spooler job). Kick-build failure logs a warning and sets `drawer_opened: false`; the receipt stays `success: true`. `drawer_pin` in `settings.json` is `0` (pin 2), `1` (pin 5), or `both` (default — pulse pin 2 then pin 5). Selectable on `/`, Settings → Printing, and `GET`/`PUT` `/settings`. `POST /drawer/control` accepts optional `pin` for a test kick without saving. Pulse is 60/120 (2 ms units). `kick_drawer` / `build_kick_bytes` read that setting.

**Future parity** (if thermal output should match the PNG): (1) raster — `render_receipt_to_image` → crop → `send_image` with width/DPI tuned for 80mm; (2) richer plain text in `format_receipt_text`; (3) raw thermal — `format_receipt` + `send_raw`. Tracked initiative (pending): [`.ai/initiatives/_archived/print_server_receipt_format.md`](../initiatives/_archived/print_server_receipt_format.md).

## Design intent

Labels (GDI + Pillow), receipts (GDI text), cash drawer (ESC/POS). Built-in UI: `/` printers, `/manage` updates + uninstall trigger (server self-remove).

**Labels (shipped in source, v1.2.x):** “Concept C” side stripe — raster in [`printserver/services/label_printer.py`](../../printserver/services/label_printer.py); 203 DPI presets `3x2` / `1.5x1`. Price band: smaller `$` top-left; larger dollar digits and cents; dollar digits left-aligned with extra inset from the stripe edge when whole dollars > 0 (see `_draw_price_block`). **Sub-dollar** prices (e.g. `$0.75`): **`$` + cents only** — no large middle `0`. Fit loop tries scales **1.0 → 0.5** step **0.01** (integer font sizes may repeat across steps). Optional `price_fit_stats` on `generate_label` fills `first_fit_scale` and `used_fallback` for tooling. **Fringe harness:** [`printserver/scripts/label_price_fringe_grid.py`](../../printserver/scripts/label_price_fringe_grid.py) writes PNGs + a console summary under `printserver/output_label_fringe_review/` (gitignored). **GDI:** `printer_manager.send_image` fits the bitmap to `HORZRES`×`VERTRES`, centers horizontally, top-aligns vertically (thermal drivers). Quick local print: [`printserver/dev_print_e2e_3_labels.bat`](../../printserver/dev_print_e2e_3_labels.bat).

**Retail line (2026-10-21, needs a print-server release):** `LabelPrintRequest.retail_text` ("Retail $49.99") prints one line right above the logo band; title and brand stop above it. Dash sends it only when the retail passed its check (`tags.retail_on_tag`). An older print server ignores the field, so tags simply show no retail until stores update.

**Restoration tag (2026-10-28, no print-server release):** items a check-in sends to Restoration print a tag Dash draws
in the browser (`pages/restoration/tag/restorationTag.ts`). See [`restoration.md`](restoration.md).

## Label size (2026-10-28, no print-server release)

Owner: "our standard tag size as of now is 1.5 x 1 ... we often need to change tag sizes ... SUPER easy to adjust."

- **One setting:** Settings → Printing → **What labels are you using?** Presets 1.5x1 (standard), 2.25x1.25, 3x2, or
  Custom W x H inches (0.75 to 4), plus the printer's dpi (203 or 300). Store-wide in AppSetting `printing.label_size`
  (`{w_in, h_in, dpi}`, default 1.5 x 1 at 203; `GET/PUT /api/core/printing/label-size/`, any team member reads,
  managers set; changes go to AppSettingHistory). **Only this computer** saves an override in the browser
  (`localStorage.label_size_station`); it wins over the store size. Code: `frontend/src/printing/labelSize.ts`.
- **Tags drawn in Dash** at exactly W x H x dpi (one pixel per printer dot, snapped to black and white) and sent to
  `/print/image-copies` with that dpi, which prints at physical size (`fit_to_printable=False`): the restoration tag and
  the test label always. **Price tag behind a switch:** AppSetting `printing.price_tag_in_dash` (default **off**; owner
  and managers flip it on the label-size card, "Use the new price tag drawing"; `PUT /api/core/printing/price-tag-in-dash/`
  `{"on": true}`). Off: price tags print exactly as before (one label `/print/label`, more `/print/labels`, the print
  server's own drawing at its own **Paper size**, `label_size_preset`, no longer shown in Dash). On: drawn in Dash
  (`printing/tags/priceTag.ts`, a port of `label_printer.generate_label` scaled from the 305 x 203 reference); a print
  server older than 1.4.1 falls back to `/print/labels`. Turn it on once Print a test label looks right on real stock.
- **Kit:** `printing/tagCanvas.ts` (ops, fit/wrap, whole-dot QR, logo, render), `printing/printTags.ts` (`printTags`,
  `printPriceTags`, `printTestLabel`, `reprintLastTag`; `TAG_DESIGNS` registry). **A new tag design is one file** in
  `printing/tags/` exporting a `TagDesign` (its `layout(data, box, measure)` places ops in proportion to `box`), plus one
  line in `TAG_DESIGNS`. The coming member-price tag (2.25x1.25) goes there.
- **Print a test label:** a frame on the edge, a 1/4 in ruler on the top and left, the size text; then a sample price
  tag in the **new** drawing (switch on or off, to compare). **Reprint last label:** the last tag this computer printed (`localStorage.last_label_printed`), at today's size.
- **Print-server chip** (`components/printing/PrintServerChip.tsx`, on the Processing header): Online / Needs update
  (installed below the published release; click downloads) / Offline. Online opens a mini window with the label
  printer pick (`LabelPrinterSelect`) and the label-size card (`LabelSizeCard`), the same components as the tab.

## Custom labels (Label Studio, v1.4.1)

[`printserver/routers/custom.py`](../../printserver/routers/custom.py) — **`POST /print/image-copies`** prints a base64 pre-rendered raster × N (dashboard renders templates at 203 DPI in the browser, `renderTemplate.ts`); **`POST /print/pdf-copies`** rasterizes a base64 PDF per page with **PyMuPDF** (grayscale, 203 DPI) and prints × N. Both use `resolve_printer(role="label")` + GDI `send_image`; copies capped at 100. v1.4.1 adds decoded 5 MiB image / 20 MiB PDF limits, a 10-page PDF cap, safe raster bounds, and `fit_to_printable=False` for pre-sized template images so designer dimensions remain physical dimensions. PDF fitting is unchanged pending physical driver smoke. Label Studio shipped in **1.4.1** (distributed 2026-07-09). **Current print-server release:** **1.8.0**. Dashboard: `/admin/label-studio` + `apps.labels` (`/api/labels/`, including AI Create propose/generate). Initiative: [`custom_label_studio.md`](../initiatives/_archived/custom_label_studio.md) (completed **v2.48.0**–**v2.48.2**).

### Label Studio smoke (1.4.1)

1. Settings → install/update print server **1.4.1**.
2. Confirm health on `127.0.0.1:8888`.
3. Label Studio: PDF label → print × 2.
4. Fixed template → print × 2 and measure designer dimensions.
5. Increment template → print × 3 and verify sequence.
6. AI Create background/structure → approve, save, and print once.

## Initiatives (labels + receipts)

**Custom labels (completed):** [`.ai/initiatives/_archived/custom_label_studio.md`](../initiatives/_archived/custom_label_studio.md). **Receipts (pending):** [`.ai/initiatives/_archived/print_server_receipt_format.md`](../initiatives/_archived/print_server_receipt_format.md). **Labels — Concept C (closed):** [`.ai/initiatives/_archived/print_server_label_design.md`](../initiatives/_archived/print_server_label_design.md). **Labels — price layout & fringe (closed):** [`.ai/initiatives/_archived/print_server_label_price_layout.md`](../initiatives/_archived/print_server_label_price_layout.md). **Migration/install (closed):** [`print_server_v3_testing_and_migration.md`](../initiatives/_archived/print_server_v3_testing_and_migration.md).

## Current integration

- Admin **Settings**: download current release, printer dropdowns, tests, link to `127.0.0.1:8888/manage`
- **ProcessingPage**: `useLocalPrintStatus`, label print, offline degradation
- POS pages also use `localPrintService` for receipts

## V2 reference snapshot

A **`PrintServer (V2)`** folder previously lived under **`.ai/reference/`** (installer notes, **`LEGACY_UNINSTALL.md`**). That tree was **removed** from the repo; use git history if you need the exact text. V3 Windows installer still strips legacy V2 artifacts before install — see **`printserver/installer/`** and comments in **`printserver/installer/setup.py`**.
