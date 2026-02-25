from __future__ import annotations

from typing import Any

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


class TestPrintRequest(BaseModel):
    printer_name: str | None = None


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


# ---------------------------------------------------------------------------
# Shared response
# ---------------------------------------------------------------------------

class PrintResponse(BaseModel):
    success: bool
    message: str
    output: str | None = None
    error: str | None = None
