"""
Canonical manifest columns — aligned with dashboard MANIFEST_TARGET_FIELDS
(apps.inventory.views).
"""

MANIFEST_TARGET_FIELDS: tuple[str, ...] = (
    "quantity",
    "description",
    "title",
    "brand",
    "model",
    "category",
    "condition",
    "retail_value",
    "upc",
    "vendor_item_number",
    "notes",
)
