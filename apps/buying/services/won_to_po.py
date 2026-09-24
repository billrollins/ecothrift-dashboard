"""
Buying Phase 6: a won auction becomes a purchase order, and the truck gets a report card.

**Won -> PO.** Marking an auction won records the ``Outcome`` (hammer, fees, shipping,
total, and a snapshot of what we predicted) and creates an inventory ``PurchaseOrder``
in the normal inbound flow (status ``ordered``). The PO carries the auction's manifest:
the original B-Stock columns (``ManifestRow.raw_data``) as a CSV, saved through the same
upload service the Orders page uses (``upload_manifest_from_bytes``), so preprocessing sees
exactly what a hand upload gives it. Nobody uploads the manifest twice.

Nothing here touches POS. On processing it only adds a PO in ``ordered``, the way staff do.

**Report card** (``report_card``): the prediction next to what the PO's items actually did:
items made, sold, revenue so far, days to sell, sell-through. Across finished trucks the
ratio actual / predicted revenue (``calibration``) is the valuation's check.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import timedelta
from decimal import Decimal
from statistics import median
from typing import Any

from django.db import transaction
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone

from apps.buying.models import Auction, ManifestRow, Outcome, WatchlistEntry
from apps.buying.services.condition import (
    DAMAGED,
    LIKE_NEW,
    NEW,
    USED_FAIR,
    USED_GOOD,
    condition_group,
)
from apps.inventory.models import Item, PurchaseOrder, Vendor
from apps.inventory.services.intake_test_reset import upload_manifest_from_bytes
from apps.inventory.services.po_defaults import get_default_po_est_shrink

CENT = Decimal('0.01')
logger = logging.getLogger(__name__)

PO_CONDITION = {
    NEW: 'new',
    LIKE_NEW: 'like_new',
    USED_GOOD: 'good',
    USED_FAIR: 'fair',
    DAMAGED: 'salvage',
}


class WonToPoError(Exception):
    pass


def vendor_for(auction: Auction) -> Vendor:
    """The seller's vendor (the busiest one with that name), created when there is none."""
    name = (auction.marketplace.name if auction.marketplace_id else '').strip() or 'B-Stock'
    found = (
        Vendor.objects.filter(name__iexact=name)
        .annotate(n=Count('orders'))
        .order_by('-n', 'pk')
        .first()
    )
    if found:
        return found
    base = ''.join(ch for ch in name.upper() if ch.isalnum())[:5] or 'BSTK'
    code = base
    n = 2
    while Vendor.objects.filter(code=code).exists():
        code = f'{base}{n}'[:20]
        n += 1
    return Vendor.objects.create(name=name, code=code, vendor_type='liquidation')


def order_number_for(auction: Auction) -> str:
    base = f"BST-{(auction.lot_id or auction.external_id or str(auction.pk)).strip()}"[:90]
    number = base
    n = 2
    while PurchaseOrder.objects.filter(order_number=number).exists():
        number = f'{base}-{n}'
        n += 1
    return number


def _known_header_order(vendor: Vendor | None, headers: list[str]) -> list[str] | None:
    """
    The column order an earlier PO from this vendor used for the same columns. The Orders
    page matches its column template by a hash of the headers *in order*, and the stored
    manifest lines lost their order (JSON), so borrowing it keeps the template auto-match.
    """
    if vendor is None:
        return None
    wanted = sorted(headers)
    for order in (
        PurchaseOrder.objects.filter(vendor=vendor, manifest_headers__isnull=False)
        .order_by('-pk')
        .values_list('manifest_headers', flat=True)[:200]
    ):
        if isinstance(order, list) and sorted(str(h) for h in order) == wanted:
            return [str(h) for h in order]
    return None


def manifest_csv(auction: Auction, vendor: Vendor | None = None) -> bytes | None:
    """The auction's manifest as B-Stock sent it (original columns), or None without lines."""
    rows = list(ManifestRow.objects.filter(auction=auction).order_by('row_number').values_list('raw_data', flat=True))
    if not rows:
        return None
    headers: list[str] = []
    for raw in rows:
        for key in (raw or {}).keys():
            if key not in headers:
                headers.append(str(key))
    if not headers:
        return None
    headers = _known_header_order(vendor, headers) or headers
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(headers)
    for raw in rows:
        raw = raw or {}
        writer.writerow(['' if raw.get(h) is None else str(raw.get(h)) for h in headers])
    return out.getvalue().encode('utf-8')


def _manifest_units_and_retail(auction: Auction) -> tuple[int, Decimal]:
    units = 0
    retail = Decimal('0')
    for qty, unit in ManifestRow.objects.filter(auction=auction).values_list('quantity', 'retail_value'):
        q = qty if qty and qty > 0 else 1
        units += q
        if unit and unit > 0:
            retail += unit * q
    return units, retail


def prediction_snapshot(auction: Auction) -> dict[str, Any]:
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else {}
    return {
        'captured_at': timezone.now().isoformat(),
        'estimated_revenue': str(auction.estimated_revenue) if auction.estimated_revenue is not None else None,
        'est_profit': str(auction.est_profit) if auction.est_profit is not None else None,
        'estimated_total_cost': str(auction.estimated_total_cost) if auction.estimated_total_cost is not None else None,
        'price_target': str(auction.price_target) if auction.price_target is not None else None,
        'need_score': auction.need_score,
        'priority': auction.priority,
        'days_to_sell': summary.get('days_to_sell'),
        'matched_retail_pct': summary.get('matched_retail_pct'),
        'units': summary.get('units'),
    }


def mark_won(
    auction: Auction,
    *,
    hammer_price: Decimal,
    user,
    fees: Decimal | None = None,
    shipping: Decimal | None = None,
) -> PurchaseOrder:
    """Record the win and create the PO with its manifest. Refuses a second PO."""
    if auction.purchase_order_id:
        raise WonToPoError(f'This auction is already PO {auction.purchase_order.order_number}.')
    if hammer_price is None or hammer_price <= 0:
        raise WonToPoError('Enter the winning price.')
    mp = auction.marketplace
    if fees is None:
        rate = (mp.default_fee_rate if mp else None) or Decimal('0')
        fees = auction.fees_override if auction.fees_override is not None else (hammer_price * rate).quantize(CENT)
    if shipping is None:
        shipping = auction.estimated_shipping or Decimal('0')
    total = (hammer_price + fees + shipping).quantize(CENT)
    units, manifest_retail = _manifest_units_and_retail(auction)
    retail = manifest_retail if manifest_retail > 0 else (auction.total_retail_value or None)

    with transaction.atomic():
        auction = Auction.objects.select_for_update().get(pk=auction.pk)
        if auction.purchase_order_id:
            raise WonToPoError('This auction already has a PO.')
        # The same defaults the Orders page sets (PurchaseOrderViewSet.perform_create).
        po = PurchaseOrder.objects.create(
            created_by=user,
            est_shrink=get_default_po_est_shrink(),
            vendor=vendor_for(auction),
            order_number=order_number_for(auction),
            status='ordered',
            ordered_date=timezone.localdate(),
            purchase_cost=hammer_price.quantize(CENT),
            fees=fees.quantize(CENT),
            shipping_cost=shipping.quantize(CENT),
            total_cost=total,
            retail_value=retail,
            condition=PO_CONDITION.get(condition_group(auction.condition_summary), 'mixed'),
            description=(auction.title or '')[:500],
            item_count=units,
            pallet_count=auction.pallet_count,
            notes=f'Won on B-Stock: {auction.url}'.strip() if auction.url else 'Won on B-Stock.',
        )
        Outcome.objects.update_or_create(
            auction=auction,
            defaults={
                'hammer_price': hammer_price.quantize(CENT),
                'fees': fees.quantize(CENT),
                'shipping_cost': shipping.quantize(CENT),
                'total_cost': total,
                'win': True,
                'margin_estimate': (
                    ((auction.estimated_revenue or Decimal('0')) - total).quantize(CENT)
                    if auction.estimated_revenue is not None else None
                ),
                'captured_at': timezone.now(),
                'prediction': prediction_snapshot(auction),
            },
        )
        auction.purchase_order = po
        auction.save(update_fields=['purchase_order'])
        WatchlistEntry.objects.filter(auction=auction).update(status='won')

    manifest_note = 'No manifest lines to carry over; upload the manifest on the order.'
    raw_csv = manifest_csv(auction, po.vendor)
    if raw_csv:
        # Outside the transaction: the file goes to storage, as a hand upload would. The PO
        # stays either way; a failed file is reported so staff can upload it by hand.
        try:
            upload_manifest_from_bytes(
                po,
                filename=f'bstock-{(auction.lot_id or auction.external_id or auction.pk)}.csv',
                raw=raw_csv,
                uploaded_by=user,
            )
            manifest_note = ''
        except Exception as exc:  # storage trouble: keep the PO, say what happened
            logger.exception('mark_won: manifest upload failed for auction %s', auction.pk)
            manifest_note = f'The PO is made, but its manifest did not save ({exc}); upload it on the order.'
    po.won_manifest_note = manifest_note
    return po


def mark_lost(auction: Auction, *, hammer_price: Decimal | None = None) -> Outcome:
    """Record a loss (and the closing price when known), for price-target checks."""
    outcome, _ = Outcome.objects.update_or_create(
        auction=auction,
        defaults={
            'win': False,
            'hammer_price': hammer_price.quantize(CENT) if hammer_price else None,
            'captured_at': timezone.now(),
            'prediction': prediction_snapshot(auction),
        },
    )
    WatchlistEntry.objects.filter(auction=auction).update(status='lost')
    return outcome


# ── Report card ───────────────────────────────────────────────────────────────

def report_card(auction: Auction) -> dict[str, Any] | None:
    """Predicted (at the win) vs actual (the PO's items so far); None without a PO."""
    po = auction.purchase_order
    if po is None:
        return None
    outcome = getattr(auction, 'outcome', None)
    predicted = (outcome.prediction if outcome and isinstance(outcome.prediction, dict) else {}) or {}
    sold = Q(sold_at__isnull=False)
    agg = Item.objects.filter(purchase_order=po).aggregate(
        items=Count('pk'),
        sold=Count('pk', filter=sold),
        on_shelf=Count('pk', filter=Q(status='on_shelf')),
        revenue=Sum('sold_for', filter=sold),
        shelf_value=Sum('price', filter=Q(status='on_shelf')),
        days=Avg(
            ExpressionWrapper(F('sold_at') - F('checked_in_at'), output_field=DurationField()),
            filter=sold & Q(checked_in_at__isnull=False),
        ),
    )
    revenue = agg['revenue'] or Decimal('0')
    cost = po.total_cost or (outcome.total_cost if outcome else None) or Decimal('0')
    predicted_revenue = Decimal(predicted['estimated_revenue']) if predicted.get('estimated_revenue') else None
    days = agg['days']
    return {
        'purchase_order_id': po.pk,
        'order_number': po.order_number,
        'po_status': po.status,
        'predicted': {
            'revenue': predicted.get('estimated_revenue'),
            'profit': predicted.get('est_profit'),
            'days_to_sell': predicted.get('days_to_sell'),
            'units': predicted.get('units'),
        },
        'actual': {
            'items': agg['items'],
            'sold': agg['sold'],
            'on_shelf': agg['on_shelf'],
            'revenue': str(revenue.quantize(CENT)),
            'shelf_value': str((agg['shelf_value'] or Decimal('0')).quantize(CENT)),
            'profit_so_far': str((revenue - cost).quantize(CENT)),
            'avg_days_to_sell': max(int(days / timedelta(days=1)), 0) if days is not None else None,
            'sell_through_pct': round(agg['sold'] / agg['items'] * 100, 1) if agg['items'] else None,
        },
        'revenue_vs_predicted_pct': (
            round(float(revenue / predicted_revenue * 100), 1) if predicted_revenue and predicted_revenue > 0 else None
        ),
        'cost': str(cost),
    }


def calibration(*, min_age_days: int = 90, min_sold_pct: float = 50.0) -> dict[str, Any]:
    """
    Across won trucks old enough to judge (PO ordered ``min_age_days`` ago and at least
    ``min_sold_pct`` of items sold): actual / predicted revenue, the valuation's check.
    """
    cutoff = timezone.localdate() - timedelta(days=min_age_days)
    ratios = []
    for auction in Auction.objects.filter(
        purchase_order__isnull=False, purchase_order__ordered_date__lte=cutoff,
    ).select_related('purchase_order', 'outcome'):
        card = report_card(auction)
        if not card or card['revenue_vs_predicted_pct'] is None:
            continue
        if (card['actual']['sell_through_pct'] or 0) < min_sold_pct:
            continue
        ratios.append(card['revenue_vs_predicted_pct'] / 100)
    return {
        'trucks': len(ratios),
        'median_ratio': round(median(ratios), 3) if ratios else None,
    }


CALIBRATION_KEY = 'buying_revenue_calibration'
MIN_TRUCKS = 5
CLAMP = (Decimal('0.7'), Decimal('1.3'))


def refresh_calibration() -> dict[str, Any]:
    """
    Daily: the report cards' actual / predicted revenue becomes the valuation's multiplier
    once ``MIN_TRUCKS`` finished trucks back it (kept between 0.7 and 1.3). Before that the
    setting is left alone (valuation uses 1.0 when it is unset).
    """
    from apps.core.models import AppSetting

    result = calibration()
    if result['trucks'] >= MIN_TRUCKS and result['median_ratio'] is not None:
        factor = min(max(Decimal(str(result['median_ratio'])), CLAMP[0]), CLAMP[1])
        AppSetting.objects.update_or_create(key=CALIBRATION_KEY, defaults={'value': str(factor)})
        result['applied'] = str(factor)
    else:
        result['applied'] = None
    return result


JUDGE_AGE_DAYS = 90
JUDGE_SOLD_PCT = 50.0


def report_cards(*, limit: int = 100) -> dict[str, Any]:
    """
    Every won truck with its report card, newest first, and the valuation check: how many
    trucks can be judged (``JUDGE_AGE_DAYS`` old and ``JUDGE_SOLD_PCT`` sold), what they
    say, and the multiplier in use.
    """
    from apps.core.models import AppSetting

    today = timezone.localdate()
    rows = []
    won = (
        Auction.objects.filter(purchase_order__isnull=False)
        .select_related('purchase_order', 'outcome', 'marketplace')
        .order_by('-purchase_order__ordered_date', '-pk')
    )
    for auction in won[:limit]:
        card = report_card(auction)
        if card is None:
            continue
        po = auction.purchase_order
        outcome = getattr(auction, 'outcome', None)
        age = (today - po.ordered_date).days if po.ordered_date else None
        sold_pct = card['actual']['sell_through_pct'] or 0
        if age is not None and age >= JUDGE_AGE_DAYS and sold_pct >= JUDGE_SOLD_PCT and card['revenue_vs_predicted_pct'] is not None:
            stage = 'judged'
        elif card['actual']['sold']:
            stage = 'selling'
        else:
            stage = 'not_selling_yet'
        rows.append({
            'auction_id': auction.pk,
            'title': auction.title,
            'marketplace': auction.marketplace.name if auction.marketplace_id else '',
            'ordered_date': po.ordered_date.isoformat() if po.ordered_date else None,
            'age_days': age,
            'hammer_price': str(outcome.hammer_price) if outcome and outcome.hammer_price is not None else None,
            'stage': stage,
            'card': card,
        })
    check = calibration(min_age_days=JUDGE_AGE_DAYS, min_sold_pct=JUDGE_SOLD_PCT)
    applied = AppSetting.objects.filter(key=CALIBRATION_KEY).values_list('value', flat=True).first()
    since = timezone.now() - timedelta(days=90)
    return {
        'results': rows,
        'calibration': {
            **check,
            'applied': str(applied) if applied is not None else None,
            'min_trucks': MIN_TRUCKS,
            'min_age_days': JUDGE_AGE_DAYS,
            'min_sold_pct': JUDGE_SOLD_PCT,
        },
        'last_90_days': {
            'won': Outcome.objects.filter(win=True, captured_at__gte=since).count(),
            'lost': Outcome.objects.filter(win=False, captured_at__gte=since).count(),
        },
    }
