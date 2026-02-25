"""Windows printer discovery and printing via win32print / win32ui GDI."""

from __future__ import annotations

import logging
from typing import Any

import win32con  # type: ignore[import-untyped]
import win32print  # type: ignore[import-untyped]
import win32ui  # type: ignore[import-untyped]
from PIL import Image, ImageWin

from models import PrinterInfo

logger = logging.getLogger(__name__)

# Subset of PRINTER_STATUS_* flags that matter for a human-readable status.
_STATUS_MAP: dict[int, str] = {
    0x00000000: "ready",
    0x00000001: "paused",
    0x00000002: "error",
    0x00000004: "pending_deletion",
    0x00000008: "paper_jam",
    0x00000010: "paper_out",
    0x00000020: "manual_feed",
    0x00000040: "paper_problem",
    0x00000080: "offline",
    0x00000100: "io_active",
    0x00000200: "busy",
    0x00000400: "printing",
    0x00000800: "output_bin_full",
    0x00001000: "not_available",
    0x00002000: "waiting",
    0x00004000: "processing",
    0x00008000: "initializing",
    0x00010000: "warming_up",
    0x00020000: "toner_low",
    0x00040000: "no_toner",
    0x00080000: "page_punt",
    0x00100000: "user_intervention",
    0x00200000: "out_of_memory",
    0x00400000: "door_open",
    0x00800000: "server_unknown",
    0x01000000: "power_save",
}


def _flags_to_status(flags: int) -> str:
    if flags == 0:
        return "ready"
    parts: list[str] = []
    for bit, label in _STATUS_MAP.items():
        if bit and flags & bit:
            parts.append(label)
    return ", ".join(parts) if parts else "ready"


def get_default_printer() -> str | None:
    try:
        return win32print.GetDefaultPrinter()
    except Exception:
        return None


def list_printers() -> list[PrinterInfo]:
    """Return every locally-visible printer with status and default flag."""
    default = get_default_printer()
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    printers: list[tuple[Any, ...]] = win32print.EnumPrinters(flags, None, 2)
    result: list[PrinterInfo] = []
    for p in printers:
        name: str = p["pPrinterName"]
        status_flags: int = p.get("Status", 0)
        result.append(
            PrinterInfo(
                name=name,
                status=_flags_to_status(status_flags),
                is_default=(name == default),
            )
        )
    return result


def _installed_names() -> set[str]:
    return {p.name for p in list_printers()}


def resolve_printer(requested: str | None, role: str | None = None) -> str:
    """Resolve which printer to use.

    Priority: explicit request > saved setting for role > system default.
    Validates that the resolved name actually exists on this machine.
    """
    from services.settings_store import get as get_setting

    installed = _installed_names()

    # 1. Explicit request from the API call
    if requested:
        if requested in installed:
            return requested
        raise RuntimeError(
            f"Printer '{requested}' not found. "
            f"Installed printers: {sorted(installed)}"
        )

    # 2. Saved setting for this role (label_printer / receipt_printer)
    if role:
        saved = get_setting(f"{role}_printer")
        if saved and saved in installed:
            return saved

    # 3. System default
    default = get_default_printer()
    if default:
        return default

    raise RuntimeError(
        "No printer configured. Open http://127.0.0.1:8888 to select printers. "
        f"Installed printers: {sorted(installed)}"
    )


def send_raw(printer_name: str, doc_name: str, data: bytes) -> None:
    """Send raw bytes to a printer (RAW datatype — no driver processing).

    Only useful for printers that accept raw command streams (ESC/POS thermal
    printers, ZPL label printers, etc.).
    """
    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, (doc_name, None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, data)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def send_image(printer_name: str, image: Image.Image, source_dpi: int, doc_name: str = "Label") -> None:
    """Print a PIL Image through the Windows GDI pipeline.

    Works with ANY Windows printer (inkjet, laser, thermal label, PDF).
    The image is scaled from source_dpi to the printer's native DPI so the
    physical size stays correct.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")

    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(printer_name)

    printer_dpi_x = hdc.GetDeviceCaps(win32con.LOGPIXELSX)
    printer_dpi_y = hdc.GetDeviceCaps(win32con.LOGPIXELSY)

    # Physical size in printer pixels, preserving the source dimensions.
    dst_w = int(image.width / source_dpi * printer_dpi_x)
    dst_h = int(image.height / source_dpi * printer_dpi_y)

    hdc.StartDoc(doc_name)
    hdc.StartPage()

    dib = ImageWin.Dib(image)
    dib.draw(hdc.GetHandleOutput(), (0, 0, dst_w, dst_h))

    hdc.EndPage()
    hdc.EndDoc()
    hdc.DeleteDC()
    logger.info("GDI image sent to %s (%dx%d @ %d dpi)", printer_name, dst_w, dst_h, printer_dpi_x)


def send_text(printer_name: str, text: str, doc_name: str = "Receipt") -> None:
    """Print plain text through the Windows GDI pipeline.

    Uses a monospace font sized to fit ~48 chars across the page, suitable
    for receipt-style output on any Windows printer.
    """
    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(printer_name)

    printable_w = hdc.GetDeviceCaps(win32con.HORZRES)
    printer_dpi = hdc.GetDeviceCaps(win32con.LOGPIXELSX)

    # Size a monospace font so ~48 chars span the printable width.
    char_width = printable_w // 48
    font_height = int(char_width * 1.6)

    font = win32ui.CreateFont({
        "name": "Consolas",
        "height": font_height,
        "weight": 400,
    })

    hdc.StartDoc(doc_name)
    hdc.StartPage()
    hdc.SelectObject(font)

    y = 0
    for line in text.split("\n"):
        hdc.TextOut(0, y, line)
        y += font_height

    hdc.EndPage()
    hdc.EndDoc()
    hdc.DeleteDC()
    logger.info("GDI text sent to %s (%d lines)", printer_name, text.count("\n") + 1)
