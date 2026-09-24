"""
Product embeddings (product_intelligence Phase 2, step 6; owner 2026-09-24: pgvector local and Heroku).

- Model: ``BAAI/bge-small-en-v1.5`` through fastembed (ONNX, no PyTorch), 384 dimensions,
  about 400 titles a second on a laptop CPU. It downloads once (about 130 MB) into the fastembed cache.
- The text embedded per product: brand + title, plus the profile's category and subcategory when
  set (``product_text``). ``text_hash`` skips products whose text has not changed.
- Similar products: a pgvector cosine query (HNSW index), with plain SQL filters.
Vectors from different models are never compared: every query filters on ``model_name``.
"""
from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Iterable, Sequence

from django.db.models import Count, Q, Sum
from pgvector.django import CosineDistance

from apps.inventory.models import Product, ProductProfile, ProductVector
from apps.inventory.services.product_profile import canonical_brand

MODEL_NAME = 'BAAI/bge-small-en-v1.5'


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding

    return TextEmbedding(MODEL_NAME)


def embed_texts(texts: Sequence[str], batch_size: int = 256) -> list[list[float]]:
    """Unit-length vectors for ``texts`` (bge-small output is already normalized)."""
    if not texts:
        return []
    return [v.tolist() for v in _model().embed(list(texts), batch_size=batch_size)]


def product_text(product: Product, profile: ProductProfile | None = None) -> str:
    brand = (profile.brand if profile and profile.brand else '') or canonical_brand(product.brand)
    parts = [brand, product.title]
    if profile and profile.category and not profile.category.startswith('Mixed'):
        parts.append(profile.category)
        if profile.subcategory:
            parts.append(profile.subcategory)
    return ' | '.join(p.strip() for p in parts if p and p.strip())


def text_hash(text: str) -> str:
    return hashlib.sha1(f'{MODEL_NAME}\n{text}'.encode('utf-8')).hexdigest()


def embed_products(products: Iterable[Product], *, batch_size: int = 256) -> dict[str, int]:
    """Create or refresh vectors for ``products``; unchanged text is skipped."""
    products = list(products)
    ids = [p.pk for p in products]
    profiles = {pr.product_id: pr for pr in ProductProfile.objects.filter(product_id__in=ids)}
    existing = {
        v.product_id: v for v in ProductVector.objects.filter(product_id__in=ids, model_name=MODEL_NAME)
    }
    todo = []
    for p in products:
        text = product_text(p, profiles.get(p.pk))
        h = text_hash(text)
        old = existing.get(p.pk)
        if old is None or old.text_hash != h:
            todo.append((p, text, h, old))
    vectors = embed_texts([t for _, t, _, _ in todo], batch_size=batch_size)
    new, changed = [], []
    for (p, _text, h, old), vec in zip(todo, vectors):
        if old is None:
            new.append(ProductVector(product_id=p.pk, model_name=MODEL_NAME, embedding=vec, text_hash=h))
        else:
            old.embedding, old.text_hash = vec, h
            changed.append(old)
    ProductVector.objects.bulk_create(new, batch_size=1000)
    if changed:
        ProductVector.objects.bulk_update(changed, ['embedding', 'text_hash', 'updated_at'], batch_size=1000)
    return {'created': len(new), 'updated': len(changed), 'skipped': len(products) - len(todo)}


def similar_products(
    *,
    product: Product | None = None,
    text: str | None = None,
    limit: int = 10,
    category: str | None = None,
    sold_only: bool = False,
) -> list[dict]:
    """
    Nearest products by meaning, closest first: from a product's stored vector, or from free
    text (a new manifest line). Each row carries its profile category and sales so the caller
    can say how similar things sold.
    """
    if product is not None:
        own = ProductVector.objects.filter(product=product, model_name=MODEL_NAME).first()
        if own is None:
            return []
        query_vec = own.embedding
    elif text:
        query_vec = embed_texts([text])[0]
    else:
        raise ValueError('Give a product or text.')
    qs = ProductVector.objects.filter(model_name=MODEL_NAME, product__is_active=True)
    if product is not None:
        qs = qs.exclude(product=product)
    if category:
        qs = qs.filter(product__profile__category=category)
    if sold_only:
        qs = qs.filter(product__items__sold_for__gt=0).distinct()
    rows = list(
        qs.annotate(distance=CosineDistance('embedding', query_vec))
        .order_by('distance')
        .values('product_id', 'distance')[:limit]
    )
    ids = [r['product_id'] for r in rows]
    stats = {
        s['id']: s
        for s in Product.objects.filter(pk__in=ids).annotate(
            sold_count=Count('items', filter=Q(items__sold_for__gt=0)),
            sold_dollars=Sum('items__sold_for', filter=Q(items__sold_for__gt=0)),
        ).values('id', 'title', 'brand', 'sold_count', 'sold_dollars', 'profile__category', 'profile__subcategory')
    }
    out = []
    for r in rows:
        s = stats.get(r['product_id'], {})
        out.append({
            'product_id': r['product_id'],
            'title': s.get('title', ''),
            'brand': s.get('brand', ''),
            'category': s.get('profile__category') or '',
            'subcategory': s.get('profile__subcategory') or '',
            'similarity': round(1 - float(r['distance']), 3),
            'sold_count': s.get('sold_count') or 0,
            'sold_dollars': format(s.get('sold_dollars') or 0, 'f'),
        })
    return out
