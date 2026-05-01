"""
Static CSV headers + formula mappings used by Django data migrations seeding CSVTemplate rows.

Must live outside ``migrations/`` so Django does not load this file as a migration module.
"""
from __future__ import annotations

import hashlib
from typing import Any


def header_signature(headers: list[str]) -> str:
    return hashlib.md5(','.join(h.strip().lower() for h in headers).encode()).hexdigest()


def get_or_vendor(apps, canonical_name: str, code_fallback: str):
    Vendor = apps.get_model('inventory', 'Vendor')
    v = Vendor.objects.filter(name__iexact=canonical_name).first()
    if v:
        return v
    v = Vendor.objects.filter(code__iexact=code_fallback).first()
    if v:
        return v
    return Vendor.objects.create(
        name=canonical_name,
        code=code_fallback,
        vendor_type='liquidation',
    )


TARGET_HEADERS = (
    'Item #,Seller Category,Item Description,Qty,Unit Retail,Ext. Retail,Brand,UPC,TCIN,'
    'Origin,Category,Condition,Product Class,Category Code,Division,Department,Optoro Condition,'
    'Pallet ID,Subcategory,Lot ID'
).split(',')

TARGET_MAPPINGS: list[dict[str, Any]] = [
    {'target': 'quantity', 'formula': 'TRIM([Qty])'},
    {'target': 'unit_retail', 'formula': 'TRIM([Unit Retail])'},
    {'target': 'description', 'formula': 'TRIM([Item Description])'},
    {'target': 'brand', 'formula': 'TRIM([Brand])'},
    {'target': 'condition', 'formula': 'TRIM([Condition])'},
    {'target': 'identifiers.upc', 'formula': 'TRIM([UPC])'},
    {'target': 'identifiers.sku', 'formula': 'TRIM([TCIN])'},
    {'target': 'taxonomy.category', 'formula': 'TRIM([Category])'},
    {'target': 'taxonomy.subcategory', 'formula': 'TITLE(TRIM([Subcategory]))'},
    {'target': 'taxonomy.department', 'formula': 'TITLE(TRIM([Department]))'},
    {'target': 'taxonomy.product_class', 'formula': 'TITLE(TRIM([Product Class]))'},
    {'target': 'taxonomy.seller_category', 'formula': 'TITLE(TRIM([Seller Category]))'},
    {'target': 'taxonomy.division', 'formula': 'TITLE(TRIM([Division]))'},
    {'target': 'taxonomy.category_code', 'formula': 'TRIM([Category Code])'},
    {'target': 'specifications.origin', 'formula': 'TRIM([Origin])'},
    {'target': 'tracking.lot_id', 'formula': 'TRIM([Lot ID])'},
    {'target': 'tracking.pallet_id', 'formula': 'TRIM([Pallet ID])'},
    {'target': 'tracking.lpn', 'formula': 'TRIM([Item #])'},
]

COSTCO_HEADERS = (
    'Lot ID,Location,Item #,Dept. Code,Department,Item Description,Qty,Unit Retail,Ext. Retail,'
    'Model,Serial #,Vendor,Category Code,Seller Category,Category,Condition'
).split(',')

COSTCO_MAPPINGS: list[dict[str, Any]] = [
    {'target': 'quantity', 'formula': 'TRIM([Qty])'},
    {'target': 'unit_retail', 'formula': 'TRIM([Unit Retail])'},
    {'target': 'description', 'formula': 'TITLE(TRIM([Item Description]))'},
    {'target': 'brand', 'formula': 'TITLE(TRIM([Vendor]))'},
    {'target': 'model', 'formula': 'TRIM([Model])'},
    {'target': 'condition', 'formula': 'TRIM([Condition])'},
    {'target': 'identifiers.item_number', 'formula': 'TRIM([Item #])'},
    {'target': 'taxonomy.category', 'formula': 'TRIM([Category])'},
    {'target': 'taxonomy.department', 'formula': 'TITLE(TRIM([Department]))'},
    {'target': 'taxonomy.seller_category', 'formula': 'TRIM([Seller Category])'},
    {'target': 'taxonomy.category_code', 'formula': 'TRIM([Category Code])'},
    {'target': 'specifications.serial_number', 'formula': 'TRIM([Serial #])'},
    {'target': 'tracking.lot_id', 'formula': 'TRIM([Lot ID])'},
    {'target': 'tracking.location', 'formula': 'TRIM([Location])'},
]

AMAZON_HEADERS = (
    'Category,Subcategory,ASIN,Item Description,Qty,Unit Retail,Ext. Retail,Product Class,'
    'GL Description,Seller Category,EAN,LPN,UPC,Brand,Condition,Pallet ID,Lot ID'
).split(',')

AMAZON_MAPPINGS: list[dict[str, Any]] = [
    {'target': 'quantity', 'formula': 'TRIM([Qty])'},
    {'target': 'unit_retail', 'formula': 'TRIM([Unit Retail])'},
    {'target': 'description', 'formula': 'TRIM([Item Description])'},
    {'target': 'brand', 'formula': 'TRIM([Brand])'},
    {'target': 'condition', 'formula': 'TRIM([Condition])'},
    {'target': 'identifiers.upc', 'formula': 'TRIM([UPC])'},
    {'target': 'identifiers.ean', 'formula': 'TRIM([EAN])'},
    {'target': 'identifiers.asin', 'formula': 'TRIM([ASIN])'},
    {'target': 'taxonomy.category', 'formula': 'TRIM([Category])'},
    {'target': 'taxonomy.subcategory', 'formula': 'TRIM([Subcategory])'},
    {'target': 'taxonomy.product_class', 'formula': 'TRIM([Product Class])'},
    {'target': 'taxonomy.seller_category', 'formula': 'TRIM([Seller Category])'},
    {'target': 'taxonomy.gl_description', 'formula': 'TRIM([GL Description])'},
    {'target': 'tracking.lot_id', 'formula': 'TRIM([Lot ID])'},
    {'target': 'tracking.pallet_id', 'formula': 'TRIM([Pallet ID])'},
    {'target': 'tracking.lpn', 'formula': 'TRIM([LPN])'},
]
