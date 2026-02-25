VERSION = "1.0.6"
RELEASE_NOTES = "Update check no longer blocked by CORS — proxied server-side. Auto-start toggle now shows Enabled/Disabled label."

# Default URL for the public version-check endpoint on the dashboard backend.
# Users can override this in settings.json via the /manage page (useful for local dev).
UPDATE_CHECK_URL = "https://dash.ecothrift.us/api/core/system/print-server-version-public/"

CHANGELOG = """\
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
LABEL_WIDTH_INCHES = 2.25
LABEL_HEIGHT_INCHES = 1.25

RECEIPT_WIDTH_CHARS = 48  # 80mm thermal printers ≈ 48 chars at standard font

DRAWER_PIN = 0  # 0 = pin 2 (most common), 1 = pin 5
DRAWER_ON_MS = 25
DRAWER_OFF_MS = 250
