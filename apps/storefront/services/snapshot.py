"""The store snapshot behind the phone site's feeds (owner 2026-11-19: speed first).

``build()`` reads the shelf and the coming trucks in a handful of set-based queries (no per-item queries) and returns
plain Python data. ``stock_payload`` / ``home_payload`` shape the two feeds; ``holder.py`` keeps them encoded in memory.

- **In store:** one row per product with a unit on the shelf (``status='on_shelf'``, ``price > 0``). Its category is
  the store's effective rule (``taxonomy_bucket_case_sql``). Its numbers come from a **representative unit**: the shelf
  unit with the most ThriftBucks (ties: the lowest price, then the lowest id). ``tag`` only when it is the only unit.
- **Coming:** the manifest rows of paid or shipped orders, with their retail and quantity, never a price, a cost or a
  note; every such truck, also one with no rows yet.
- **Best finds:** up to 12 products with a shown retail, by retail less price, at most 2 per category: the best that
  HAVE a public photo (``services/photos.py``: a photo-sheet photo, else a found stock photo); only when fewer than 8
  have one, the list is filled with the best without.
- **Photos:** only photo-sheet photos and stock photos (owner 2026-11-19: never an Add item photo or any other photo
  taken for another purpose). One query (``photos.kinds``).

Never public (and never read here): item cost, notes, location, search text; order costs, retail value, notes;
manifest ``proposed_price`` / ``final_price`` / ``pricing_notes``.
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal
from pathlib import Path

from django.db import connection
from django.db.models import Count, Sum
from django.utils import timezone

from apps.storefront.services import photos
from apps.storefront.services import rules as R
from apps.storefront.services.photos import photo_url

logger = logging.getLogger(__name__)

COMING_STATUSES = ('paid', 'shipped')
FINDS = 12
FINDS_PER_CAT = 2
FINDS_MIN_PHOTOS = 8  # fewer pieces with a photo than this: fill with the best without
TOP_CATS = 6
HOME_COMING = 12


def _not_restricted(product_col: str) -> str:
    """18+ products (a ``RestrictedProduct`` row, as the scanner's ``age_restricted``) are never in a public feed."""
    from apps.thriftplus.models import RestrictedProduct

    return f"NOT EXISTS (SELECT 1 FROM {RestrictedProduct._meta.db_table} rp WHERE rp.product_id = {product_col})"


def _app_version() -> str:
    """The release of this checkout (root package.json), read once: the page shows an update bar when it differs."""
    import json
    from django.conf import settings

    try:
        return str(json.loads((Path(settings.BASE_DIR) / 'package.json').read_text(encoding='utf-8')).get('version') or '')
    except Exception:
        logger.warning('storefront: no version in package.json')
        return ''


APP_VERSION = _app_version()


def _instore_sql(use_profile: bool) -> str:
    from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
    from apps.inventory.models import Item, ManifestRow, Product
    from apps.thriftplus.models import ItemReward

    bucket = taxonomy_bucket_case_sql(item_alias='i', product_alias='p', manifest_row_alias='mr', use_profile=use_profile)
    return f"""
SELECT i.id, i.product_id, i.sku, i.price, i.retail, i.retail_check, i.source,
       r.reward, r.starting_price, r.status, {bucket} AS bucket
FROM {Item._meta.db_table} i
JOIN {Product._meta.db_table} p ON p.id = i.product_id
LEFT JOIN {ManifestRow._meta.db_table} mr ON mr.id = i.manifest_row_id
LEFT JOIN {ItemReward._meta.db_table} r ON r.item_id = i.id
WHERE i.status = 'on_shelf' AND i.price > 0 AND {_not_restricted('i.product_id')}"""


# Owner 2026-11-19: "NEVER EVER EVER use photos you got from us for other purposes. like the add item photos."
# Product.photo / photo_thumb (taken for Add item) are never read here. The photo comes from ``photos.kinds``.
def _products_sql() -> str:
    from apps.inventory.models import Item, Product, ProductProfile

    return f"""
SELECT p.id, p.title, COALESCE(pp.display_title, '')
FROM {Product._meta.db_table} p
LEFT JOIN {ProductProfile._meta.db_table} pp ON pp.product_id = p.id
WHERE p.id IN (SELECT product_id FROM {Item._meta.db_table} WHERE status = 'on_shelf' AND price > 0)
  AND {_not_restricted('p.id')}"""


def _instore(s: R.Settings, timings: dict) -> tuple[list[dict], list[int]]:
    """One dict per product, and the shelf pieces per category index."""
    t = time.perf_counter()
    with connection.cursor() as cur:
        cur.execute(_instore_sql(s.use_profile))
        items = cur.fetchall()
        timings['instore_query'] = time.perf_counter() - t
        t = time.perf_counter()
        cur.execute(_products_sql())
        products = {pid: (title, display) for pid, title, display in cur.fetchall()}
        timings['products_query'] = time.perf_counter() - t
        t = time.perf_counter()
        photo_kinds = photos.kinds(cur)
    timings['photos_query'] = time.perf_counter() - t

    t = time.perf_counter()
    pieces = [0] * len(R.CATS)
    best: dict[int, tuple] = {}   # pid -> (sort key, row)
    units: dict[int, int] = {}
    zero = R.ZERO
    for row in items:
        iid, pid, sku, tag, retail, check, source, reward, start, status, bucket = row
        cat = R.bucket_index(bucket)
        pieces[cat] += 1
        units[pid] = units.get(pid, 0) + 1
        tb = R.thriftbucks(tag, source=source, reward=reward, starting_price=start, status=status, s=s) if reward else zero
        key = (-tb, tag, iid)
        held = best.get(pid)
        if held is None or key < held[0]:
            best[pid] = (key, (sku, tag, retail, check, tb, cat))
    out = []
    for pid, (_, (sku, tag, retail, check, tb, cat)) in best.items():
        title, display = products.get(pid, ('', ''))
        n = units[pid]
        out.append({
            'pid': pid, 'name': R.clean_name((display or '').strip() or title), 'cat': cat,
            'price': R.shown_price(tag, s), 'retail': R.shown_retail(tag, retail, check or '', s), 'tb': tb,
            'units': n, 'tag': R.tag_digits(sku) if n == 1 else '', 'photo': photo_kinds.get(pid, photos.KIND_NONE),
        })
    # A stable order (pid last): an unchanged shelf gives the same bytes, so the same ETag.
    out.sort(key=lambda r: (0, -(r['retail'] - r['price']), r['pid']) if r['retail'] else (1, -r['tb'], -r['price'], r['pid']))
    timings['instore_rows'] = time.perf_counter() - t
    return out, pieces


def _coming(timings: dict) -> tuple[list[dict], list[dict]]:
    from apps.inventory.models import ManifestRow, PurchaseOrder

    t = time.perf_counter()
    orders = list(
        PurchaseOrder.objects.filter(status__in=COMING_STATUSES)
        .annotate(rows=Count('manifest_rows'), pieces=Sum('manifest_rows__quantity'))
        .order_by('id').values_list('id', 'vendor_name_cache', 'pallet_count', 'rows', 'pieces')
    )
    trucks = [{'id': oid, 'name': (name or '').strip() or 'Truck', 'pallets': pallets or 0,
               'pieces': max(0, pieces or 0), 'listed': bool(rows)} for oid, name, pallets, rows, pieces in orders]
    truck_index = {t_['id']: i for i, t_ in enumerate(trucks)}
    rows = (ManifestRow.objects.filter(purchase_order__status__in=COMING_STATUSES)
            .values_list('id', 'title', 'unit_retail', 'quantity', 'category', 'purchase_order_id'))
    coming = [{'id': rid, 'name': R.clean_name(title), 'cat': R.coming_index(category, title),
               'retail': unit_retail if unit_retail and unit_retail > 0 else R.ZERO, 'qty': max(0, qty or 0),
               'truck': truck_index[oid]}
              for rid, title, unit_retail, qty, category, oid in rows if oid in truck_index]
    coming.sort(key=lambda r: (-r['retail'], r['id']))
    timings['coming'] = time.perf_counter() - t
    return trucks, coming


def ranked(instore: list[dict], limit: int, per_cat: int = FINDS_PER_CAT, taken: dict[int, int] | None = None,
           ) -> list[dict]:
    """The best-find rule, photos aside: a shown retail, the biggest saving (retail less price) first, at most
    ``per_cat`` per category (``taken`` carries the counts already used)."""
    pool = sorted((r for r in instore if r['retail'] > 0), key=lambda r: (-(r['retail'] - r['price']), r['pid']))
    taken = {} if taken is None else taken
    out = []
    for r in pool:
        if len(out) >= limit:
            break
        if taken.get(r['cat'], 0) >= per_cat:
            continue
        taken[r['cat']] = taken.get(r['cat'], 0) + 1
        out.append(r)
    return out


def best_finds(instore: list[dict], limit: int = FINDS, per_cat: int = FINDS_PER_CAT) -> list[dict]:
    """The best-ranked products that have a public photo; only when fewer than ``FINDS_MIN_PHOTOS`` do, the best
    without fill the list (after them, so the photos lead the slider)."""
    taken: dict[int, int] = {}
    out = ranked([r for r in instore if r['photo']], limit, per_cat, taken)
    if len(out) < FINDS_MIN_PHOTOS:
        out += ranked([r for r in instore if not r['photo']], limit - len(out), per_cat, taken)
    return out


def build(settings: R.Settings | None = None) -> dict:
    """The whole snapshot, as plain data. ``timings`` says where the seconds went."""
    timings: dict[str, float] = {}
    start = time.perf_counter()
    s = settings or R.load_settings()
    R.remember(s)
    timings['settings'] = time.perf_counter() - start
    instore, pieces = _instore(s, timings)
    trucks, coming = _coming(timings)
    t = time.perf_counter()
    try:
        from apps.webstore.services.hours import public_hours_payload

        hours = public_hours_payload()
    except Exception:  # the hours never stop the feeds
        logger.exception('storefront: store hours failed')
        hours = None
    timings['hours'] = time.perf_counter() - t
    timings['total'] = time.perf_counter() - start
    return {
        'as_of': timezone.now(), 'settings': s, 'instore': instore, 'pieces': pieces, 'trucks': trucks,
        'coming': coming, 'finds': best_finds(instore), 'hours': hours, 'timings': timings,
    }


# ── The two feeds (``v`` and ``as_of`` are added by the holder) ───────────────

def _cats(snap: dict) -> list[dict]:
    return [{'id': cid, 'name': name, 'pieces': snap['pieces'][i]} for i, (cid, name) in enumerate(R.CATS)]


def stock_payload(snap: dict) -> dict:
    n = R.num
    return {
        'cats': _cats(snap),
        'trucks': snap['trucks'],
        # The 9th field: the public photo, 0 none | 1 photo sheet | 2 stock photo.
        'instore': [[r['pid'], r['name'], r['cat'], n(r['price']), n(r['retail']), n(r['tb']), r['units'], r['tag'],
                     r['photo']] for r in snap['instore']],
        'coming': [[r['id'], r['name'], r['cat'], n(r['retail']), r['qty'], r['truck']] for r in snap['coming']],
    }


def _find(r: dict) -> dict:
    n = R.num
    return {'pid': r['pid'], 'name': r['name'], 'cat': R.CATS[r['cat']][0], 'price': n(r['price']),
            'retail': n(r['retail']), 'tb': n(r['tb']), 'units': r['units'], 'tag': r['tag'],
            'photo': photo_url(r['pid']) if r['photo'] else None, 'photo_kind': photos.KIND_NAMES.get(r['photo'])}


def home_payload(snap: dict) -> dict:
    s: R.Settings = snap['settings']
    ranked = sorted((i for i in range(len(R.CATS)) if i != R.OTHER), key=lambda i: (-snap['pieces'][i], i))
    trucks = snap['trucks']
    return {
        'app': APP_VERSION,
        'day': s.day,
        'shelf': {'pieces': sum(snap['pieces']), 'products': len(snap['instore']), 'categories': len(R.CATS)},
        'hours': snap['hours'],
        'thrift_plus_open': s.thrift_plus_open,
        'finds': [_find(r) for r in snap['finds']],
        'coming': {
            'trucks': trucks,
            'items': [{'id': r['id'], 'name': r['name'], 'cat': R.CATS[r['cat']][0], 'retail': R.num(r['retail']),
                       'qty': r['qty'], 'truck': trucks[r['truck']]['id']} for r in snap['coming'][:HOME_COMING]],
        },
        'top_cats': [{'id': R.CATS[i][0], 'pieces': snap['pieces'][i]} for i in ranked[:TOP_CATS]],
    }


def json_default(value):
    if isinstance(value, Decimal):
        return R.num(value)
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    raise TypeError(f'not JSON: {type(value).__name__}')
