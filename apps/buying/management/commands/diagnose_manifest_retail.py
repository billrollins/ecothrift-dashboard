"""Read-only diagnostic: is ``ManifestRow.retail_value`` stored per-unit or per-line extended?

Compares per-auction SUM(retail_value) and SUM(qty * retail_value) to the listing-level
``Auction.total_retail_value`` (from B-Stock search). Flags rows likely stored as
extended retail (UI double-counts when multiplying by qty).

Invariant (target): ``ManifestRow.retail_value`` is **per-unit MSRP**.

Usage::

    python manage.py diagnose_manifest_retail
    python manage.py diagnose_manifest_retail --database production
    python manage.py diagnose_manifest_retail --auction 1234
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, F, Sum, Value
from django.db.models.functions import Coalesce

from apps.buying.models import Auction, ManifestRow


def _ratio(numer: Decimal | None, denom: Decimal | None) -> Decimal | None:
    if numer is None or denom is None or denom == 0:
        return None
    return (numer / denom).quantize(Decimal('0.01'))


def _classify(
    sum_retail: Decimal,
    sum_ext: Decimal,
    listed_retail: Decimal | None,
) -> str:
    """Return one of: UNIT_OK | EXTENDED_LIKELY | NO_LISTING | AMBIGUOUS."""
    if listed_retail is None or listed_retail <= 0:
        return 'NO_LISTING'
    if listed_retail <= 0:
        return 'NO_LISTING'
    unit_ratio = sum_ext / listed_retail if listed_retail else None
    ext_ratio = sum_retail / listed_retail if listed_retail else None
    near_one = lambda r: r is not None and Decimal('0.80') <= r <= Decimal('1.25')
    if near_one(unit_ratio):
        return 'UNIT_OK'
    if near_one(ext_ratio) and unit_ratio is not None and unit_ratio >= Decimal('1.50'):
        return 'EXTENDED_LIKELY'
    return 'AMBIGUOUS'


class Command(BaseCommand):
    help = (
        'Diagnose ManifestRow.retail_value invariant (per-unit vs extended). '
        'Read-only. No writes.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--database',
            default='default',
            help='Django DB alias (default: default).',
        )
        parser.add_argument(
            '--auction',
            type=int,
            default=None,
            help='Single auction id to inspect (otherwise scans all manifests).',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Cap rows printed (0 = unlimited).',
        )
        parser.add_argument(
            '--only',
            default='',
            help='Filter output to a flag: UNIT_OK | EXTENDED_LIKELY | NO_LISTING | AMBIGUOUS.',
        )

    def handle(self, *args, **options):
        db = options['database']
        if db not in settings.DATABASES:
            raise CommandError(
                f'Unknown database alias {db!r}. Configure it in settings or use "default".'
            )

        auction_id = options.get('auction')
        limit = int(options.get('limit') or 0)
        only = (options.get('only') or '').strip().upper()

        rows_qs = ManifestRow.objects.using(db)
        if auction_id:
            rows_qs = rows_qs.filter(auction_id=auction_id)

        agg = (
            rows_qs.values('auction_id')
            .annotate(
                n_rows=Count('id'),
                total_units=Coalesce(Sum(Coalesce(F('quantity'), Value(1))), Value(0)),
                sum_retail=Coalesce(Sum('retail_value'), Value(Decimal('0'))),
                sum_ext=Coalesce(
                    Sum(Coalesce(F('quantity'), Value(1)) * F('retail_value')),
                    Value(Decimal('0')),
                ),
            )
            .order_by('auction_id')
        )

        auction_ids = [a['auction_id'] for a in agg]
        auctions_by_id = {
            a.id: a
            for a in Auction.objects.using(db).filter(id__in=auction_ids)
        }

        counts: dict[str, int] = {
            'UNIT_OK': 0,
            'EXTENDED_LIKELY': 0,
            'NO_LISTING': 0,
            'AMBIGUOUS': 0,
        }

        header = (
            f"{'auction_id':>10}  {'rows':>5}  {'units':>6}  "
            f"{'listed$':>11}  {'sum_retail$':>12}  {'sum_ext$':>12}  "
            f"{'ext/listed':>10}  flag"
        )
        self.stdout.write(header)
        self.stdout.write('-' * len(header))

        printed = 0
        for r in agg:
            aid = r['auction_id']
            a = auctions_by_id.get(aid)
            listed = a.total_retail_value if a and a.total_retail_value is not None else None
            sum_retail = r['sum_retail'] or Decimal('0')
            sum_ext = r['sum_ext'] or Decimal('0')
            flag = _classify(sum_retail, sum_ext, listed)
            counts[flag] = counts.get(flag, 0) + 1
            if only and flag != only:
                continue
            if limit and printed >= limit:
                continue
            ratio = _ratio(sum_ext, listed)
            listed_s = f"{listed:,.2f}" if listed is not None else '-'
            ratio_s = f"{ratio}" if ratio is not None else '-'
            line = (
                f"{aid:>10}  {r['n_rows']:>5}  {r['total_units']:>6}  "
                f"{listed_s:>11}  {sum_retail:>12,.2f}  {sum_ext:>12,.2f}  "
                f"{ratio_s:>10}  {flag}"
            )
            self.stdout.write(line)
            printed += 1

        self.stdout.write('')
        self.stdout.write(self.style.NOTICE(f"totals by flag: {counts}"))
        self.stdout.write(
            self.style.NOTICE(
                f"DB alias: {db}; auctions inspected: {len(auction_ids)}"
            )
        )
