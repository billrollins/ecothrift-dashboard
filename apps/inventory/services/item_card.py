"""
The item card: everything about one item for every department, in one payload (universal Item modal).

GET /api/inventory/items/<id>/card/          the full card (header, overview, where, money, restoration, journey)
GET /api/inventory/items/<id>/card/?lite=1   the hover card: header and key facts only, a handful of queries

Read-only. Cost is in it because the item API already shows cost to all staff.
"""
from __future__ import annotations

from decimal import Decimal

from apps.inventory.models import Item, ItemNote, ItemScanHistory, RestorationJob

JOURNEY_LIMIT = 60


def _money(v) -> str | None:
    return str(Decimal(v).quantize(Decimal('0.01'))) if v is not None else None


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _who(user) -> str:
    if not user:
        return ''
    name = (getattr(user, 'full_name', '') or '').strip()
    return name or getattr(user, 'email', '') or getattr(user, 'username', '') or ''


def _url(field) -> str | None:
    try:
        return field.url if field else None
    except Exception:  # noqa: BLE001 - storage without a URL (tests)
        return None


def _photos(item: Item) -> list[str]:
    """The item's own Social Studio photos first, then the product photo."""
    out: list[str] = []
    try:
        from django.core.files.storage import default_storage

        from apps.marketing.models import SocialPhoto

        rows = (SocialPhoto.objects.filter(item=item, is_archived=False)
                .order_by('-uploaded_at').values_list('thumbnail', 'image')[:6])
        for thumb, image in rows:
            if image or thumb:
                try:
                    out.append(default_storage.url(image or thumb))
                except Exception:  # noqa: BLE001 - storage without a URL (tests)
                    pass
    except Exception:  # noqa: BLE001 - photos are a nice-to-have on the card
        pass
    product = item.product
    if product is not None:
        url = _url(product.photo) or _url(product.photo_thumb)
        if url and url not in out:
            out.append(url)
    return out


def _restoration_job(item: Item) -> RestorationJob | None:
    if not item.check_in_id:
        return None
    return (RestorationJob.objects.select_related('bench_owner', 'returned_by', 'dispositioned_by')
            .filter(item_check_in_id=item.check_in_id).first())


def _restoration(job: RestorationJob | None, *, lite: bool) -> dict | None:
    if job is None:
        return None
    out = {
        'job_id': job.id,
        'stage': job.stage,
        'stage_label': job.get_stage_display(),
        'scale': job.scale,
        'starting_grade': job.starting_grade,
        'final_grade': job.final_grade,
        'bench_owner': _who(job.bench_owner),
        'intended_destination': job.get_intended_destination_display() if job.intended_destination else '',
        'bench_disposition': job.get_bench_disposition_display() if job.bench_disposition else '',
    }
    if lite:
        return out
    actions = list(job.actions.order_by('started_at', 'id').values('grade', 'category', 'description', 'seconds'))
    out.update({
        'grade_values': job.grade_values or {},
        'queue_note': job.queue_note,
        'pending_reason': job.pending_reason,
        'disposition_notes': job.disposition_notes,
        'return_reason': job.return_reason,
        'return_notes': job.return_notes,
        'active_seconds': job.active_seconds,
        'spent_parts_cost': _money(job.spent_parts_cost),
        'value_added': _money(job.value_added),
        'actions': actions,
        'sent_at': _iso(job.sent_at),
        'bench_started_at': _iso(job.bench_started_at),
        'dispositioned_at': _iso(job.dispositioned_at),
        'returned_at': _iso(job.returned_at),
    })
    return out


def _journey(item: Item, job: RestorationJob | None) -> list[dict]:
    """Every dated thing that happened to the item, oldest first: order, check-in, restoration, tag, sales, counts."""
    ev: list[dict] = []

    def add(at, kind: str, label: str, detail: str = '', who: str = ''):
        if at is not None:
            ev.append({'at': at, 'kind': kind, 'label': label, 'detail': detail, 'who': who})

    po = item.purchase_order
    if po is not None:
        from datetime import datetime, time

        from django.utils import timezone

        def day(d):
            return timezone.make_aware(datetime.combine(d, time(12))) if d else None

        vendor = po.vendor_name_cache or (po.vendor.name if po.vendor_id else '')
        add(day(po.ordered_date), 'order', f'Ordered on {po.order_number}', vendor)
        add(day(po.delivered_date), 'order', 'Order delivered', po.order_number)
    if item.checked_in_at:
        add(item.checked_in_at, 'check_in', 'Checked in at Processing', '', _who(item.checked_in_by))
    else:  # added outside a check-in (Find item > Add item, consignment): the row itself is the start
        add(item.created_at, 'created', 'Item created', item.get_source_display())
    if job is not None:
        add(job.created_at, 'restoration', 'Sent to Restoration', job.queue_note, _who(job.created_by))
        add(job.bench_started_at, 'restoration', 'On the bench', '', _who(job.bench_owner))
        if job.dispositioned_at:
            grade = ' · '.join(x for x in (job.final_grade, job.get_bench_disposition_display() if job.bench_disposition else '') if x)
            add(job.dispositioned_at, 'restoration', 'Restoration done', grade, _who(job.dispositioned_by))
        if job.returned_at:
            add(job.returned_at, 'restoration', 'Back to Processing', job.return_reason, _who(job.returned_by))
    add(item.label_printed_at, 'tag', 'Tag printed', f'${_money(item.price)}' if item.price else '')

    skip_types = {'created'}  # the item row itself says this
    for h in item.history_events.select_related('created_by').order_by('-created_at')[:JOURNEY_LIMIT]:
        if h.event_type in skip_types:
            continue
        change = f'{h.old_value} → {h.new_value}' if (h.old_value or h.new_value) else ''
        detail = ' · '.join(x for x in (change, h.note) if x)
        add(h.created_at, 'history', h.get_event_type_display(), detail[:200], _who(h.created_by))

    from apps.pos.models import CartLine

    for line in (CartLine.objects.filter(item=item, cart__status='completed')
                 .select_related('cart__cashier', 'cart__receipt').order_by('-cart__completed_at')[:10]):
        cart = line.cart
        receipt = getattr(cart, 'receipt', None)
        detail = ' · '.join(x for x in (f'${_money(line.line_total)}', receipt.receipt_number if receipt else '') if x)
        add(cart.completed_at, 'sale', 'Sold at the register' if line.line_total >= 0 else 'Returned at the register',
            detail, _who(cart.cashier))

    for note in (ItemNote.objects.filter(item=item, status=ItemNote.STATUS_ACTIVE)
                 .select_related('author').order_by('-occurred_at')[:20]):
        add(note.occurred_at, 'note', f'Note ({note.get_surface_display()})', note.body[:200], _who(note.author))

    from apps.stocktake.models import CountScan

    for scan in (CountScan.objects.filter(item=item, removed_at__isnull=True)
                 .select_related('count').order_by('-scanned_at')[:10]):
        add(scan.scanned_at, 'count', f'Counted in {scan.count.name}', scan.get_result_display())

    ev.sort(key=lambda e: e['at'])
    for e in ev:
        e['at'] = _iso(e['at'])
    return ev[-JOURNEY_LIMIT:]


def item_card(item_id: int, *, lite: bool = False) -> dict | None:
    item = (Item.objects.select_related(
        'product', 'product__category', 'purchase_order', 'purchase_order__vendor', 'manifest_row',
        'check_in', 'checked_in_by', 'parent_item', 'pallet',
    ).filter(pk=item_id).first())
    if item is None:
        return None
    from apps.inventory.serializers import item_listing_category
    from apps.inventory.services.tag_retail import tag_retail

    product = item.product
    po = item.purchase_order
    job = _restoration_job(item)
    last_scan = item.scans.order_by('-scanned_at').values('scanned_at', 'source').first()
    tag_r = tag_retail(item)
    photos = _photos(item)
    card = {
        'id': item.id,
        'sku': item.sku,
        'title': product.title if product else '',
        'brand': product.brand if product else '',
        'model': product.model if product else '',
        'product_id': product.id if product else None,
        'product_number': product.product_number if product else '',
        'category': item_listing_category(item),
        'photo_url': photos[0] if photos else None,
        'status': item.status,
        'status_label': item.get_status_display(),
        'condition': item.condition,
        'condition_label': item.get_condition_display(),
        'location': item.location,
        'price': _money(item.price),
        'retail': _money(item.retail),
        'tag_retail': _money(tag_r),
        'specifications': {k: v for k, v in (item.specifications or {}).items() if v not in (None, '', [], {})},
        'notes': item.notes,
        'order': {'id': po.id, 'order_number': po.order_number,
                  'vendor': po.vendor_name_cache or (po.vendor.name if po.vendor_id else '')} if po else None,
        'checked_in_at': _iso(item.checked_in_at),
        'checked_in_by': _who(item.checked_in_by),
        'sold_at': _iso(item.sold_at),
        'sold_for': _money(item.sold_for),
        'last_scan_at': _iso(last_scan['scanned_at']) if last_scan else None,
        'restoration': _restoration(job, lite=True),
    }
    if lite:
        return card
    mr = item.manifest_row
    card.update({
        'photos': photos,
        'upc': product.primary_upc if product else '',
        'source': item.source,
        'source_label': item.get_source_display(),
        'retail_check': item.retail_check,
        'retail_source': item.retail_source,
        'cost': _money(item.cost),
        'sold_net': _money(item.sold_net),
        'thriftbucks_at_sale': _money(item.thriftbucks_at_sale),
        'sale_channel': item.sale_channel,
        'sale_channel_label': item.get_sale_channel_display() if item.sale_channel else '',
        'listed_at': _iso(item.listed_at),
        'label_printed_at': _iso(item.label_printed_at),
        'created_at': _iso(item.created_at),
        'updated_at': _iso(item.updated_at),
        'manifest_line': {'id': mr.id, 'row_number': mr.row_number, 'title': mr.title,
                          'unit_retail': _money(mr.unit_retail)} if mr else None,
        'check_in_id': item.check_in_id,
        'pallet': (item.pallet.code or f'Pallet {item.pallet.number}') if item.pallet_id else '',
        'parent_item': {'id': item.parent_item.id, 'sku': item.parent_item.sku} if item.parent_item_id else None,
        'dispute': {'type': item.get_dispute_type_display(), 'pct_loss': item.dispute_pct_loss,
                    'description': item.dispute_description} if item.dispute_type else None,
        'last_scan_source': (dict(ItemScanHistory.SOURCE_CHOICES).get(last_scan['source'], last_scan['source'])
                             if last_scan else ''),
        'scan_count': item.scans.count(),
        'restoration': _restoration(job, lite=False),
        'journey': _journey(item, job),
    })
    return card

