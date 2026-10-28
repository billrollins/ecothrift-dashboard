"""Supply spend (owner, 2026-10-28): what was ordered, per vendor and per list, by week and by month.

Spend is a line's packs times its price, counted on the day the owner ticked it Ordered (store time). A line with
no price adds nothing and is counted as unpriced, so the total never pretends to be complete.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from ..models import SupplyOrderLine
from .schedule import monday

WEEKS = 8
MONTHS = 6


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _months_back(day: date, n: int) -> date:
    y, m = day.year, day.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def periods(by: str, today: date) -> list[date]:
    if by == 'month':
        first = _month_start(today)
        return [_months_back(first, n) for n in range(MONTHS - 1, -1, -1)]
    this = monday(today)
    return [this - timedelta(weeks=n) for n in range(WEEKS - 1, -1, -1)]


def _period_of(day: date, by: str) -> date:
    return _month_start(day) if by == 'month' else monday(day)


def _money(value: Decimal) -> str:
    return f'{value:.2f}'


def spend(by: str = 'week', now=None) -> dict:
    """{'by', 'periods': [iso], 'vendors': [{name, amounts: [..], total}], 'lists': [...], 'totals': [..], 'unpriced'}."""
    by = 'month' if by == 'month' else 'week'
    now = now or timezone.now()
    today = timezone.localdate(now)
    keys = periods(by, today)
    first = keys[0]
    lines = SupplyOrderLine.objects.filter(ordered_at__isnull=False).only(
        'vendor', 'list_name', 'packs', 'price', 'ordered_at',
    )
    index = {k: i for i, k in enumerate(keys)}
    vendors: dict[str, list[Decimal]] = defaultdict(lambda: [Decimal('0')] * len(keys))
    lists: dict[str, list[Decimal]] = defaultdict(lambda: [Decimal('0')] * len(keys))
    totals = [Decimal('0')] * len(keys)
    unpriced = 0
    for line in lines:
        day = timezone.localtime(line.ordered_at).date()
        if day < first:
            continue
        i = index.get(_period_of(day, by))
        if i is None:
            continue
        if line.price is None:
            unpriced += 1
            continue
        amount = line.price * line.packs
        vendors[line.vendor or 'No vendor'][i] += amount
        lists[line.list_name][i] += amount
        totals[i] += amount

    def rows(table):
        out = [{'name': name, 'amounts': [_money(a) for a in amounts], 'total': _money(sum(amounts, Decimal('0')))}
               for name, amounts in table.items()]
        return sorted(out, key=lambda r: -Decimal(r['total']))

    return {
        'by': by,
        'periods': [k.isoformat() for k in keys],
        'vendors': rows(vendors),
        'lists': rows(lists),
        'totals': [_money(t) for t in totals],
        'unpriced': unpriced,
    }


def summary(now=None) -> dict:
    """The Owner page's small number: this week and this month."""
    week = spend('week', now)
    month = spend('month', now)
    return {'this_week': week['totals'][-1], 'this_month': month['totals'][-1]}
