"""Windows printer discovery and printing via win32print / win32ui GDI."""

from __future__ import annotations

import logging
from typing import Any

import win32con  # type: ignore[import-untyped]
import win32gui  # type: ignore[import-untyped]
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

    Priority: explicit request > saved setting for role > config default (receipt
    only, if installed) > system default.
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

    # 2b. Config default queue for receipt (if installed and no saved role match)
    if role == "receipt":
        from config import DEFAULT_RECEIPT_PRINTER

        if DEFAULT_RECEIPT_PRINTER in installed:
            return DEFAULT_RECEIPT_PRINTER

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


def send_image(
    printer_name: str,
    image: Image.Image,
    source_dpi: int,
    doc_name: str = "Label",
    *,
    fit_to_printable: bool = True,
) -> None:
    """Print a PIL Image through the Windows GDI pipeline.

    Works with ANY Windows printer (inkjet, laser, thermal label, PDF).
    The image is scaled from ``source_dpi`` using the driver's logical DPI, then
    **fitted** to the printable rectangle (``HORZRES`` / ``VERTRES``) so it never
    overflows. **Horizontally centered** to fix drivers whose logical width does
    not match ``LOGPIXELSX``. **Vertically top-aligned** (``py = 0``): many roll
    drivers report a ``VERTRES`` taller than one label; vertical centering splits
    the bitmap across two feeds or clips the top of the first label.

    If ``fit_to_printable`` is False the DPI-scaled size is kept (correct
    physical inches even when the driver paper size is wrong) and drawing
    starts at ``(-PHYSICALOFFSETX, -PHYSICALOFFSETY)`` so the bitmap
    begins at the physical page edge rather than the printable origin.
    Use for **pre-sized** rasters (e.g. location labels rendered at
    3×2 @ 203 DPI) that must fill the actual stock regardless of what
    paper size the driver reports.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")

    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(printer_name)

    printer_dpi_x = hdc.GetDeviceCaps(win32con.LOGPIXELSX)
    printer_dpi_y = hdc.GetDeviceCaps(win32con.LOGPIXELSY)
    printable_w = hdc.GetDeviceCaps(win32con.HORZRES)
    printable_h = hdc.GetDeviceCaps(win32con.VERTRES)
    phys_off_x = hdc.GetDeviceCaps(win32con.PHYSICALOFFSETX)
    phys_off_y = hdc.GetDeviceCaps(win32con.PHYSICALOFFSETY)

    # Intended physical size in printer device units (driver-reported DPI).
    dst_w = max(1, int(image.width / source_dpi * printer_dpi_x))
    dst_h = max(1, int(image.height / source_dpi * printer_dpi_y))

    if fit_to_printable and printable_w > 0 and printable_h > 0:
        # Fit inside the printable area; never overflow (prevents asymmetric clip).
        fit = min(printable_w / dst_w, printable_h / dst_h, 1.0)
        dst_w = max(1, int(dst_w * fit))
        dst_h = max(1, int(dst_h * fit))
        px = max(0, (printable_w - dst_w) // 2)
        py = 0  # top of printable = start of label; do not center vertically on roll stock
    elif not fit_to_printable:
        # Keep DPI-computed dst_w/dst_h (maps to the correct physical inches)
        # but start at the physical page edge.  GDI (0,0) is the *printable*
        # origin, already PHYSICALOFFSETX from the physical left — negate it
        # so the bitmap isn't shifted right on the stock.
        px = -phys_off_x
        py = -phys_off_y
    else:
        px, py = 0, 0

    hdc.StartDoc(doc_name)
    hdc.StartPage()

    dib = ImageWin.Dib(image)
    dib.draw(hdc.GetHandleOutput(), (px, py, px + dst_w, py + dst_h))

    hdc.EndPage()
    hdc.EndDoc()
    phys_w_log = hdc.GetDeviceCaps(win32con.PHYSICALWIDTH)
    phys_h_log = hdc.GetDeviceCaps(win32con.PHYSICALHEIGHT)
    hdc.DeleteDC()
    logger.info(
        "GDI image sent to %s rect=(%d,%d)+(%dx%d) printable=%dx%d phys=%dx%d dpi=%dx%d phys_off=(%d,%d) fit=%s",
        printer_name,
        px,
        py,
        dst_w,
        dst_h,
        printable_w,
        printable_h,
        phys_w_log,
        phys_h_log,
        printer_dpi_x,
        printer_dpi_y,
        phys_off_x,
        phys_off_y,
        fit_to_printable,
    )


def _gdi_caps(hdc: Any) -> tuple[int, int, int, int]:
    return (
        hdc.GetDeviceCaps(win32con.HORZRES),
        hdc.GetDeviceCaps(win32con.VERTRES),
        hdc.GetDeviceCaps(win32con.LOGPIXELSX),
        hdc.GetDeviceCaps(win32con.LOGPIXELSY),
    )


def _receipt_font(height: int) -> Any:
    return win32ui.CreateFont({
        "name": "Consolas",
        "height": max(8, height),
        "weight": 400,
    })


def _widest_line_px(hdc: Any, font: Any, lines: list[str]) -> int:
    hdc.SelectObject(font)
    widest = 0
    for line in lines:
        if line:
            widest = max(widest, hdc.GetTextExtent(line)[0])
    return widest


def _fit_receipt_font(hdc: Any, lines: list[str], printable_w: int) -> tuple[Any, int, int]:
    """Consolas sized for ~48 columns, then shrunk until every line fits HORZRES."""
    height = max(8, int((max(printable_w, 1) // 48) * 1.6))
    font = _receipt_font(height)
    while printable_w > 0 and _widest_line_px(hdc, font, lines) > printable_w and height > 8:
        height -= 1
        font = _receipt_font(height)
    hdc.SelectObject(font)
    line_h = max(height, hdc.GetTextExtent("Mg")[1])
    return font, height, line_h


# POS-80C / MUNBYN ITPP047: 72mm printable (576 dots @ 203 DPI) on 80mm (3 1/8") stock.
_PAPER_USER = getattr(win32con, "DMPAPER_USER", 0)


def _content_page_mm(content_h: int, dpi_y: int) -> int:
    raw = int(round(content_h / max(dpi_y, 1) * 25.4)) + 5
    return max(40, min(297, raw))


def _create_receipt_dc(printer_name: str, height_mm: int) -> Any:
    """GDI DC on a 72mm-wide page as tall as the receipt. CreatePrinterDC cannot take a DEVMODE."""
    handle = win32print.OpenPrinter(printer_name)
    try:
        devmode = win32print.GetPrinter(handle, 2).get("pDevMode")
    finally:
        win32print.ClosePrinter(handle)
    if devmode is None:
        raise RuntimeError("printer has no DEVMODE")
    fields = int(getattr(devmode, "Fields", 0))
    fields |= win32con.DM_PAPERSIZE | win32con.DM_PAPERWIDTH | win32con.DM_PAPERLENGTH
    devmode.PaperSize = _PAPER_USER
    devmode.PaperWidth = 720
    devmode.PaperLength = height_mm * 10
    if hasattr(win32con, "DM_SCALE"):
        devmode.Scale = 100
        fields |= win32con.DM_SCALE
    devmode.Fields = fields
    raw = win32gui.CreateDC("WINSPOOL", printer_name, devmode)
    return win32ui.CreateDCFromHandle(raw)


def send_text(printer_name: str, text: str, doc_name: str = "Receipt") -> None:
    """Print plain text through the Windows GDI pipeline.

    POS-80C shrinks a short receipt on a tall form. Page height is the content
    height so shrink-to-fit cannot squeeze 78mm of ink onto a 100/297mm page.
    """
    lines = text.split("\n")
    probe = win32ui.CreateDC()
    probe.CreatePrinterDC(printer_name)
    printable_w, _printable_h, _dpi_x, dpi_y = _gdi_caps(probe)
    _font, _fh, line_h = _fit_receipt_font(probe, lines, printable_w)
    content_h = max(line_h, len(lines) * line_h)
    height_mm = _content_page_mm(content_h, dpi_y)
    probe.DeleteDC()

    hdc: Any
    form_note: str
    try:
        hdc = _create_receipt_dc(printer_name, height_mm)
        form_note = f"user/{height_mm}mm"
    except Exception:
        logger.exception("Receipt form CreateDC failed; using driver default")
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(printer_name)
        form_note = "default"

    printable_w, printable_h, _dpi_x, dpi_y = _gdi_caps(hdc)
    font, font_height, line_h = _fit_receipt_font(hdc, lines, printable_w)
    content_h = max(line_h, len(lines) * line_h)
    printable_h = max(printable_h, line_h)

    hdc.StartDoc(doc_name)
    page_open = False
    y = 0
    pages = 0

    def new_page() -> None:
        nonlocal page_open, y, pages
        if page_open:
            hdc.EndPage()
        hdc.StartPage()
        hdc.SelectObject(font)
        page_open = True
        y = 0
        pages += 1

    for line in lines:
        if not page_open or (y > 0 and y + line_h > printable_h):
            new_page()
        hdc.TextOut(0, y, line)
        y += line_h
    if page_open:
        hdc.EndPage()
    hdc.EndDoc()
    hdc.DeleteDC()
    logger.info(
        "GDI text sent to %s lines=%d pages=%d font_h=%d line_h=%d "
        "content_h=%d printable=%dx%d form=%s",
        printer_name,
        len(lines),
        pages,
        font_height,
        line_h,
        content_h,
        printable_w,
        printable_h,
        form_note,
    )
