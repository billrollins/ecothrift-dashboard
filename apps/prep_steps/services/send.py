"""Send: hand a prepped truck to Processing for real (Dash Update #233).

Owner 2026-11-25: "WTF would it not send to processing ... normal. I need Prep A to WORK."

Prep Truck does not run a second pipeline. Send writes each line's values into the truck's staging rows
(``PreprocessingRow``, the same rows the old Preprocessing page fills), writes the truck's manifest rows as the old
standardize step does, and then calls the one existing finalize, ``finalize_preprocessing_to_bookmarks``. After that the truck is a normal finalized truck: Processing opens it,
builds its rows and works exactly as it does after old Preprocessing.

What is not here yet (follow-ups on #233): sending again after a change, and an Undo send button. Until then a truck
is sent once; the old "undo finalize" on the order still works while nothing is checked in.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.prep_steps.models import PrepLine, PrepRun
from apps.prep_steps.services import rules as R

logger = logging.getLogger(__name__)

NO_PRICE_NOTE = 'Prep Truck: no retail and no price on this line. Set the price at check-in.'
RULE_PRICE_NOTE = 'Prep Truck: no price was set; the truck rule priced it.'


class SendRefused(Exception):
    """Send cannot run; the message is for the person."""


def _condition(raw: str) -> str:
    """The seller's condition words as one of our condition codes ('' = leave it to the manifest's own)."""
    s = (raw or '').strip().lower().replace('-', ' ').replace('_', ' ')
    if not s:
        return ''
    if 'like new' in s or 'open box' in s:
        return 'like_new'
    if 'very good' in s:
        return 'very_good'
    if 'salvage' in s or 'parts' in s or 'damaged' in s:
        return 'salvage'
    if 'fair' in s:
        return 'fair'
    if 'good' in s:
        return 'good'
    if s == 'new' or s.startswith('new '):
        return 'new'
    return ''


def _title(x: PrepLine) -> str:
    """The line's title with the pack standard written in it (processing-night-1124.md)."""
    title = (x.title or x.src_title or '').strip()
    pack = R.pack_words(x.unit_count, x.unit_name, x.pack_units)
    if pack and pack.lower() not in title.lower():
        title = f'{title}, {pack}' if title else pack
    return title[:300] or f'Manifest line {x.row_number}'


def _price(x: PrepLine, share: Decimal) -> tuple[Decimal, str, str]:
    """(price, pricing stage, note). Every line gets a price so the hand-off never stops on one line."""
    reason = str((x.reasons or {}).get('price') or '')
    if x.price is not None:
        return x.price, 'final', reason
    retail = x.retail if x.retail is not None else x.src_retail
    if retail:
        return R.house_round(Decimal(retail) * share, Decimal(retail)), 'draft', RULE_PRICE_NOTE
    return Decimal('0.00'), 'draft', NO_PRICE_NOTE


def why_not(run: PrepRun) -> str:
    """'' when this truck can be sent now, else the reason in plain words."""
    order = run.purchase_order
    if order.finalized_at:
        return 'This truck was already sent to Processing.'
    if order.items.filter(status__in=('sold', 'scrapped', 'lost')).exists():
        return 'Some items on this truck are already sold, scrapped or lost, so it cannot be sent.'
    from apps.inventory.models import PreprocessingRow

    lines = list(run.lines.values_list('preprocessing_row_id', flat=True))
    if not lines:
        return 'There is nothing to send. Press Load again.'
    staged = set(PreprocessingRow.objects.filter(purchase_order=order).values_list('pk', flat=True))
    if None in lines or set(lines) != staged:
        return 'The manifest changed since this truck was loaded. Press Load again, then Send.'
    return ''


def status(run: PrepRun) -> dict:
    order = run.purchase_order
    return {
        'sent_at': order.finalized_at.isoformat() if order.finalized_at else None,
        'why_not': '' if order.finalized_at else why_not(run),
    }


def _standard_rows(order) -> dict[int, dict]:
    """What the manifest's own columns say per row (identifiers, the seller's taxonomy, tracking, specifications),
    read the way old Preprocessing reads them. Empty when the columns cannot be read; Send still works."""
    try:
        from apps.inventory.views import build_normalized_manifest_rows_from_staging

        prepared = build_normalized_manifest_rows_from_staging(order)
        if prepared.get('error'):
            return {}
        return {int(r.get('row_number') or 0): r for r in prepared.get('normalized_rows') or []}
    except Exception:  # noqa: BLE001 - the standard columns are a bonus, never a reason to stop the send
        logger.exception('prep_steps send: could not read the standard columns of order %s', order.pk)
        return {}


MANIFEST_FIELDS = ('quantity', 'title', 'brand', 'model', 'category', 'condition', 'unit_retail', 'proposed_price',
                   'final_price', 'pricing_stage', 'pricing_notes', 'identifiers', 'taxonomy', 'search_tags',
                   'specifications', 'tracking', 'notes')


def _write_manifest_rows(order, rows) -> None:
    """The truck's manifest rows, one per staging row, as old Preprocessing's standardize step leaves them. Processing
    works from these; a truck sent without them shows as an old "bookmark only" order. A row that exists is updated."""
    from apps.inventory.models import Item, ManifestRow

    allowed = {choice[0] for choice in Item.CONDITION_CHOICES}
    existing: dict[int, ManifestRow] = {}
    for mr in ManifestRow.objects.filter(purchase_order=order).order_by('-id'):
        existing[mr.row_number] = mr  # the lowest id wins, as standardize picks
    create, update = [], []
    for row in rows:
        fields = {
            'quantity': row.quantity, 'title': row.final_title or '', 'brand': row.final_brand or '',
            'model': row.final_model or '', 'category': row.final_category or '',
            'condition': row.final_condition if row.final_condition in allowed else 'unknown',
            'unit_retail': row.unit_retail, 'proposed_price': row.proposed_price, 'final_price': row.final_price,
            'pricing_stage': row.pricing_stage, 'pricing_notes': row.pricing_notes or '',
            'identifiers': row.final_identifiers or {}, 'taxonomy': row.final_taxonomy or {},
            'search_tags': row.final_search_tags or [], 'specifications': row.final_specifications or {},
            'tracking': row.final_tracking or {}, 'notes': row.final_notes or '',
        }
        mr = existing.get(row.row_number)
        if mr is None:
            mr = ManifestRow(purchase_order=order, row_number=row.row_number, match_status='pending', **fields)
            existing[row.row_number] = mr
            create.append(mr)
        else:
            for name, value in fields.items():
                setattr(mr, name, value)
            update.append(mr)
        row.manifest_row = mr
    if create:
        ManifestRow.objects.bulk_create(create, batch_size=500)
    if update:
        ManifestRow.objects.bulk_update(update, list(MANIFEST_FIELDS), batch_size=500)
    for row in rows:
        row.manifest_row_id = row.manifest_row.pk  # created rows get their id from bulk_create


@transaction.atomic
def send(run: PrepRun, *, user=None) -> dict:
    """Write every line to the truck's staging rows and finalize it for Processing. Raises ``SendRefused``."""
    from apps.inventory.models import PreprocessingRow, PurchaseOrder
    from apps.inventory.services.processing_finalize import finalize_preprocessing_to_bookmarks
    from apps.prep_steps.services.steps import target_of

    order = PurchaseOrder.objects.select_for_update().get(pk=run.purchase_order_id)
    run.purchase_order = order
    reason = why_not(run)
    if reason:
        raise SendRefused(reason)

    share, _band = target_of(run)
    lines = {x.preprocessing_row_id: x for x in run.lines.all()}
    standard = _standard_rows(order)
    rows = list(PreprocessingRow.objects.filter(purchase_order=order))
    now = timezone.now()
    no_price = matched = 0
    for row in rows:
        x = lines[row.pk]
        std = standard.get(row.row_number) or {}
        price, stage, note = _price(x, share)
        if note == NO_PRICE_NOTE:
            no_price += 1
        retail = x.retail if x.retail is not None else x.src_retail
        identifiers = dict(std.get('identifiers') or {}) if isinstance(std.get('identifiers'), dict) else {}
        if x.upc:
            identifiers['upc'] = x.upc
        if x.item_number:
            identifiers['item_number'] = x.item_number
        taxonomy = dict(std.get('taxonomy') or {}) if isinstance(std.get('taxonomy'), dict) else {}
        taxonomy.setdefault('category', x.src_category or '')
        if x.subcategory or x.src_subcategory:
            taxonomy['subcategory'] = x.subcategory or x.src_subcategory
        # Only what the manifest's own columns say. A row's specifications are copied onto every item at check-in and
        # onto new products, so the pack numbers and the seller's photo and page links stay out (the pack words are
        # in the title).
        specifications = dict(std.get('specifications') or {}) if isinstance(std.get('specifications'), dict) else {}
        tracking = dict(std.get('tracking') or {}) if isinstance(std.get('tracking'), dict) else {}
        notes = str(std.get('notes') or '')
        if x.sell_as == 'units' and (x.pieces or 1) > 1:
            notes = (notes + ' ' if notes else '') + f'Sell by the unit: {x.pieces} tags for each one on the manifest.'
        is_match = bool(x.match_product_id) and x.match_kind == 'is'
        matched += 1 if is_match else 0

        row.quantity = max(1, (x.qty or 1) * max(1, x.pieces or 1))
        row.unit_retail = retail
        row.proposed_price = price
        row.final_price = price
        row.pricing_stage = stage
        row.pricing_notes = note
        row.final_title = _title(x)
        row.final_brand = (x.brand or '')[:200]
        row.final_model = (x.model or '')[:200]
        row.final_category = (x.category or '')[:200]
        row.final_condition = _condition(x.src_condition) or str(std.get('condition') or '')[:20]
        row.final_notes = notes
        row.final_identifiers = identifiers
        row.final_taxonomy = taxonomy
        row.final_specifications = specifications
        row.final_tracking = tracking
        row.final_search_tags = [str(t) for t in (x.search_tags or R.search_tags(x))]
        row.final_matched_product_id = x.match_product_id if is_match else None
        row.match_source = 'staff' if is_match else ''
        row.updated_at = now
    _write_manifest_rows(order, rows)
    PreprocessingRow.objects.bulk_update(rows, [
        'manifest_row', 'quantity', 'unit_retail', 'proposed_price', 'final_price', 'pricing_stage', 'pricing_notes', 'final_title',
        'final_brand', 'final_model', 'final_category', 'final_condition', 'final_notes', 'final_identifiers',
        'final_taxonomy', 'final_specifications', 'final_tracking', 'final_search_tags', 'final_matched_product',
        'match_source', 'updated_at',
    ], batch_size=500)

    written = finalize_preprocessing_to_bookmarks(order)
    # As old finalize does: a clean-up batch that started earlier must not land on top of the sent values.
    PurchaseOrder.objects.filter(pk=order.pk).update(ai_cleanup_generation=F('ai_cleanup_generation') + 1)
    order.refresh_from_db()

    steps = dict(run.steps or {})
    steps['send'] = {'state': 'done', 'done_at': now.isoformat(), 'sent_at': now.isoformat(),
                     'sent_by': getattr(user, 'pk', None), 'rows': written}
    run.steps = steps
    run.save(update_fields=['steps', 'updated_at'])
    logger.info('prep_steps send: order %s, %s rows, %s matched, %s with no price', order.pk, written, matched, no_price)
    return {'written': written, 'matched': matched, 'no_price': no_price,
            'sent_at': order.finalized_at.isoformat() if order.finalized_at else now.isoformat()}
