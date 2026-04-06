"""Shared sample rows for local label tests and POST /print/test."""

from __future__ import annotations

# Keys match LabelPrintRequest fields (text = price line).
SAMPLE_LABEL_ROWS: list[dict[str, str]] = [
    {
        "text": "$1.99",
        "qr_data": "DEMO-BED-001",
        "product_title": "Twin/Twin XL Faux Shearling Reversible Comforter — White",
        "product_brand": "Home Collections",
        "product_model": "HC-COMF-TTXL-W",
    },
    {
        "text": "$25.00",
        "qr_data": "SKU-CLO-4421",
        "product_title": "Designer Jeans — Slim Fit",
        "product_brand": "Denim Co.",
        "product_model": "DC-4421-32x32",
    },
    {
        "text": "$1,123.75",
        "qr_data": "HOM-017-KITCHEN",
        "product_title": "12-Cup Programmable Coffee Maker",
        "product_brand": "Morning Brew",
        "product_model": "MB-12C-BLK",
    },
]

# Green-stock test render (same shape as SAMPLE_LABEL_ROWS); normal product lines, not signage.
CUSTOMER_INFO_TEST_ROW: dict[str, str] = {
    "text": "$26.25",
    "qr_data": "DEMO-LAMP-002",
    "product_title": "Natural Polyresin Floor Lamp — Room Essentials",
    "product_brand": "Room Essentials",
    "product_model": "RE-FLAMP-001",
}
