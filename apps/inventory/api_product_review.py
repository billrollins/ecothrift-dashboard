"""
Product review queue (product_intelligence Phase 2, step 4).

GET  /api/inventory/product-review/?batch=&category=&page=   one row per product with pending
     proposals, biggest dollars first: the proposed category, subcategory and short name, the
     second opinion, and the current profile.
POST /api/inventory/product-review/<product_id>/decide/   {"action": "accept" | "fix" | "reject",
     "category", "subcategory", "short_name" (fix only)}
     accept: the proposals become the profile, marked human (a person checked them).
     fix:    the given values become the profile, marked human; the proposals are rejected.
     reject: the proposals are rejected; the profile is unchanged.
Only ProductProfile / ProductProposal are written. Product rows are never changed.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.models import Product, ProductProfile, ProductProposal
from apps.inventory.services.product_profile import set_field

PAGE_SIZE = 50
REVIEW_FIELDS = ('category', 'subcategory', 'short_name')


def _pending(request):
    # Merged-away products (inactive) are not reviewed; their survivor carries the sales.
    qs = ProductProposal.objects.filter(status=ProductProposal.STATUS_PENDING, product__is_active=True)
    batch = request.query_params.get('batch')
    if batch:
        qs = qs.filter(batch=batch)
    category = request.query_params.get('category')
    if category:
        ids = qs.filter(field='category', value=category).values('product_id')
        qs = qs.filter(product_id__in=ids)
    return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def product_review_list(request):
    qs = _pending(request)
    try:
        page = max(1, int(request.query_params.get('page') or 1))
    except ValueError:
        page = 1
    grouped = (
        qs.values('product_id').annotate(dollars=Max('dollars')).order_by('-dollars', 'product_id')
    )
    total = grouped.count()
    ids = [g['product_id'] for g in grouped[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]]
    props = ProductProposal.objects.filter(product_id__in=ids, status=ProductProposal.STATUS_PENDING)
    products = {p.pk: p for p in Product.objects.filter(pk__in=ids)}
    profiles = {p.product_id: p for p in ProductProfile.objects.filter(product_id__in=ids)}
    rows = {pid: {'proposed': {}, 'confidence': '', 'second_opinion': {}, 'dollars': '0'} for pid in ids}
    for p in props:
        r = rows[p.product_id]
        r['proposed'][p.field] = p.value
        if p.field == 'category':
            r['confidence'] = p.confidence
            r['second_opinion'] = p.second_opinion
            r['source'] = p.source
            r['batch'] = p.batch
        r['dollars'] = format(max(p.dollars, type(p.dollars)(r['dollars'])), 'f')
    results = []
    for pid in ids:
        prod = products.get(pid)
        prof = profiles.get(pid)
        results.append({
            'product_id': pid,
            'title': prod.title if prod else '',
            'brand': prod.brand if prod else '',
            'current': {f: getattr(prof, f) for f in REVIEW_FIELDS} if prof else {},
            **rows[pid],
        })
    by_category = (
        qs.filter(field='category').values('value').annotate(dollars=Sum('dollars')).order_by('-dollars')[:30]
    )
    return Response({
        'count': total,
        'page': page,
        'page_size': PAGE_SIZE,
        'results': results,
        'categories': list(TAXONOMY_V1_CATEGORY_NAMES),
        'by_category': [{'category': c['value'], 'dollars': format(c['dollars'], 'f')} for c in by_category],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def product_review_decide(request, product_id: int):
    action = str(request.data.get('action') or '')
    if action not in ('accept', 'fix', 'reject'):
        return Response({'detail': 'action must be accept, fix, or reject.'}, status=status.HTTP_400_BAD_REQUEST)
    pending = list(ProductProposal.objects.filter(product_id=product_id, status=ProductProposal.STATUS_PENDING))
    if not pending and action != 'fix':
        return Response({'detail': 'Nothing pending for this product.'}, status=status.HTTP_404_NOT_FOUND)
    if action == 'fix':
        category = str(request.data.get('category') or '').strip()
        if category and category not in TAXONOMY_V1_CATEGORY_NAMES:
            return Response({'detail': 'Pick one of the taxonomy categories.'}, status=status.HTTP_400_BAD_REQUEST)
    now = timezone.now()
    with transaction.atomic():
        if not Product.objects.filter(pk=product_id).exists():
            return Response({'detail': 'No such product.'}, status=status.HTTP_404_NOT_FOUND)
        if action == 'accept':
            for p in pending:
                set_field(product_id, p.field, p.value, source='human', confidence='high')
                p.status = ProductProposal.STATUS_APPLIED
        elif action == 'fix':
            for field in REVIEW_FIELDS:
                if field in request.data:
                    set_field(product_id, field, str(request.data.get(field) or ''), source='human', confidence='high')
            for p in pending:
                p.status = ProductProposal.STATUS_REJECTED
        else:
            for p in pending:
                p.status = ProductProposal.STATUS_REJECTED
        for p in pending:
            p.decided_by = request.user
            p.decided_at = now
        ProductProposal.objects.bulk_update(pending, ['status', 'decided_by', 'decided_at'])
    return Response({'product_id': product_id, 'action': action, 'proposals': len(pending)})
