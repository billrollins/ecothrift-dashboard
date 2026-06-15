"""Product resolver for standalone/manual Add Item flows."""

from __future__ import annotations

from typing import Any

from apps.inventory.models import Category, Product
from apps.inventory.canonical_categories import canonical_category_name
from apps.inventory.product_identity import (
    identifier_value,
    merge_identifiers,
    merge_tags,
    normalize_identifiers,
    normalize_tags,
)

_SEARCH_TAG_MAX = 8
_SEARCH_TAG_LEN = 40


def normalize_search_tags(value: Any, *, max_tags: int = _SEARCH_TAG_MAX, max_len: int = _SEARCH_TAG_LEN) -> list[str]:
    """Normalize AI/form search tags: trim, dedupe case-insensitively, cap count/length."""

    return normalize_tags(value, max_tags=max_tags, max_len=max_len)


def build_google_query(
    *,
    title: str = '',
    brand: str = '',
    model: str = '',
    search_tags: list[str] | None = None,
) -> str:
    """Best-effort Google query from product identity + optional extra tags."""

    parts: list[str] = []
    seen: set[str] = set()

    def _add(value: str) -> None:
        text = str(value or '').strip()
        if not text or text.lower() == 'generic':
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        parts.append(text)

    _add(brand)
    _add(title)
    _add(model)
    for tag in normalize_search_tags(search_tags):
        _add(tag)
    return ' '.join(parts)[:200]


def _clean(value: Any, max_len: int | None = None) -> str:
    text = str(value or '').strip()
    if max_len is not None:
        return text[:max_len]
    return text


def _category_for_name(category: str) -> Category:
    canonical = canonical_category_name(category)
    obj, _ = Category.objects.get_or_create(name=canonical)
    return obj


def _fill_product_blanks(
    product: Product,
    *,
    category: str,
    model: str,
    identifiers: dict[str, Any] | None = None,
    search_tags: list[str] | None = None,
) -> None:
    """Conservative enrichment for reused products: only fill empty identity gaps."""

    update_fields: list[str] = []
    if category:
        ref = _category_for_name(category)
        if product.category_id != ref.id:
            product.category = ref
            update_fields.append('category')
    if model and not product.model:
        product.model = model
        update_fields.append('model')
    merged_identifiers = merge_identifiers(product.identifiers, identifiers)
    if merged_identifiers != (product.identifiers or {}):
        product.identifiers = merged_identifiers
        update_fields.append('identifiers')
    merged_tags = merge_tags(product.tags, search_tags)
    if merged_tags != (product.tags or []):
        product.tags = merged_tags
        update_fields.append('tags')
    if update_fields:
        product.save(update_fields=[*update_fields, 'updated_at'])


def _update_existing_product(
    product: Product,
    *,
    title: str,
    brand: str,
    category: str,
    model: str,
    identifiers: dict[str, Any],
    specifications: dict[str, Any],
    search_tags: list[str] | None = None,
) -> Product:
    """Apply explicit item-edit product fields to an already linked product."""

    update_fields: list[str] = []
    for field, value in (
        ('title', title),
        ('brand', brand),
        ('model', model),
    ):
        if value and getattr(product, field) != value:
            setattr(product, field, value)
            update_fields.append(field)
    if category:
        ref = _category_for_name(category)
        if product.category_id != ref.id:
            product.category = ref
            update_fields.append('category')

    merged_specs = dict(product.specifications) if isinstance(product.specifications, dict) else {}
    if specifications:
        merged_specs.update(specifications)
    if merged_specs != (product.specifications or {}):
        product.specifications = merged_specs
        update_fields.append('specifications')
    merged_identifiers = merge_identifiers(product.identifiers, identifiers)
    if merged_identifiers != (product.identifiers or {}):
        product.identifiers = merged_identifiers
        update_fields.append('identifiers')
    merged_tags = merge_tags(product.tags, search_tags)
    if merged_tags != (product.tags or []):
        product.tags = merged_tags
        update_fields.append('tags')
    if update_fields:
        product.save(update_fields=[*dict.fromkeys(update_fields), 'updated_at'])
    return product


def find_or_create_product_for_manual_item(
    *,
    title: str,
    brand: str = '',
    category: str = '',
    model: str = '',
    upc: str = '',
    identifiers: dict[str, Any] | None = None,
    specifications: dict[str, Any] | None = None,
    search_tags: list[str] | str | None = None,
    existing_product: Product | None = None,
    force_create: bool = False,
) -> Product:
    """Resolve the Product identity for a standalone Add Item create/update.

    Matching stays deterministic: UPC first, then exact title/brand/model/category/UPC,
    otherwise create. Reused products are only enriched when fields are blank so a manual
    add does not rewrite another product's history by accident.
    """

    title = _clean(title, 300)
    brand = _clean(brand, 200)
    category = _clean(category, 200)
    category_obj = _category_for_name(category)
    model = _clean(model, 200)
    upc = _clean(upc, 100)
    title = title or 'Generic Product'
    brand = brand or 'Generic'
    specs = specifications if isinstance(specifications, dict) else {}
    ids = merge_identifiers(identifiers, {'upc': upc} if upc else {})
    tags = normalize_search_tags(search_tags)

    if existing_product is not None:
        return _update_existing_product(
            existing_product,
            title=title,
            brand=brand,
            category=category_obj.name,
            model=model,
            identifiers=ids,
            specifications=specs,
            search_tags=tags,
        )

    if force_create:
        product = Product(
            title=title,
            brand=brand,
            model=model,
            category=category_obj,
            specifications=specs,
            identifiers=ids,
            tags=tags,
        )
        product.save()
        return product

    upc = identifier_value(ids, 'upc')
    if upc:
        product = Product.objects.filter(identifiers__upc=upc).first()
        if product is not None:
            _fill_product_blanks(
                product,
                category=category,
                model=model,
                identifiers=ids,
                search_tags=tags,
            )
            return product

    exact = Product.objects.filter(
        title__iexact=title,
        brand__iexact=brand,
        model__iexact=model,
        category=category_obj,
    ).first()
    if exact is not None:
        _fill_product_blanks(
            exact,
            category=category,
            model=model,
            identifiers=ids,
            search_tags=tags,
        )
        return exact

    product = Product(
        title=title,
        brand=brand,
        model=model,
        category=category_obj,
        specifications=specs,
        identifiers=ids,
        tags=tags,
    )
    product.save()
    return product
