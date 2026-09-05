from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    printers_available: int


# ---------------------------------------------------------------------------
# Printers
# ---------------------------------------------------------------------------

class PrinterInfo(BaseModel):
    name: str
    status: str
    is_default: bool


# ---------------------------------------------------------------------------
# Label printing
# ---------------------------------------------------------------------------

class LabelPrintRequest(BaseModel):
    text: str = Field(..., description="Price text, e.g. '$12.99'")
    qr_data: str = Field(..., description="SKU or barcode data")
    printer_name: str | None = None
    include_text: bool = True
    product_title: str | None = None
    product_brand: str | None = Field(None, description="Product brand line(s) on label")
    product_model: str | None = Field(None, description="Model / style / product number line(s)")
    green_label_stock: bool = Field(
        False,
        description="Colored label stock (e.g. lime): black price band with green price text (RGB); title/QR as black on paper",
    )


class LabelBatchPrintRequest(BaseModel):
    """One request → many labels: the whole check-in batch spools in a single call."""

    labels: list[LabelPrintRequest] = Field(..., description="Labels to print, in order")
    printer_name: str | None = Field(None, description="Overrides per-label printer_name")


class LabelBatchPrintResponse(BaseModel):
    success: bool
    message: str
    requested: int
    printed: int
    failed: int
    errors: list[str] = Field(default_factory=list, description="First few per-label errors")


class TestPrintRequest(BaseModel):
    printer_name: str | None = None


# ---------------------------------------------------------------------------
# Custom labels (Label Studio)
# ---------------------------------------------------------------------------

class ImageCopiesPrintRequest(BaseModel):
    """A pre-rendered raster printed N times (dashboard renders the template)."""

    image_base64: str = Field(..., description="Base64-encoded PNG/JPEG, ready to print")
    copies: int = Field(1, ge=1, le=100)
    printer_name: str | None = None
    dpi: int | None = Field(None, description="Source DPI of the raster (default LABEL_DPI)")
    doc_name: str | None = None


class PdfCopiesPrintRequest(BaseModel):
    """A PDF printed N times (rasterized per page on the print server)."""

    pdf_base64: str = Field(..., description="Base64-encoded PDF bytes")
    copies: int = Field(1, ge=1, le=100)
    printer_name: str | None = None
    doc_name: str | None = None


# ---------------------------------------------------------------------------
# Receipt printing
# ---------------------------------------------------------------------------

class ReceiptPrintRequest(BaseModel):
    receipt_data: dict[str, Any]
    open_drawer: bool = False
    printer_name: str | None = None


class TestReceiptRequest(BaseModel):
    printer_name: str | None = None


# ---------------------------------------------------------------------------
# Cash drawer
# ---------------------------------------------------------------------------

class DrawerControlRequest(BaseModel):
    action: str = "open"
    printer_name: str | None = None


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class PrinterSettings(BaseModel):
    label_printer: str | None = None
    receipt_printer: str | None = None
    label_size_preset: Literal["3x2", "1.5x1", "1.25x1.25"] = "3x2"


# ---------------------------------------------------------------------------
# Shared response
# ---------------------------------------------------------------------------

class PrintResponse(BaseModel):
    success: bool
    message: str
    output: str | None = None
    error: str | None = None
