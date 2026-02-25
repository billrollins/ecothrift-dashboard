# Eco-Thrift Print Server — Changelog

All notable changes to the print server are documented here.
Run `python distribute.py` from this directory to build and publish a new release.

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
