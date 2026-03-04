<!-- Last updated: 2026-02-26T14:00:00-06:00 -->

# Print Server — Extended Context

## Overview

The print server is a **separate FastAPI application** that runs locally at `http://127.0.0.1:8888`. The print server code lives in the `printserver/` directory of this repo and is distributed as a standalone Windows installer. The dashboard communicates with it via HTTP.

## Architecture

- **Print server**: Standalone FastAPI app on localhost:8888
- **Dashboard**: Django + React app that calls the print server for printing operations
- **Communication**: REST over HTTP, 5-second timeout (2-second for availability check)

## Frontend: `localPrintService.ts`

Singleton service at `frontend/src/services/localPrintService.ts` with these methods:

| Method | Purpose |
|--------|---------|
| `isAvailable()` | Quick health check (2s timeout), returns boolean |
| `getHealth()` | Full health response: `{ status, version, printers_available }` |
| `listPrinters()` | List printers: `{ name, status, is_default }[]` |
| `printLabel(request)` | Print barcode/QR label; uses `LocalPrintRequest` (text, qr_data, printer_name?, include_text?, product_title?) |
| `printTest()` | Test label print |
| `printReceipt(receiptData, openDrawer?, printerName?)` | Print receipt; optionally open cash drawer |
| `printTestReceipt(printerName?)` | Test receipt print |
| `openCashDrawer()` | Open cash drawer via receipt printer |

**Printer settings** are stored in `localStorage` under `printerSettings`:
- `labelPrinter` (default: `'Green Label'`)
- `receiptPrinter` (default: `'POS Printer'`)

## Backend: Print Server Release Tracking

### Models (`apps/core/models.py`)

- **PrintServerRelease**: Tracks versions uploaded to S3
  - `version` (unique)
  - `s3_file` (FK to S3File)
  - `release_notes`
  - `is_current` (boolean) — only one release is current
  - `released_by`, `released_at`

- **S3File**: Tracks uploaded files (key, filename, size, content_type, uploaded_by, uploaded_at)

### Endpoints (`apps/core/views.py`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/core/system/print-server-version/` | GET | Returns latest release info when `is_current=True`; `{ available: false }` if none |
| `/api/core/system/print-server-releases/` | GET | List all print server releases |

Both require `IsAuthenticated`.

## Design Intent

The print server handles:

- **Label printing**: Barcode/QR labels for inventory items (GDI + Pillow)
- **Receipt printing**: POS receipts (GDI plain-text)
- **Cash drawer**: Open via ESC/POS through the receipt printer

Hardware is accessed locally (USB/serial) — hence the separate local process.

## Current Status (v1.8.0+)

- **Service client**: `localPrintService.ts` — fully wired for label, receipt, drawer
- **Backend**: Release tracking (PrintServerRelease, S3File) and endpoints exist; public no-auth version endpoint at `/core/system/print-server-version-public/`
- **Print server**: **Shipped** — `printserver/` directory in repo. FastAPI app, Windows self-contained installer (`ecothrift-printserver-setup.exe`), `distribute.bat` builds + uploads to S3
- **Built-in browser UI**: `/` (printer assignment), `/manage` (auto-start toggle, version check, changelog, uninstall)
- **Registry auto-start**: Installer registers for Windows startup; port-kill on reinstall
- **Dashboard integration**: Admin SettingsPage has printer dropdowns, test buttons, Client Download section, and link to `/manage`
- **`useLocalPrintStatus` hook**: Polls `/health` every 30s; persistent green/gray status chip in ProcessingPage PageHeader
- **Graceful degradation**: Check-in succeeds even when print server is offline; reprint recovery on Checked In tab
