"""
Reward families (thrift_plus_rewards Phase 2): products a shopper treats as the same kind of thing
at a similar price, so their floor units pace together in the reward engine.

Units of one product always pace together (bulk), with no model involved. Across products, each
product on the floor is checked **once**:
1. Find its nearest products on the floor by vector: a pgvector cosine search over
   ``ProductVector``, with similarity at least ``MIN_SIMILARITY``, up to ``NEIGHBOURS``.
2. With no close neighbour, the product stands alone and there is no model call.
3. Otherwise the model configured for ``THRIFTPLUS_FAMILY`` (Settings → AI) answers "which of
   these are the same family?" in one forced tool call.

The answer is stored in ``FamilyLink`` and never asked again. The nightly math only reads it. A
product with no vector yet is skipped until ``embed_products`` gives it one.
"""
from __future__ import annotations

import logging
from collections import Counter

from django.db import transaction
from django.db.models import Avg, Count, Q
from pgvector.django import CosineDistance

from apps.thriftplus.models import FamilyLink, RewardFamily

logger = logging.getLogger(__name__)

PURPOSE = 'THRIFTPLUS_FAMILY'
TOOL = 'same_family'
NEIGHBOURS = 8
MIN_SIMILARITY = 0.85

SYSTEM = """You group a thrift store's products into families for pricing. A family is products a \
shopper treats as the same kind of thing at a similar price, so buying one means not buying the \
other: the same item in another colour or size, or near-identical models from one brand.

Not a family: different kinds of item (a blender and a toaster), an item and its accessory, or \
prices more than about double apart. Decide only from the lines given. When unsure, leave it out."""

SCHEMA = {
    'name': TOOL,
    'description': 'Which candidates are the same family as the product.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'same_ids': {'type': 'array', 'items': {'type': 'integer'}, 'description': 'Candidate ids in the same family. Empty if none.'},
            'family_name': {'type': 'string', 'description': 'A short name for the family, e.g. "Ninja 72 oz blenders". Empty if none.'},
            'reason': {'type': 'string', 'description': 'One short sentence.'},
        },
        'required': ['same_ids', 'family_name', 'reason'],
    },
}


def _floor_products():
    from apps.inventory.models import Item

    return Item.objects.filter(status='on_shelf').exclude(source='consignment').values('product_id')


def candidates(limit: int = 200) -> list[int]:
    """Products on the floor with a vector and no family check yet, most units first."""
    from apps.inventory.models import Product
    from apps.inventory.services.product_vectors import MODEL_NAME

    return list(
        Product.objects.filter(pk__in=_floor_products(), vectors__model_name=MODEL_NAME, reward_family_link__isnull=True)
        .annotate(units=Count('items', filter=Q(items__status='on_shelf')))
        .order_by('-units', 'pk').values_list('pk', flat=True)[:limit]
    )


def _describe(product_ids: list[int]) -> dict[int, dict]:
    from apps.inventory.models import Product

    rows = (
        Product.objects.filter(pk__in=product_ids)
        .annotate(floor_price=Avg('items__price', filter=Q(items__status='on_shelf')))
        .values('pk', 'title', 'brand', 'profile__category', 'profile__subcategory', 'floor_price')
    )
    return {
        r['pk']: {
            'id': r['pk'], 'title': r['title'] or '', 'brand': r['brand'] or '',
            'category': ' > '.join(x for x in (r['profile__category'], r['profile__subcategory']) if x),
            'price': f"{r['floor_price']:.2f}" if r['floor_price'] is not None else '',
        }
        for r in rows
    }


def neighbours(product_id: int) -> list[dict]:
    """The closest other products on the floor, most similar first, above ``MIN_SIMILARITY``."""
    from apps.inventory.models import ProductVector
    from apps.inventory.services.product_vectors import MODEL_NAME

    own = ProductVector.objects.filter(product_id=product_id, model_name=MODEL_NAME).first()
    if own is None:
        return []
    rows = list(
        ProductVector.objects.filter(model_name=MODEL_NAME, product_id__in=_floor_products())
        .exclude(product_id=product_id)
        .annotate(distance=CosineDistance('embedding', own.embedding))
        .order_by('distance').values('product_id', 'distance')[:NEIGHBOURS]
    )
    return [
        {'product_id': r['product_id'], 'similarity': round(1 - float(r['distance']), 3)}
        for r in rows if 1 - float(r['distance']) >= MIN_SIMILARITY
    ]


def _line(d: dict) -> str:
    return f"{d['id']}: {d['title']} | brand {d['brand'] or '-'} | {d['category'] or 'no category'} | ${d['price'] or '?'}"


def _ask(product: dict, near: list[dict]) -> tuple[dict, str]:
    from apps.core.services.llm_router import llm_chat_tool_input

    user = 'Product:\n' + _line(product) + '\n\nCandidates:\n' + '\n'.join(_line(d) for d in near)
    return llm_chat_tool_input(
        purpose=PURPOSE, system=SYSTEM, user=user, tool_name=TOOL, tools=[SCHEMA],
        temperature=0.0, max_tokens=500, timeout=60, log_source='thriftplus_family', log_detail=str(product['id']),
    )


def check(product_id: int) -> FamilyLink:
    """Check one product once: stand alone, or join (or start) a family with the neighbours the
    model names. Neighbours named in the answer that had no family join it too."""
    link = FamilyLink.objects.filter(product_id=product_id).first()
    if link is not None:
        return link
    near = neighbours(product_id)
    if not near:
        return FamilyLink.objects.create(product_id=product_id, source=FamilyLink.SOURCE_ALONE, answer={'neighbours': []})
    info = _describe([product_id] + [n['product_id'] for n in near])
    body, model_used = _ask(info[product_id], [info[n['product_id']] for n in near if n['product_id'] in info])
    near_ids = {n['product_id'] for n in near}
    same = [int(i) for i in body.get('same_ids') or [] if str(i).lstrip('-').isdigit() and int(i) in near_ids]
    answer = {'neighbours': near, 'same_ids': same, 'reason': str(body.get('reason') or '')[:300]}
    with transaction.atomic():
        if not same:
            return FamilyLink.objects.create(
                product_id=product_id, source=FamilyLink.SOURCE_ASKED, answer=answer, model_used=model_used[:80],
            )
        taken = dict(FamilyLink.objects.filter(product_id__in=same).values_list('product_id', 'family_id'))
        existing = Counter(f for f in taken.values() if f)
        if existing:
            family = RewardFamily.objects.get(pk=existing.most_common(1)[0][0])
        else:
            family = RewardFamily.objects.create(name=str(body.get('family_name') or '')[:120])
        link = FamilyLink.objects.create(
            product_id=product_id, family=family, source=FamilyLink.SOURCE_ASKED, answer=answer, model_used=model_used[:80],
        )
        for pid in same:
            if pid not in taken:
                FamilyLink.objects.create(
                    product_id=pid, family=family, source=FamilyLink.SOURCE_NEIGHBOUR,
                    answer={'named_by': product_id}, model_used=model_used[:80],
                )
            elif taken[pid] is None:
                FamilyLink.objects.filter(product_id=pid).update(family=family)
    return link


def assign(limit: int = 200) -> dict:
    """Check up to ``limit`` products; a failed model call leaves that product for the next night."""
    counts: Counter = Counter()
    for pid in candidates(limit):
        try:
            link = check(pid)
        except Exception as exc:  # one bad answer never stops the night
            logger.warning('family check for product %s failed: %s', pid, exc)
            counts['failed'] += 1
            continue
        counts['joined' if link.family_id else link.source] += 1
    return dict(counts)
