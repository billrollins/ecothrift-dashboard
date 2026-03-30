<!-- Last updated: 2026-03-28T23:45:00-05:00 -->

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
| `printLabel`, `printTest`, `printReceipt`, `openCashDrawer`, etc. | Printing |

Printer assignment is **on the print server**, shared by all browsers on the PC.

## Backend release tracking

- Models: `PrintServerRelease`, `S3File` in `apps/core/models.py`
- Authenticated: `/api/core/system/print-server-version/`, `print-server-releases/`
- Public (no auth): `/api/core/system/print-server-version-public/` — default `UPDATE_CHECK_URL` in [`printserver/config.py`](../../printserver/config.py); `/manage/check-update` proxies this (no browser CORS).

Upload path pattern: `print-server/ecothrift-printserver-setup-v{VERSION}.exe` via [`printserver/distribute.py`](../../printserver/distribute.py) + `manage.py publish_printserver`.

## V2 vs V3 (migration)

| | V2 (old dashboard) | V3 (this repo) |
|--|-------------------|----------------|
| Path | `C:\DashPrintServer` (or manual `C:\PrintServer`) | `%LOCALAPPDATA%\EcoThrift\PrintServer\` |
| Runtime | Python **venv** + `print_server.py` | Single **`ecothrift-printserver.exe`** |
| Auto-start | Startup folder **`Eco-Thrift Print Server.vbs`** | HKCU **Run** `EcoThriftPrintServer` |
| `/settings` | **No** (404) | **Yes** |

**Stores:** Running **Install** on `ecothrift-printserver-setup.exe` calls **`cleanup_legacy_prior()`** in [`printserver/installer/setup.py`](../../printserver/installer/setup.py): stops port **8888** + frozen exe, deletes V2 Startup VBS, removes `C:\DashPrintServer` / `C:\PrintServer` only when both `print_server.py` and `venv\` exist, then wipes old V3 dir and installs fresh. **Uninstall** from setup GUI also runs that cleanup after removing V3. If `C:\...` removal fails, **Run setup as Administrator**.

**IT optional:** [`printserver/installer/uninstall_legacy_prior.bat`](../../printserver/installer/uninstall_legacy_prior.bat) — best-effort CMD mirror (not uploaded separately to S3 by default).

**Not used:** Windows Services, Task Scheduler (for both stacks per reference).

## Receipt template (PNG vs print)

- **Data:** one `receipt_data` dict (JSON fixtures: [`printserver/fixtures/README.md`](../../printserver/fixtures/README.md), same shape as `ReceiptPrintRequest` in [`printserver/models.py`](../../printserver/models.py)).
- **Rich preview (mockup / marketing layout):** [`printserver/services/receipt_printer.py`](../../printserver/services/receipt_printer.py) **`render_receipt_to_image`** — logo from `assets/ecothrift_logo_bw.png`, themes `professional` / `cool` / `emoji`. Local PNG: [`printserver/scripts/print_receipt_local_test.py`](../../printserver/scripts/print_receipt_local_test.py).
- **Production print today:** same module **`format_receipt_text`** → [`printer_manager.send_text`](../../printserver/services/printer_manager.py) — monospace plain text, **not** the pixel-perfect PNG layout.
- **ESC/POS:** **`format_receipt`** (bytes) exists in `receipt_printer.py` but is **not** wired to [`printserver/routers/receipts.py`](../../printserver/routers/receipts.py).

**Future parity** (if thermal output should match the PNG): (1) raster — `render_receipt_to_image` → crop → `send_image` with width/DPI tuned for 80mm; (2) richer plain text in `format_receipt_text`; (3) raw thermal — `format_receipt` + `send_raw`. Tracked initiative (pending): [`.ai/initiatives/_archived/_pending/print_server_receipt_format.md`](../initiatives/_archived/_pending/print_server_receipt_format.md).

## Design intent

Labels (GDI + Pillow), receipts (GDI text), cash drawer (ESC/POS). Built-in UI: `/` printers, `/manage` updates + uninstall trigger (server self-remove).

**Labels (shipped in source, v1.2.x):** “Concept C” side stripe — raster in [`printserver/services/label_printer.py`](../../printserver/services/label_printer.py); 203 DPI presets `3x2` / `1.5x1`. Price band: smaller `$` top-left; larger dollar digits and cents; dollar digits left-aligned with extra inset from the stripe edge when whole dollars > 0 (see `_draw_price_block`). **Sub-dollar** prices (e.g. `$0.75`): **`$` + cents only** — no large middle `0`. Fit loop tries scales **1.0 → 0.5** step **0.01** (integer font sizes may repeat across steps). Optional `price_fit_stats` on `generate_label` fills `first_fit_scale` and `used_fallback` for tooling. **Fringe harness:** [`printserver/scripts/label_price_fringe_grid.py`](../../printserver/scripts/label_price_fringe_grid.py) writes PNGs + a console summary under `printserver/output_label_fringe_review/` (gitignored). **GDI:** `printer_manager.send_image` fits the bitmap to `HORZRES`×`VERTRES`, centers horizontally, top-aligns vertically (thermal drivers). Reference PNGs + notes: [`.ai/reference/Consult Label/to-be-checked/`](../reference/Consult%20Label/to-be-checked/). Quick local print: [`printserver/dev_print_e2e_3_labels.bat`](../../printserver/dev_print_e2e_3_labels.bat).

## Initiatives (labels + receipts)

**Receipts (pending):** [`.ai/initiatives/_archived/_pending/print_server_receipt_format.md`](../initiatives/_archived/_pending/print_server_receipt_format.md). **Labels — Concept C (closed):** [`.ai/initiatives/_archived/_completed/print_server_label_design.md`](../initiatives/_archived/_completed/print_server_label_design.md). **Labels — price layout & fringe (closed):** [`.ai/initiatives/_archived/_completed/print_server_label_price_layout.md`](../initiatives/_archived/_completed/print_server_label_price_layout.md). **Migration/install (closed):** [`print_server_v3_testing_and_migration.md`](../initiatives/_archived/_completed/print_server_v3_testing_and_migration.md).

## Current integration

- Admin **Settings**: download current release, printer dropdowns, tests, link to `127.0.0.1:8888/manage`
- **ProcessingPage**: `useLocalPrintStatus`, label print, offline degradation
- POS pages also use `localPrintService` for receipts

## V2 reference snapshot

Historical installer/API: [`.ai/reference/PrintServer (V2)/`](../reference/PrintServer%20(V2)/). Stub checklist: [`LEGACY_UNINSTALL.md`](../reference/PrintServer%20(V2)/LEGACY_UNINSTALL.md) (details live in this file).
