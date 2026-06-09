"""Product resolver for standalone/manual Add Item flows."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.inventory.models import Category, Product

_SEARCH_TAG_MAX = 8
_SEARCH_TAG_LEN = 40


def normalize_search_tags(value: Any, *, max_tags: int = _SEARCH_TAG_MAX, max_len: int = _SEARCH_TAG_LEN) -> list[str]:
    """Normalize AI/form search tags: trim, dedupe case-insensitively, cap count/length."""

    if value is None:
        return []
    if isinstance(value, str):
        parts = [p.strip() for p in value.split(',') if p.strip()]
    elif isinstance(value, list):
        parts = [str(x).strip() for x in value if str(x).strip()]
    else:
        return []

    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        tag = part[:max_len]
        key = tag.lower()
        if not tag or key in seen:
            continue
        seen.add(key)
        out.append(tag)
        if len(out) >= max_tags:
            break
    return out


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


def merge_search_tags_into_specifications(
    specs: dict[str, Any] | None,
    new_tags: list[str],
) -> dict[str, Any]:
    """Conservatively merge durable search tags into Product.specifications."""

    merged_specs = dict(specs) if isinstance(specs, dict) else {}
    incoming = normalize_search_tags(new_tags)
    if not incoming:
        return merged_specs

    existing = normalize_search_tags(merged_specs.get('search_tags'))
    if not existing:
        merged_specs['search_tags'] = incoming
        return merged_specs

    combined = list(existing)
    seen = {tag.lower() for tag in combined}
    for tag in incoming:
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        combined.append(tag)
        if len(combined) >= _SEARCH_TAG_MAX:
            break
    merged_specs['search_tags'] = combined
    return merged_specs


def _clean(value: Any, max_len: int | None = None) -> str:
    text = str(value or '').strip()
    if max_len is not None:
        return text[:max_len]
    return text


def _category_ref_for_name(category: str) -> Category | None:
    if not category:
        return None
    return Category.objects.filter(name__iexact=category).first()


def _fill_product_blanks(
    product: Product,
    *,
    category: str,
    model: str,
    upc: str,
    search_tags: list[str] | None = None,
) -> None:
    """Conservative enrichment for reused products: only fill empty identity gaps."""

    update_fields: list[str] = []
    if category and not product.category:
        product.category = category
        update_fields.append('category')
        if product.category_ref_id is None:
            ref = _category_ref_for_name(category)
            if ref is not None:
                product.category_ref = ref
                update_fields.append('category_ref')
    if model and not product.model:
        product.model = model
        update_fields.append('model')
    if upc and not product.upc:
        product.upc = upc
        update_fields.append('upc')
    tags = normalize_search_tags(search_tags)
    if tags:
        merged_specs = merge_search_tags_into_specifications(product.specifications, tags)
        if merged_specs != (product.specifications or {}):
            product.specifications = merged_specs
            update_fields.append('specifications')
    if update_fields:
        product.save(update_fields=[*update_fields, 'updated_at'])


def _update_existing_product(
    product: Product,
    *,
    title: str,
    brand: str,
    category: str,
    model: str,
    upc: str,
    specifications: dict[str, Any],
    search_tags: list[str] | None = None,
    default_price: Decimal | None,
) -> Product:
    """Apply explicit item-edit product fields to an already linked product."""

    update_fields: list[str] = []
    for field, value in (
        ('title', title),
        ('brand', brand),
        ('category', category),
        ('model', model),
        ('upc', upc),
    ):
        if value and getattr(product, field) != value:
            setattr(product, field, value)
            update_fields.append(field)
    if category and product.category_ref_id is None:
        ref = _category_ref_for_name(category)
        if ref is not None:
            product.category_ref = ref
            update_fields.append('category_ref')

    merged_specs = dict(product.specifications) if isinstance(product.specifications, dict) else {}
    if specifications:
        merged_specs.update(specifications)
    tag_specs = merge_search_tags_into_specifications(merged_specs, normalize_search_tags(search_tags))
    if tag_specs != (product.specifications or {}):
        product.specifications = tag_specs
        update_fields.append('specifications')

    if default_price is not None and product.default_price is None:
        product.default_price = default_price
        update_fields.append('default_price')
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
    specifications: dict[str, Any] | None = None,
    search_tags: list[str] | str | None = None,
    default_price: Decimal | None = None,
    existing_product: Product | None = None,
) -> Product:
    """Resolve the Product identity for a standalone Add Item create/update.

    Matching stays deterministic: UPC first, then exact title/brand/model/category/UPC,
    otherwise create. Reused products are only enriched when fields are blank so a manual
    add does not rewrite another product's history by accident.
    """

    title = _clean(title, 300)
    brand = _clean(brand, 200)
    category = _clean(category, 200)
    model = _clean(model, 200)
    upc = _clean(upc, 100)
    specs = merge_search_tags_into_specifications(
        specifications if isinstance(specifications, dict) else {},
        normalize_search_tags(search_tags),
    )

    if existing_product is not None:
        return _update_existing_product(
            existing_product,
            title=title,
            brand=brand,
            category=category,
            model=model,
            upc=upc,
            specifications=specs,
            search_tags=normalize_search_tags(search_tags),
            default_price=default_price,
        )

    if upc:
        product = Product.objects.filter(upc__iexact=upc).first()
        if product is not None:
            _fill_product_blanks(
                product,
                category=category,
                model=model,
                upc=upc,
                search_tags=normalize_search_tags(search_tags),
            )
            return product

    exact = Product.objects.filter(
        title__iexact=title,
        brand__iexact=brand,
        model__iexact=model,
        category__iexact=category,
        upc__iexact=upc,
    ).first()
    if exact is not None:
        _fill_product_blanks(
            exact,
            category=category,
            model=model,
            upc=upc,
            search_tags=normalize_search_tags(search_tags),
        )
        return exact

    product = Product(
        title=title,
        brand=brand,
        model=model,
        category=category,
        upc=upc,
        specifications=specs,
        default_price=default_price,
    )
    if category:
        product.category_ref = _category_ref_for_name(category)
    product.save()
    return product
