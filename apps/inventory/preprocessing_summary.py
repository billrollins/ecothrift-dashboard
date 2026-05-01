"""Fast preprocessing review aggregates (avoid O(n) Python scans per GET)."""
from __future__ import annotations

from decimal import Decimal

from django.db.models import (
    Case,
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    IntegerField,
    Q,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Greatest


def _ideal_denominator_for_order(order) -> Decimal | None:
    rv = order.retail_value
    tc = order.total_cost
    es = order.est_shrink if order.est_shrink is not None else Decimal('0.15')
    if rv is None or tc is None or rv <= 0 or tc <= 0:
        return None
    if es < 0 or es >= Decimal('1'):
        return None
    return rv * (Decimal('1') - es)


def summarize_preprocessing_rows_aggregate(order, rows_qs, *, staging_row: bool = True) -> dict:
    """Mirror summarize_preprocessing_rows output using DB aggregates + low-confidence count.

    ``staging_row=False`` for :class:`~apps.inventory.models.ManifestRow` querysets (no triple-layer
    note columns — uses ``notes`` only).
    """
    total_paid = order.total_cost or Decimal('0.00')

    qty_eff = Greatest(Coalesce(F('quantity'), Value(1)), Value(1), output_field=IntegerField())

    price_coalesced = Coalesce(
        F('final_price'),
        F('proposed_price'),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )
    line_set = ExpressionWrapper(
        price_coalesced * qty_eff,
        output_field=DecimalField(max_digits=18, decimal_places=2),
    )
    set_agg = rows_qs.aggregate(
        total_set=Sum(
            Case(
                When(Q(final_price__isnull=True) & Q(proposed_price__isnull=True), then=Value(Decimal('0'))),
                default=line_set,
                output_field=DecimalField(max_digits=20, decimal_places=2),
            ),
        ),
        total_units=Sum(qty_eff),
        missing_price=Count(
            'pk',
            filter=Q(final_price__isnull=True, proposed_price__isnull=True),
        ),
        total_rows=Count('pk'),
    )

    denom = _ideal_denominator_for_order(order)
    total_ideal = Decimal('0.00')
    if denom is not None and denom > 0:
        tc = order.total_cost
        ideal_unit = ExpressionWrapper(
            (F('unit_retail') / Value(denom)) * Value(tc) * Value(Decimal('2')),
            output_field=DecimalField(max_digits=18, decimal_places=6),
        )
        line_ideal = ExpressionWrapper(
            ideal_unit * qty_eff,
            output_field=DecimalField(max_digits=22, decimal_places=6),
        )
        ideal_agg = rows_qs.aggregate(
            total_ideal=Sum(
                Case(
                    When(unit_retail__isnull=True, then=Value(Decimal('0'))),
                    default=line_ideal,
                    output_field=DecimalField(max_digits=24, decimal_places=6),
                ),
            ),
        )
        raw_ideal = ideal_agg.get('total_ideal')
        if raw_ideal is not None:
            total_ideal = Decimal(str(raw_ideal)).quantize(Decimal('0.01'))

    raw_set = set_agg.get('total_set')
    total_set = Decimal(str(raw_set)) if raw_set is not None else Decimal('0.00')
    total_set = total_set.quantize(Decimal('0.01'))

    total_units = int(set_agg.get('total_units') or 0)
    missing_price = int(set_agg.get('missing_price') or 0)
    total_rows = int(set_agg.get('total_rows') or 0)

    if staging_row:
        low_confidence = rows_qs.filter(final_notes__icontains='low confidence').count()
    else:
        low_confidence = rows_qs.filter(notes__icontains='low confidence').count()

    delta = None
    if total_ideal > 0:
        delta = round(float((total_set - total_ideal) / total_ideal * 100), 1)

    return {
        'total_paid': str(total_paid),
        'total_ideal_price': str(total_ideal),
        'total_set_prices': str(total_set),
        'ideal_delta_pct': delta,
        'total_rows': total_rows,
        'total_units': total_units,
        'missing_price': missing_price,
        'low_confidence': low_confidence,
    }


def preprocessing_status_counts_aggregate(order, prep_rows_qs):
    """Counts for preprocessing-status when staging is active (no Python list of all rows)."""
    total_rows = prep_rows_qs.count()
    cleaned_rows = prep_rows_qs.exclude(ai_title='').count()
    final_rows = prep_rows_qs.filter(pricing_stage='final').count()
    missing_price = prep_rows_qs.filter(final_price__isnull=True, proposed_price__isnull=True).count()

    agg = summarize_preprocessing_rows_aggregate(order, prep_rows_qs)
    total_units = agg['total_units']
    total_paid = Decimal(agg['total_paid'])
    total_ideal = Decimal(agg['total_ideal_price'])
    total_set = Decimal(agg['total_set_prices'])
    delta = agg['ideal_delta_pct']

    return {
        'total_rows': total_rows,
        'cleaned_rows': cleaned_rows,
        'final_rows': final_rows,
        'missing_price': missing_price,
        'total_units': total_units,
        'total_paid': total_paid,
        'total_ideal': total_ideal,
        'total_set': total_set,
        'ideal_delta_pct': delta,
    }


def manifest_status_counts_aggregate(order, manifest_qs):
    """Counts for preprocessing-status when viewing canonical ManifestRow (no staging)."""
    total_rows = manifest_qs.count()
    # ManifestRow has no ai_title; prior code used getattr(...,'') — treat nonempty title as cleaned.
    cleaned_rows = manifest_qs.exclude(title='').count()
    final_rows = manifest_qs.filter(pricing_stage='final').count()
    missing_price = manifest_qs.filter(final_price__isnull=True, proposed_price__isnull=True).count()

    agg = summarize_preprocessing_rows_aggregate(order, manifest_qs, staging_row=False)
    total_paid = Decimal(agg['total_paid'])
    return {
        'total_rows': total_rows,
        'cleaned_rows': cleaned_rows,
        'final_rows': final_rows,
        'missing_price': missing_price,
        'total_units': agg['total_units'],
        'total_paid': total_paid,
        'total_ideal': Decimal(agg['total_ideal_price']),
        'total_set': Decimal(agg['total_set_prices']),
        'ideal_delta_pct': agg['ideal_delta_pct'],
    }
