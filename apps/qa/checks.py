"""
The standing QA checks (data_platform Phase 3). Each is named by its row in the data-quality
register (``.ai/extended/data-quality.md``) and returns the rows that break the rail.

A check is:
- **the query:** it returns a queryset or a list of dicts;
- **the handling:** what reports do with these rows today, from the register;
- **the severity;**
- optionally, **a fix kind:** the Requests kind that repairs it, staged for the owner to approve in
  production.

Adding a check: add its register row first (a new ID if needed), then add it here with a test.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from typing import Any, Callable

from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.db.models.functions import Lower
from django.utils import timezone

SAMPLE = 20
MAX_IDS = 1000


@dataclass(frozen=True)
class Check:
    id: str
    title: str
    stage: str
    severity: str
    handling: str
    query: Callable[[], Any]  # a queryset, or a list of dicts
    fields: tuple[str, ...] = ()
    fix_kind: str = ''
    enabled: Callable[[], bool] = field(default=lambda: True)


def _now():
    return timezone.now()


def _items():
    from apps.inventory.models import Item

    return Item.objects.all()


# ── Items ──────────────────────────────────────────────────────────────────────

def _stuck_intake():
    return _items().filter(status='intake', created_at__lt=_now() - timedelta(days=90)).order_by('created_at')


def _price_zero():
    return _items().filter(status='on_shelf', price__lte=0).order_by('-created_at')


def _no_retail():
    return _items().filter(status='on_shelf').filter(Q(retail__isnull=True) | Q(retail__lte=0)).order_by('-created_at')


def _over_retail():
    from django.db.models import F

    return _items().filter(status='on_shelf', retail__gt=0, price__gt=F('retail')).order_by('-price')


# ── Sales ──────────────────────────────────────────────────────────────────────

def _sold_no_sale():
    return _items().filter(status='sold').filter(Q(sold_at__isnull=True) | Q(sold_for__isnull=True)).order_by('-updated_at')


def _shelf_but_sold():
    from apps.pos.models import CartLine

    sold_line = CartLine.objects.filter(item_id=OuterRef('pk'), cart__status='completed')
    return _items().filter(status='on_shelf').filter(Exists(sold_line)).order_by('-updated_at')


# ── Purchase orders ────────────────────────────────────────────────────────────

def _stale_open_pos():
    from apps.inventory.models import PurchaseOrder

    cutoff = timezone.localdate() - timedelta(days=120)
    return PurchaseOrder.objects.filter(status__in=['delivered', 'processing'], ordered_date__lt=cutoff).order_by('ordered_date')


def _backwards_dates():
    from django.db.models import F

    from apps.inventory.models import PurchaseOrder

    return PurchaseOrder.objects.filter(
        Q(paid_date__lt=F('ordered_date')) | Q(delivered_date__lt=F('ordered_date'))
    ).order_by('-ordered_date')


# ── Auctions ───────────────────────────────────────────────────────────────────

def _manifest_flag_without_rows():
    from apps.buying.models import Auction, ManifestRow

    rows = ManifestRow.objects.filter(auction_id=OuterRef('pk'))
    return Auction.objects.filter(status='open', has_manifest=True).exclude(Exists(rows)).order_by('end_time')


def _open_after_end():
    from apps.buying.models import Auction

    return Auction.objects.filter(status='open', end_time__lt=_now() - timedelta(days=1)).order_by('end_time')


# ── Products ───────────────────────────────────────────────────────────────────

def _duplicate_titles_on_floor():
    """Title groups with more than one product among products that have units on the floor."""
    from apps.inventory.models import Product

    groups = (
        Product.objects.filter(items__status='on_shelf').annotate(key=Lower('title')).values('key')
        .annotate(n=Count('pk', distinct=True)).filter(n__gt=1).order_by('-n', 'key')
    )
    return [{'title': g['key'], 'products': g['n']} for g in groups[:MAX_IDS]]


# ── Thrift+ ────────────────────────────────────────────────────────────────────

def _thrift_live() -> bool:
    try:
        from apps.thriftplus.services.members import is_enabled

        return is_enabled()
    except Exception:
        return False


def _floor_without_reward():
    from apps.thriftplus.models import ItemReward

    state = ItemReward.objects.filter(item_id=OuterRef('pk'))
    return _items().filter(status='on_shelf').exclude(Exists(state)).order_by('-listed_at')


def _cards_without_photo():
    from apps.thriftplus.models import Card

    return Card.objects.filter(status='active').filter(Q(person__photo='') | Q(person__photo__isnull=True)).order_by('-issued_at')


def _negative_balances():
    from apps.thriftplus.models import LedgerEntry

    rows = (
        LedgerEntry.objects.filter(kind__in=[LedgerEntry.KIND_CREDIT, LedgerEntry.KIND_BANK])
        .values('account_id', 'kind').annotate(balance=Sum('amount')).filter(balance__lt=0).order_by('balance')
    )
    return [{'account': r['account_id'], 'kind': r['kind'], 'balance': str(r['balance'])} for r in rows[:MAX_IDS]]


def _cover_over_amount():
    from apps.thriftplus.models import LedgerEntry
    from apps.thriftplus.services.trip import cover_amount

    amount = cover_amount()
    rows = (
        LedgerEntry.objects.filter(kind=LedgerEntry.KIND_COVER).values('account_id', 'month')
        .annotate(covered=Sum('amount')).filter(covered__gt=amount).order_by('-covered')
    )
    return [{'account': r['account_id'], 'month': r['month'], 'covered': str(r['covered'])} for r in rows[:MAX_IDS]]


CHECKS: list[Check] = [
    Check('ITM-05', 'Items stuck in intake 90+ days', 'items', 'medium', 'use as in the building', _stuck_intake,
          ('sku', 'product__title', 'created_at', 'purchase_order__order_number')),
    Check('ITM-07', 'On-floor items priced $0', 'items', 'high', 'flag', _price_zero, ('sku', 'product__title', 'price')),
    Check('ITM-08', 'On-floor items with no retail', 'items', 'low', 'exclude from recovery', _no_retail,
          ('sku', 'product__title', 'price', 'retail')),
    Check('ITM-10', 'On-floor price above retail', 'items', 'medium', 'flag', _over_retail,
          ('sku', 'product__title', 'price', 'retail')),
    Check('SAL-04', 'Sold with no sale date or price', 'sales', 'medium', 'exclude from sales math', _sold_no_sale,
          ('sku', 'product__title', 'sold_at', 'sold_for')),
    Check('SHR-03', 'On the floor but on a completed sale', 'sales', 'high', 'flag; likely sold', _shelf_but_sold,
          ('sku', 'product__title', 'price'), fix_kind='qa.sold_from_cart'),
    Check('PO-01', 'Open POs older than 120 days', 'order→processing', 'low', 'count as processed', _stale_open_pos,
          ('order_number', 'status', 'ordered_date')),
    Check('PO-11', 'PO dates run backwards', 'order', 'low', 'exclude from timing', _backwards_dates,
          ('order_number', 'ordered_date', 'paid_date', 'delivered_date')),
    Check('AUC-07', 'Open auctions flagged "has manifest" with no rows', 'auction', 'low', 'use manifest rows, not the flag',
          _manifest_flag_without_rows, ('title', 'end_time')),
    Check('AUC-08', 'Auctions still open a day after they ended', 'auction', 'low', 'ended = closed', _open_after_end,
          ('title', 'end_time')),
    Check('PRD-01', 'Duplicate product titles among floor products', 'products', 'medium', 'group by title for analysis',
          _duplicate_titles_on_floor),
    Check('TP-01', 'Floor items with no Thrift+ reward (switch on)', 'thrift+', 'high', 'no member price until the nightly run',
          _floor_without_reward, ('sku', 'product__title', 'listed_at'), enabled=_thrift_live),
    Check('TP-02', 'Active Thrift+ cards with no photo', 'thrift+', 'medium', 'the cashier cannot check the person',
          _cards_without_photo, ('code', 'person__first_name', 'issued_at')),
    Check('TP-03', 'Thrift+ balances below zero', 'thrift+', 'high', 'never spend past zero; investigate', _negative_balances),
    Check('TP-04', 'Thrift+ cover over the monthly amount', 'thrift+', 'high', 'the cover never passes its amount', _cover_over_amount),
]


def by_id(check_id: str) -> Check | None:
    return next((c for c in CHECKS if c.id == check_id), None)


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return value


def evaluate(check: Check) -> tuple[int, list[dict], list]:
    """(count, sample rows, ids) for one check."""
    if not check.enabled():
        return 0, [], []
    result = check.query()
    if isinstance(result, list):
        return len(result), result[:SAMPLE], []
    count = result.count()
    fields = ('pk',) + check.fields
    sample = [{k: _jsonable(v) for k, v in row.items()} for row in result.values(*fields)[:SAMPLE]]
    ids = list(result.values_list('pk', flat=True)[:MAX_IDS])
    return count, sample, ids
