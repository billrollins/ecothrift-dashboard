"""PostgreSQL CASE expression matching ``taxonomy_bucket_for_item`` (Gate 0).

Used by daily ``CategoryStats`` aggregates; must stay in sync with
``apps.buying.services.category_need.taxonomy_bucket_for_item``.
"""

from __future__ import annotations

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES


def _sql_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def taxonomy_bucket_case_sql(
    *,
    item_alias: str = "i",
    product_alias: str = "p",
    manifest_row_alias: str = "mr",
) -> str:
    """
    SQL fragment: bucket string for one inventory row.

    ``FROM inventory_item {item_alias}
    LEFT JOIN inventory_product {product_alias} ON {item_alias}.product_id = {product_alias}.id
    LEFT JOIN inventory_manifestrow {manifest_row_alias} ON {item_alias}.manifest_row_id = {manifest_row_alias}.id``
    """
    in_list = ", ".join(_sql_literal(n) for n in TAXONOMY_V1_CATEGORY_NAMES)
    mixed = _sql_literal(MIXED_LOTS_UNCATEGORIZED)
    pcat = (
        f"TRIM(COALESCE((SELECT c.name FROM inventory_category c "
        f"WHERE c.id = {product_alias}.category_id), ''))"
    )
    mcat = f"TRIM(COALESCE({manifest_row_alias}.category, ''))"
    return f"""CASE
  WHEN {product_alias}.id IS NOT NULL AND {pcat} IN ({in_list}) THEN {pcat}
  WHEN {item_alias}.manifest_row_id IS NOT NULL AND {mcat} IN ({in_list}) THEN {mcat}
  ELSE {mixed}
END"""
