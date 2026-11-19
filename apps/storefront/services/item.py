"""One product for the phone's item page, read live: two queries (the product, its shelf units) plus the rules, which
come from the last build or are read once a minute (``rules.cached_settings``).

The numbers are the representative unit's, by the snapshot's own rule (the most ThriftBucks; ties: the lowest price,
then the lowest id), so the item page agrees with the list. Never notes, cost or location (notes are read only to
decide AS IS, as the register does).
"""
from __future__ import annotations

from types import SimpleNamespace

from django.db import connection

from apps.storefront.services import rules as R
from apps.storefront.services.snapshot import _not_restricted, photo_url

TAGS_SHOWN = 5


def _units_sql(use_profile: bool) -> str:
    from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
    from apps.inventory.models import Item, ManifestRow, Product
    from apps.thriftplus.models import ItemReward

    bucket = taxonomy_bucket_case_sql(item_alias='i', product_alias='p', manifest_row_alias='mr', use_profile=use_profile)
    return f"""
SELECT i.id, i.sku, i.price, i.retail, i.retail_check, i.source, i.condition, i.notes,
       r.reward, r.starting_price, r.status, {bucket} AS bucket
FROM {Item._meta.db_table} i
JOIN {Product._meta.db_table} p ON p.id = i.product_id
LEFT JOIN {ManifestRow._meta.db_table} mr ON mr.id = i.manifest_row_id
LEFT JOIN {ItemReward._meta.db_table} r ON r.item_id = i.id
WHERE i.product_id = %s AND i.status = 'on_shelf' AND i.price > 0 AND {_not_restricted('i.product_id')}"""


def product_payload(pid: int) -> dict | None:
    """The item page's data, or None when the product has nothing on the shelf or is 18+."""
    from apps.inventory.models import Product
    from apps.thriftplus.services.returns import why_as_is
    from apps.thriftplus.services.scanner import CONDITION_LABELS

    s = R.cached_settings()
    product = Product.objects.select_related('profile').filter(pk=pid).first()
    if product is None:
        return None
    with connection.cursor() as cur:
        cur.execute(_units_sql(s.use_profile), [pid])
        rows = cur.fetchall()
    if not rows:
        return None
    units = []
    for iid, sku, tag, retail, check, source, condition, notes, reward, start, status, bucket in rows:
        tb = R.thriftbucks(tag, source=source, reward=reward, starting_price=start, status=status, s=s) if reward else R.ZERO
        units.append(((-tb, tag, iid), sku, tag, retail, check or '', condition, notes, tb, bucket))
    units.sort(key=lambda u: u[0])
    _, sku, tag, retail, check, condition, notes, tb, bucket = units[0]
    profile = getattr(product, 'profile', None)
    price = R.shown_price(tag, s)
    rep = SimpleNamespace(product_id=product.pk, product=product, condition=condition, notes=notes, price=tag)
    as_is = why_as_is(rep, price=price, reward=tb, rules=s.guide)
    brand = ((profile.brand if profile is not None else '') or product.brand or '').strip()
    return {
        'pid': product.pk,
        'name': R.clean_name((profile.display_title if profile is not None else '').strip() or product.title),
        'brand': '' if brand.lower() == 'generic' else brand,
        'cat': R.CATS[R.bucket_index(bucket)][0],
        'condition': CONDITION_LABELS.get(condition, ''),
        'units': len(units),
        'tags': [R.tag_digits(u[1]) for u in units[:TAGS_SHOWN]],
        'price': R.num(price),
        'retail': R.num(R.shown_retail(tag, retail, check, s)),
        'tb': R.num(tb),
        'returns': 'as_is' if as_is else '3-day',
        'photo': photo_url(product.pk) if product.photo_thumb else None,
        'available': True,
    }
