"""Candidate product matching for preprocessing staging rows.

Design: `.ai/extended/inventory-pipeline.md` (Final Decisions / product match). Products
are never created here; candidates may only point at products that already exist.

Matchers, strongest first:
    1. UPC exact            (score 100) - auto-selects ``final_matched_product`` when undecided
    2. VendorProductRef     (score 90)  - vendor item number seen on prior orders
    3. Exact title + brand  (score 80)  - case-insensitive

Staff decisions (``match_source == 'staff'``) are never overridden, including an explicit
staff "this is new" (null FK with staff source).
"""

from __future__ import annotations

from typing import Any

from django.db.models.functions import Lower

from apps.inventory.layer_helpers import (
    effective_preprocessing_title,
    effective_preprocessing_triple,
)
from apps.inventory.manifest_standard_fields import (
    IDENTIFIER_LOOKUP_ORDER,
    first_identifier_hit,
)
from apps.inventory.models import PreprocessingRow, Product, PurchaseOrder, VendorProductRef
from apps.inventory.product_identity import identifier_value

MAX_CANDIDATES_PER_ROW = 5

SCORE_UPC = 100
SCORE_VENDOR_REF = 90
SCORE_TEXT_EXACT = 80


def product_snapshot(product: Product) -> dict[str, Any]:
    return {
        'title': product.title or '',
        'brand': product.brand or '',
        'identifiers': product.identifiers or {},
        'product_number': product.product_number or '',
    }


def _candidate(product: Product, score: int, source: str) -> dict[str, Any]:
    return {
        'product_id': product.id,
        'score': score,
        'source': source,
        'snapshot': product_snapshot(product),
    }


def _row_upc(row: PreprocessingRow) -> str:
    ids = effective_preprocessing_triple(row, 'identifiers')
    return identifier_value(ids, 'upc')


def _row_vendor_lookup_key(row: PreprocessingRow) -> str:
    ids = effective_preprocessing_triple(row, 'identifiers')
    if not isinstance(ids, dict):
        return ''
    return str(first_identifier_hit(ids, IDENTIFIER_LOOKUP_ORDER) or '').strip()


def _row_title_brand(row: PreprocessingRow) -> tuple[str, str]:
    title = str(effective_preprocessing_title(row) or '').strip()
    brand = str(effective_preprocessing_triple(row, 'brand') or '').strip()
    return title, brand


def generate_match_candidates_for_order(order: PurchaseOrder) -> dict[str, Any]:
    """Recompute ``match_candidates`` for every staging row on the order (batched lookups).

    UPC-exact top hits auto-select ``final_matched_product`` (``match_source='auto'``)
    only when the row is undecided. Re-running is always safe.
    """

    rows = list(
        PreprocessingRow.objects
        .filter(purchase_order=order)
        .select_related('manifest_row')
    )
    if not rows:
        return {'rows_scanned': 0, 'rows_with_candidates': 0, 'auto_selected': 0}

    row_upcs: dict[int, str] = {}
    row_vendor_keys: dict[int, str] = {}
    row_text: dict[int, tuple[str, str]] = {}
    for row in rows:
        upc = _row_upc(row)
        if upc:
            row_upcs[row.id] = upc
        vk = _row_vendor_lookup_key(row)
        if vk:
            row_vendor_keys[row.id] = vk
        title, brand = _row_title_brand(row)
        if title:
            row_text[row.id] = (title, brand)

    # Batched lookups: ONE case-insensitive IN query per tier via Lower() annotations.
    # NEVER per-miss queries - a 744-row PO against a 185k-product catalog must not run
    # hundreds of un-indexed iexact scans (that was ~97s per run; this is 3 scans total).
    products_by_upc: dict[str, Product] = {}
    if row_upcs:
        wanted_upcs = set(row_upcs.values())
        qs = Product.objects.filter(identifiers__upc__in=wanted_upcs)
        for p in qs.order_by('id'):
            products_by_upc.setdefault(identifier_value(p.identifiers, 'upc'), p)

    products_by_vendor_key: dict[str, Product] = {}
    if row_vendor_keys and order.vendor_id:
        refs = (
            VendorProductRef.objects
            .filter(vendor_id=order.vendor_id, vendor_item_number__in=set(row_vendor_keys.values()))
            .select_related('product')
        )
        for ref in refs:
            products_by_vendor_key.setdefault(ref.vendor_item_number.lower(), ref.product)

    products_by_text: dict[tuple[str, str], Product] = {}
    products_by_title_only: dict[str, Product] = {}
    if row_text:
        wanted_titles = {t.lower() for t, _b in row_text.values()}
        qs = Product.objects.annotate(_title_lc=Lower('title')).filter(_title_lc__in=wanted_titles)
        for p in qs.order_by('id'):
            title_lc = (p.title or '').lower()
            products_by_text.setdefault((title_lc, (p.brand or '').lower()), p)
            products_by_title_only.setdefault(title_lc, p)

    rows_with_candidates = 0
    auto_selected = 0
    to_update: list[PreprocessingRow] = []

    for row in rows:
        candidates: list[dict[str, Any]] = []
        seen_product_ids: set[int] = set()

        def _add(product: Product | None, score: int, source: str) -> None:
            if product is None or product.id in seen_product_ids:
                return
            seen_product_ids.add(product.id)
            candidates.append(_candidate(product, score, source))

        upc = row_upcs.get(row.id, '')
        upc_product = products_by_upc.get(upc) if upc else None
        _add(upc_product, SCORE_UPC, 'upc')

        vk = row_vendor_keys.get(row.id, '')
        if vk:
            _add(products_by_vendor_key.get(vk.lower()), SCORE_VENDOR_REF, 'vendor_ref')

        text = row_text.get(row.id)
        if text:
            t_lc, b_lc = text[0].lower(), text[1].lower()
            text_hit = products_by_text.get((t_lc, b_lc))
            if text_hit is None and not b_lc:
                # Brandless row: any product with this title (legacy iexact behavior).
                text_hit = products_by_title_only.get(t_lc)
            _add(text_hit, SCORE_TEXT_EXACT, 'text')

        candidates = candidates[:MAX_CANDIDATES_PER_ROW]

        update_fields = []
        if (row.match_candidates or []) != candidates:
            row.match_candidates = candidates
            update_fields.append('match_candidates')
        if candidates:
            rows_with_candidates += 1

        undecided = row.final_matched_product_id is None and row.match_source != 'staff'
        if undecided and upc_product is not None:
            row.final_matched_product_id = upc_product.id
            row.match_source = 'auto'
            update_fields.extend(['final_matched_product', 'match_source'])
            auto_selected += 1

        if update_fields:
            to_update.append(row)

    if to_update:
        PreprocessingRow.objects.bulk_update(
            to_update,
            ['match_candidates', 'final_matched_product', 'match_source'],
            batch_size=500,
        )

    return {
        'rows_scanned': len(rows),
        'rows_with_candidates': rows_with_candidates,
        'auto_selected': auto_selected,
    }
