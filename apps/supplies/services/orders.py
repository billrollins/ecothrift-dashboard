"""The week's supply order: built once after the count deadline, then ticked "Ordered" by the owner.

`run_due` hangs off the hourly `scheduled_sweep` (no new Scheduler job): after a deadline passes it builds that
cycle's order from the counts, by the rule in `rules.py`. Lists not counted by the deadline are named on the
order and on the Owner page; they add no lines.
"""
from __future__ import annotations

import logging
import re
from collections import OrderedDict
from datetime import date, datetime
from decimal import Decimal
from urllib.parse import urlencode, urlparse

from django.db import transaction
from django.utils import timezone

from ..models import SupplyCount, SupplyList, SupplyOrder, SupplyOrderLine
from ..settings import supplies_settings
from . import schedule
from .rules import order_packs

logger = logging.getLogger(__name__)

AMAZON_CART = 'https://www.amazon.com/gp/aws/cart/add.html'
ASIN_RE = re.compile(r'^[A-Z0-9]{10}$')
ASIN_IN_URL = re.compile(r'/(?:dp|gp/product|gp/aw/d|exec/obidos/asin|o/ASIN)/([A-Z0-9]{10})(?:[/?#]|$)', re.I)
LINK_TIMEOUT = 5.0


def asin_from_url(url: str) -> str:
    m = ASIN_IN_URL.search(str(url or ''))
    return m.group(1).upper() if m else ''


def is_amazon(vendor: str, url: str = '') -> bool:
    if 'amazon' in (vendor or '').lower():
        return True
    host = (urlparse(url or '').hostname or '').lower()
    return host == 'amzn.to' or host.startswith('amazon.') or '.amazon.' in f'.{host}'


def amazon_cart_url(lines) -> str:
    """One add-to-cart link for every (asin, quantity). Amazon lets the person check out themself."""
    params = {}
    n = 0
    for asin, qty in lines:
        asin = str(asin or '').strip().upper()
        if not ASIN_RE.match(asin) or int(qty) <= 0:
            continue
        n += 1
        params[f'ASIN.{n}'] = asin
        params[f'Quantity.{n}'] = int(qty)
    return f'{AMAZON_CART}?{urlencode(params)}' if n else ''


def check_link(url: str) -> str:
    """'broken' when the page is gone (404 / 410), else 'ok'. Anything else (time-out, 403, 5xx) counts as ok."""
    import requests

    headers = {'User-Agent': 'Mozilla/5.0 (compatible; EcoThriftSupplies/1.0)'}
    try:
        resp = requests.head(url, allow_redirects=True, timeout=LINK_TIMEOUT, headers=headers)
        if resp.status_code in (405, 501):
            resp = requests.get(url, allow_redirects=True, timeout=LINK_TIMEOUT, headers=headers, stream=True)
            resp.close()
    except Exception:  # noqa: BLE001 - a slow or odd site is not a broken link
        return SupplyOrderLine.LINK_OK
    return SupplyOrderLine.LINK_BROKEN if resp.status_code in (404, 410) else SupplyOrderLine.LINK_OK


def build_order(week_start: date, *, now: datetime | None = None, check_links: bool | None = None) -> SupplyOrder:
    """Build the cycle's order. Building twice returns the first one unchanged."""
    now = now or timezone.now()
    existing = SupplyOrder.objects.filter(week_start=week_start).first()
    if existing:
        return existing
    if check_links is None:
        check_links = supplies_settings()['check_links']
    counts = {
        c.supply_list_id: c
        for c in SupplyCount.objects.filter(week_start=week_start).prefetch_related('lines__item')
    }
    missed: list[str] = []
    lines: list[SupplyOrderLine] = []
    for supply_list in SupplyList.objects.filter(is_active=True):
        count = counts.get(supply_list.pk)
        if count is None:
            if supply_list.items.filter(is_active=True).exists():
                missed.append(supply_list.name)
            continue
        for cl in count.lines.all():
            item = cl.item
            if not item.is_active:
                continue
            packs, reason = order_packs(cl.on_hand, item.min_qty, item.max_qty, item.pack_size, item.unit)
            if packs <= 0:
                continue
            lines.append(SupplyOrderLine(
                item=item, list_name=supply_list.name, name=item.name, vendor=item.vendor.strip(),
                vendor_url=item.vendor_url, url=item.url, vendor_item_id=item.vendor_item_id.strip(),
                unit=item.unit, pack_size=item.pack_size, min_qty=item.min_qty, max_qty=item.max_qty,
                on_hand=cl.on_hand, packs=packs, price=item.price, reason=reason,
            ))
    if check_links:
        seen: dict[str, str] = {}
        for line in lines:
            if line.url and not is_amazon(line.vendor, line.url):
                if line.url not in seen:
                    seen[line.url] = check_link(line.url)
                line.link_status = seen[line.url]
    with transaction.atomic():
        order, created = SupplyOrder.objects.get_or_create(
            week_start=week_start, defaults={'built_at': now, 'missed_lists': missed},
        )
        if created:
            for line in lines:
                line.order = order
            SupplyOrderLine.objects.bulk_create(lines)
    return order


def run_due(now: datetime | None = None) -> str:
    """Build the order for the deadline that passed most recently, once. Never builds an older week."""
    now = now or timezone.now()
    cfg = supplies_settings()
    ws = schedule.last_closed_cycle(now, cfg)
    if SupplyOrder.objects.filter(week_start=ws).exists():
        return f'Supplies: order for {ws} already built.'
    due = schedule.deadline(ws, cfg)
    if not SupplyList.objects.filter(is_active=True, created_at__lt=due).exists():
        return 'Supplies: no lists yet.'
    order = build_order(ws, now=now)
    return f'Supplies: built the order for {ws} ({order.lines.count()} lines, {len(order.missed_lists)} lists missed).'


def missed_lists(now: datetime | None = None) -> list[str]:
    """Lists with items and no count for the deadline that passed most recently (lists made after it don't count)."""
    now = now or timezone.now()
    cfg = supplies_settings()
    ws = schedule.last_closed_cycle(now, cfg)
    due = schedule.deadline(ws, cfg)
    counted = SupplyCount.objects.filter(week_start=ws).values_list('supply_list_id', flat=True)
    return list(
        SupplyList.objects.filter(is_active=True, created_at__lt=due, items__is_active=True)
        .exclude(pk__in=list(counted)).distinct().values_list('name', flat=True)
    )


def _money(value) -> str | None:
    return None if value is None else f'{Decimal(value):.2f}'


def line_payload(line: SupplyOrderLine) -> dict:
    return {
        'id': line.pk,
        'list_name': line.list_name,
        'name': line.name,
        'vendor': line.vendor,
        'vendor_url': line.vendor_url,
        'url': line.url,
        'vendor_item_id': line.vendor_item_id,
        'unit': line.unit,
        'pack_size': line.pack_size,
        'min_qty': line.min_qty,
        'max_qty': line.max_qty,
        'on_hand': line.on_hand,
        'packs': line.packs,
        'price': _money(line.price),
        'line_total': _money(line.line_total),
        'reason': line.reason,
        'link_status': line.link_status,
        'ordered_at': line.ordered_at.isoformat() if line.ordered_at else None,
        'ordered_by': (line.ordered_by.full_name or line.ordered_by.email) if line.ordered_by else '',
        'received_qty': line.received_qty,
        'received_at': line.received_at.isoformat() if line.received_at else None,
        'received_by': (line.received_by.full_name or line.received_by.email) if line.received_by else '',
    }


def order_payload(order: SupplyOrder) -> dict:
    """The owner's order page: vendor by vendor, each with its total and (for Amazon) one add-to-cart link."""
    groups: OrderedDict[str, dict] = OrderedDict()
    lines = list(order.lines.select_related('ordered_by', 'received_by').order_by('vendor', 'list_name', 'name'))
    for line in lines:
        key = line.vendor or 'No vendor'
        group = groups.setdefault(key, {
            'vendor': key, 'vendor_url': '', 'lines': [], 'total': Decimal('0'), 'unpriced': 0,
            'is_amazon': False, 'cart_url': '', 'not_in_cart': 0,
        })
        group['vendor_url'] = group['vendor_url'] or line.vendor_url
        group['is_amazon'] = group['is_amazon'] or is_amazon(line.vendor, line.url)
        group['lines'].append(line)
        if line.line_total is None:
            group['unpriced'] += 1
        else:
            group['total'] += line.line_total
    out_groups = []
    grand = Decimal('0')
    for group in groups.values():
        glines = group.pop('lines')
        if group['is_amazon']:
            pairs = [(ln.vendor_item_id or asin_from_url(ln.url), ln.packs) for ln in glines]
            group['cart_url'] = amazon_cart_url(pairs)
            group['not_in_cart'] = sum(1 for asin, _ in pairs if not ASIN_RE.match(str(asin or '').upper()))
        grand += group['total']
        group['total'] = _money(group['total'])
        group['lines'] = [line_payload(ln) for ln in glines]
        group['ordered'] = all(ln.ordered_at for ln in glines)
        out_groups.append(group)
    return {
        'id': order.pk,
        'week_start': order.week_start.isoformat(),
        'deadline': schedule.deadline(order.week_start).isoformat(),
        'built_at': order.built_at.isoformat(),
        'missed_lists': order.missed_lists,
        'vendors': out_groups,
        'total': _money(grand),
        'line_count': len(lines),
        'open_count': sum(1 for ln in lines if not ln.ordered_at),
        'waiting_count': sum(1 for ln in lines if ln.ordered_at and ln.received_qty < ln.packs),
    }


def mark_ordered(order: SupplyOrder, line_ids, *, ordered: bool, user) -> int:
    qs = order.lines.filter(pk__in=list(line_ids))
    if ordered:
        return qs.filter(ordered_at__isnull=True).update(ordered_at=timezone.now(), ordered_by=user)
    return qs.update(ordered_at=None, ordered_by=None)
