"""Custom label printing — Label Studio jobs from the dashboard.

Two thin job types, both driven by the dashboard:

  * ``POST /print/image-copies`` — a ready-to-print monochrome raster (base64 PNG/JPEG),
    printed N times via the same GDI ``send_image`` path as product labels.
  * ``POST /print/pdf-copies``  — a PDF (base64), rasterized per page with PyMuPDF and
    printed N times through the same path (one proven pipeline, no shell printing).

The print server stays dumb: no template logic here — the dashboard renders.
"""
from __future__ import annotations

import base64
import io
import logging
import math

from fastapi import APIRouter

from config import LABEL_DPI
from models import ImageCopiesPrintRequest, PdfCopiesPrintRequest, PrintResponse
from services.printer_manager import resolve_printer, send_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/print", tags=["custom-labels"])

MAX_COPIES = 100
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 10
MAX_RASTER_DIMENSION = 10_000
MAX_RASTER_PIXELS = 40_000_000
# Rasterize PDFs at label DPI so physical size is faithful on label stock.
PDF_RENDER_DPI = LABEL_DPI


def _decode_b64(data: str, what: str, max_bytes: int) -> bytes:
    # Reject obviously oversized input before allocating the decoded payload.
    max_encoded_chars = ((max_bytes + 2) // 3) * 4
    if len(data) > max_encoded_chars:
        raise ValueError(f"{what.capitalize()} exceeds the {max_bytes // (1024 * 1024)} MiB limit")
    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception as exc:
        raise ValueError(f"Invalid base64 {what}: {exc}") from exc
    if len(decoded) > max_bytes:
        raise ValueError(f"{what.capitalize()} exceeds the {max_bytes // (1024 * 1024)} MiB limit")
    return decoded


def _validate_raster_size(width: int, height: int, what: str) -> None:
    if width <= 0 or height <= 0:
        raise ValueError(f"{what} has invalid dimensions")
    if width > MAX_RASTER_DIMENSION or height > MAX_RASTER_DIMENSION:
        raise ValueError(
            f"{what} dimensions exceed {MAX_RASTER_DIMENSION} pixels per side"
        )
    if width * height > MAX_RASTER_PIXELS:
        raise ValueError(
            f"{what} exceeds the {MAX_RASTER_PIXELS:,} pixel limit"
        )


@router.post("/image-copies", response_model=PrintResponse)
async def print_image_copies(req: ImageCopiesPrintRequest):
    """Print one pre-rendered raster N times."""
    from PIL import Image

    copies = max(1, min(int(req.copies), MAX_COPIES))
    try:
        raw = _decode_b64(req.image_base64, "image", MAX_IMAGE_BYTES)
        image = Image.open(io.BytesIO(raw))
        _validate_raster_size(image.width, image.height, "Image")
        image.load()
        if image.mode not in ("L", "RGB"):
            image = image.convert("L")
        dpi = int(req.dpi or LABEL_DPI)
        if dpi <= 0:
            raise ValueError("Image DPI must be greater than zero")
        printer = resolve_printer(req.printer_name, role="label")
        doc_name = req.doc_name or "Custom-Label"
        for i in range(copies):
            send_image(
                printer,
                image,
                dpi,
                doc_name=f"{doc_name}-{i + 1}",
                fit_to_printable=False,
            )
        return PrintResponse(
            success=True,
            message=f"{copies} cop{'y' if copies == 1 else 'ies'} sent to {printer}",
            output=f"copies={copies}",
        )
    except Exception as exc:
        logger.exception("Image copies print failed")
        return PrintResponse(success=False, message="Image print failed", error=str(exc))


@router.post("/pdf-copies", response_model=PrintResponse)
async def print_pdf_copies(req: PdfCopiesPrintRequest):
    """Rasterize a PDF (all pages) and print the document N times."""
    try:
        import fitz  # PyMuPDF — imported lazily so a missing wheel degrades to a clean error
    except ImportError:
        return PrintResponse(
            success=False,
            message="PDF printing unavailable",
            error="PyMuPDF is not installed on this print server build. Update the print server.",
        )
    from PIL import Image

    copies = max(1, min(int(req.copies), MAX_COPIES))
    try:
        raw = _decode_b64(req.pdf_base64, "pdf", MAX_PDF_BYTES)
        doc = fitz.open(stream=raw, filetype="pdf")
        try:
            if doc.page_count == 0:
                raise ValueError("PDF has no pages")
            if doc.page_count > MAX_PDF_PAGES:
                raise ValueError(f"PDF exceeds the {MAX_PDF_PAGES} page limit")
            pages: list[Image.Image] = []
            zoom = PDF_RENDER_DPI / 72.0  # PDF points are 1/72"
            for page_no, page in enumerate(doc, start=1):
                expected_width = math.ceil(float(page.rect.width) * zoom)
                expected_height = math.ceil(float(page.rect.height) * zoom)
                _validate_raster_size(
                    expected_width, expected_height, f"PDF page {page_no}"
                )
                pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY)
                _validate_raster_size(pix.width, pix.height, f"PDF page {page_no}")
                pages.append(Image.frombytes("L", (pix.width, pix.height), pix.samples))
        finally:
            doc.close()
        printer = resolve_printer(req.printer_name, role="label")
        doc_name = req.doc_name or "Custom-PDF"
        for i in range(copies):
            for page_no, image in enumerate(pages, start=1):
                send_image(
                    printer, image, PDF_RENDER_DPI,
                    doc_name=f"{doc_name}-{i + 1}p{page_no}",
                )
        total = copies * len(pages)
        return PrintResponse(
            success=True,
            message=f"{copies} cop{'y' if copies == 1 else 'ies'} ({total} page(s)) sent to {printer}",
            output=f"copies={copies} pages={len(pages)}",
        )
    except Exception as exc:
        logger.exception("PDF copies print failed")
        return PrintResponse(success=False, message="PDF print failed", error=str(exc))
