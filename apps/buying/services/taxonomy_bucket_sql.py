"""PostgreSQL CASE expression matching ``taxonomy_bucket_for_item`` (Gate 0).

Used by daily ``CategoryStats`` aggregates; must stay in sync with
``apps.buying.services.category_need.taxonomy_bucket_for_item``.
"""

from __future__ import annotations

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES


def _sql_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def taxonomy_bucket_case_sql(*, item_alias: str = "i", product_alias: str = "p") -> str:
    """
    SQL fragment: bucket string for one inventory row.

    ``FROM inventory_item {item_alias} LEFT JOIN inventory_product {product_alias}
    ON {item_alias}.product_id = {product_alias}.id``
    """
    in_list = ", ".join(_sql_literal(n) for n in TAXONOMY_V1_CATEGORY_NAMES)
    mixed = _sql_literal(MIXED_LOTS_UNCATEGORIZED)
    icat = f"TRIM(COALESCE({item_alias}.category, ''))"
    pcat = f"TRIM(COALESCE({product_alias}.category, ''))"
    return f"""CASE
  WHEN {icat} IN ({in_list}) THEN {icat}
  WHEN {product_alias}.id IS NOT NULL AND {pcat} IN ({in_list}) THEN {pcat}
  ELSE {mixed}
END"""
