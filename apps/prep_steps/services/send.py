"""Send: hand the truck to Processing for real (Dash Update #233; Bill 2026-11-25: "I need Prep A to WORK").

Send writes what old Preprocessing's finalize writes, through the same code, so the truck lands in Processing as a
normal finalized truck:

1. The manifest spine (one ``ManifestRow`` a line: what the manifest said), with the function standardize uses, when
   the truck has none of its own yet.
2. Prep Truck's values on the staging rows' final layer (``PreprocessingRow.final_*``): where finalize reads them.
3. ``finalize_preprocessing_to_bookmarks``: the finalize old Preprocessing runs (the Processing rows, order finalized).
4. A line sold by the unit goes through Processing's own Break apart, so its row counts tags and prices one tag.

One transaction: all of it or none. Send again, and Undo send, work while nothing on the truck is checked in; after
that both refuse and say why. Undo send is old Preprocessing's own undo (finalize, then standardize when Send made
the spine): the truck is an uploaded manifest again and the prep here is untouched.

Open lines never block. A line with no product is a new product at Processing; a line with no price gets the truck
rule's price (its retail from the manifest first, when it has none); a line with no retail at all goes over at $0.00
and is priced at check-in.

What a Processing row has no column for: the pack numbers (written in the title, the pack standard), the subcategory
(kept in ``taxonomy.path``, the hover on Category), the photo and page links (still on the staging row's raw line),
and a "like" product (the Likely list finds its own; the pick is kept in the staging row's ``match_candidates``).
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.prep_steps.models import PrepAction, PrepLine, PrepRun
from apps.prep_steps.services import rules as R
from apps.prep_steps.services import steps as S
from apps.prep_steps.services.flags import line_flags, open_steps
from apps.prep_steps.services.load import clean_upc, upc_rounded

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')
CENT = Decimal('0.01')
NO_PRICE_NOTE = 'No price from Prep Truck: price it at check-in'
NO_TITLE = 'Review raw manifest row {n}'
MAX_CANDIDATES = 5
ACTION_NAME = 'send'
_NOTE_HEADERS = frozenset({'notes', 'note', 'comment', 'comments', 'notes/comments'})

STAGING_FIELDS = [
    'manifest_row', 'quantity', 'unit_retail', 'proposed_price', 'final_price', 'pricing_stage', 'pricing_notes',
    'ai_reasoning', 'final_title', 'final_brand', 'final_model', 'final_category', 'final_condition', 'final_notes',
    'final_identifiers', 'final_taxonomy', 'final_specifications', 'final_tracking', 'final_search_tags',
    'final_matched_product', 'match_source', 'match_candidates', 'updated_at',
]
STANDARD_FIELDS = [
    'standard_brand', 'standard_model', 'standard_condition', 'standard_notes', 'standard_identifiers',
    'standard_taxonomy', 'standard_specifications', 'standard_tracking', 'standard_search_tags',
]


class SendRefused(Exception):
    """Send or Undo send cannot run; the message says why, for the person."""


def _n(count: int, one: str) -> str:
    return f'{count:,} {one}{"" if count == 1 else "s"}'


def blocked_reason(order) -> str:
    """Why Send and Undo send are closed on this truck ('' while they are open): work has started in Processing."""
    from apps.inventory.models import Item, ItemCheckIn, ManifestAdjustment, ManifestRowDispute

    closed = 'Send and Undo send are closed.'
    if getattr(order, 'uses_legacy_processing', False):
        return f'This truck was processed the old way: {closed}'
    n = ItemCheckIn.objects.filter(purchase_order=order).count()
    if n:
        return f'{_n(n, "check-in")} already in Processing: {closed}'
    n = Item.objects.filter(purchase_order=order).count()
    if n:
        return f'{_n(n, "item")} already on this truck: {closed}'
    n = ManifestRowDispute.objects.filter(purchase_order=order).count()
    if n:
        return f'{_n(n, "disputed row")} already in Processing: {closed}'
    n = ManifestAdjustment.objects.filter(purchase_order=order).count()
    if n:
        return f'{_n(n, "unfulfilled line")} already on record: {closed}'
    return ''


def state(run: PrepRun) -> dict:
    """Where the truck stands: in Processing or not, since when, and whether Send and Undo send are open."""
    from apps.inventory.models import ProcessingRow, PurchaseOrder

    order = PurchaseOrder.objects.get(pk=run.purchase_order_id)
    rows = 0
    if order.finalized_at:
        rows = ProcessingRow.objects.filter(purchase_order=order, row_kind=ProcessingRow.ROW_KIND_MANIFEST,
                                            split_parent__isnull=True).count()
    sent = bool(order.finalized_at) and rows > 0
    info = (run.steps or {}).get('send') or {}
    return {
        'sent': sent,
        'sent_at': (info.get('sent_at') or order.finalized_at.isoformat()) if sent else None,
        'rows': rows,
        'blocked': blocked_reason(order),
        'processing_url': f'/inventory/processing/{order.pk}',
    }


def open_counts(run: PrepRun, lines: list[PrepLine], stats: dict | None = None) -> dict:
    """How many lines are still open, and what Send does with them (they never block)."""
    share, band = S.target_of(run)
    stats = stats if stats is not None else S.stats_for(lines)
    return {
        'lines': sum(1 for x in lines if open_steps(line_flags(x, share, band, stats), x.accepted)),
        'no_product': sum(1 for x in lines if x.match_kind != 'is' or not x.match_product_id),
        'no_price': sum(1 for x in lines if not x.price and (x.retail or x.src_retail)),
        'no_retail': sum(1 for x in lines if not x.price and not x.retail and not x.src_retail),
    }


def preview(run: PrepRun) -> dict:
    """What Send would write, line by line, the open lines, and where the truck stands. Writes nothing."""
    lines = list(run.lines.all())
    stats = S.stats_for(lines)
    out = S.send_dry_run(run, lines, stats)
    for row, x in zip(out['lines'], lines):
        row['title'] = row_title(x)  # the row's title as Processing will show it
        row['qty'] = max(1, x.qty or 1)
        match = row.get('product_match')
        if match and not match.get('number'):  # a "like" product: its number is on the line's own candidates
            match['number'] = next((str(c.get('number') or '') for c in (x.match_candidates or [])
                                    if isinstance(c, dict) and c.get('product_id') == x.match_product_id), '')
    out['open'] = open_counts(run, lines, stats)
    out['state'] = state(run)
    # The screen shipped in v2.342.0 reads these two; kept so a page left open over a deploy still reads "sent".
    out['sent_at'] = out['state']['sent_at']
    out['why_not'] = out['state']['blocked']
    return out


# -- one line -> what the manifest said, and what Prep Truck decided --------------------------------------------------

def _key(header: Any) -> str:
    return ' '.join(str(header or '').strip().lower().split())


def _raw_buckets(raw: dict | None) -> dict[str, dict[str, str]]:
    """identifiers / taxonomy / tracking from the manifest's own columns, by the names standardize knows them by."""
    from apps.inventory.manifest_standard_fields import all_source_alias_candidates

    by_key = {_key(h): v for h, v in (raw or {}).items()}
    out: dict[str, dict[str, str]] = {'identifiers': {}, 'taxonomy': {}, 'tracking': {}}
    for target, names in all_source_alias_candidates().items():
        bucket, _, sub = target.partition('.')
        if bucket not in out or not sub:
            continue
        for name in names:
            value = str(by_key.get(name) or '').strip()
            if value:
                out[bucket][sub] = value
                break
    return out


def _raw_notes(raw: dict | None) -> str:
    """The manifest's own note on the line (a link in that column is the product page, not a note)."""
    for header, value in (raw or {}).items():
        if _key(header) in _NOTE_HEADERS:
            text = str(value or '').strip()
            if text and not text.lower().startswith('http'):
                return text
    return ''


def _standard_rows(order) -> dict[int, dict]:
    """Every line as old standardize reads it, with the truck's own column formulas: {row number: normalized row}.
    {} when they cannot be read; Send then finds the columns by their usual names (``_raw_buckets``)."""
    from apps.inventory.views import build_normalized_manifest_rows_from_staging

    try:
        with transaction.atomic():  # a failure here must not poison the send's own transaction
            prepared = build_normalized_manifest_rows_from_staging(order)
    except Exception:  # noqa: BLE001 - the formulas are a better reading, never a reason to stop the send
        logger.exception('prep_steps send: the standard columns of order %s could not be read', order.pk)
        return {}
    if prepared.get('error'):
        return {}
    return {int(r.get('row_number') or 0): r for r in prepared.get('normalized_rows') or [] if isinstance(r, dict)}


def _bucket(std: dict, guessed: dict, kept: Any, name: str) -> dict:
    """One bucket of a line: what an old spine row already holds, the header-name guess, then standardize's reading."""
    out: dict = dict(kept) if isinstance(kept, dict) else {}
    out.update(guessed.get(name) or {})
    if isinstance(std.get(name), dict):
        out.update({k: v for k, v in std[name].items() if str(v or '').strip()})
    return out


def _identifiers(x: PrepLine, base: dict[str, Any]) -> dict[str, Any]:
    """The line's codes. A UPC is kept only as 8 to 14 digits the spreadsheet did not round (a rounded one matches
    the wrong product)."""
    ids = dict(base)
    upc = x.upc or clean_upc(ids.get('upc'))
    if upc and not upc_rounded(upc):
        ids['upc'] = upc
    else:
        ids.pop('upc', None)
    if x.item_number:
        ids.setdefault('item_number', x.item_number)
    return ids


def _condition(raw: str) -> str:
    from apps.inventory.cleanup_condition import normalize_cleanup_condition

    return normalize_cleanup_condition(raw) or ''


def _whole(amount: Decimal | None, pieces: int) -> Decimal | None:
    """One tag's amount back to the whole manifest unit (Break apart divides it again)."""
    if amount is None:
        return None
    return (Decimal(amount) * pieces).quantize(CENT)


def _pieces(x: PrepLine) -> int:
    return max(1, x.pieces or 1)


def _pack(x: PrepLine) -> str:
    """The pack words of what one tag holds: the whole pack, or one unit of it when the line is sold by the unit."""
    pieces = _pieces(x)
    units = x.pack_units or 1
    return R.pack_words(x.unit_count, x.unit_name, max(1, units // pieces) if pieces > 1 else units)


def row_title(x: PrepLine) -> str:
    """The row's title in Processing: Prep Truck's title with the pack words; never empty (finalize wants one)."""
    return S.title_with_pack(x.title or x.src_title, _pack(x)) or NO_TITLE.format(n=x.row_number)


def _why(x: PrepLine, pack: str) -> str:
    """The reasons Prep Truck recorded, in one line (kept on the row; the price reason is its pricing note)."""
    r = x.reasons or {}
    parts = [f'{label}: {r[key]}' for label, key in
             (('Title', 'title'), ('Category', 'category'), ('Retail', 'retail'), ('Product', 'match_kind')) if r.get(key)]
    if pack:
        parts.append(f'Pack: {pack}' + (f' ({_pieces(x)} tags a manifest unit)' if _pieces(x) > 1 else ''))
    return ('Prep Truck. ' + '. '.join(parts))[:1000] if parts else ''


def _candidates(x: PrepLine) -> list[dict]:
    """Prep Truck's product picks in the staging row's own shape, the picked one first."""
    cands = [c for c in (x.match_candidates or []) if isinstance(c, dict) and c.get('product_id')]
    cands.sort(key=lambda c: c.get('product_id') != x.match_product_id)
    out: list[dict] = []
    seen: set[int] = set()
    for c in cands:
        pid = int(c['product_id'])
        if pid in seen:
            continue
        seen.add(pid)
        sim = c.get('sim')
        out.append({
            'product_id': pid,
            'score': round(float(sim) * 100) if isinstance(sim, (int, float)) else int(x.match_confidence or 0),
            'source': 'text',
            'snapshot': {'title': c.get('title') or '', 'brand': c.get('brand') or '', 'identifiers': {},
                         'product_number': c.get('number') or ''},
        })
        if len(out) >= MAX_CANDIDATES:
            break
    return out


def _spine_fields(x: PrepLine, std: dict, *, ids: dict, taxonomy: dict, tracking: dict, specs: dict, notes: str,
                  condition: str) -> dict[str, Any]:
    """The ``ManifestRow`` fields of a line: what the manifest said, through the function standardize uses. The
    columns a person checked on Load win; standardize's own reading fills what Load does not read."""
    from apps.inventory.views import manifest_row_fields_from_standardized_data

    retail = x.src_retail if x.src_retail is not None else std.get('unit_retail')
    row_data = {
        'row_number': x.row_number, 'quantity': max(1, x.src_qty or 1),
        'title': (x.src_title or std.get('title') or x.title or '')[:300],
        'brand': x.src_brand or std.get('brand') or '', 'model': x.src_model or std.get('model') or '',
        'condition': condition, 'category': x.category, 'identifiers': ids, 'taxonomy': taxonomy, 'tracking': tracking,
        'specifications': specs, 'search_tags': [], 'notes': notes, 'batch_flag': False,
    }
    pricing = {'unit_retail': retail, 'proposed_price': None, 'final_price': None, 'pricing_stage': 'unpriced',
               'pricing_notes': ''}
    return manifest_row_fields_from_standardized_data(row_data, pricing=pricing)


def _write_staging(sr, mr, x: PrepLine, *, ids: dict, taxonomy: dict, tracking: dict, specs: dict, notes: str,
                   condition: str, products: set[int], standard: bool) -> None:
    """Prep Truck's values on one staging row, where finalize reads them (the whole manifest unit's money)."""
    pieces = _pieces(x)
    pack = _pack(x)
    reasons = x.reasons or {}
    path = ' > '.join(v for v in (x.category, x.subcategory) if v)
    sr.manifest_row = mr
    sr.quantity = max(1, x.qty or 1)
    sr.unit_retail = _whole(x.retail, pieces)
    sr.proposed_price = None
    if x.price:
        sr.final_price, sr.pricing_stage, sr.pricing_notes = _whole(x.price, pieces), 'final', reasons.get('price') or ''
    else:
        sr.final_price, sr.pricing_stage, sr.pricing_notes = ZERO, 'unpriced', NO_PRICE_NOTE
    sr.ai_reasoning = _why(x, pack)
    sr.final_title = row_title(x)
    sr.final_brand = x.brand or ''
    sr.final_model = x.model or ''
    sr.final_category = x.category or ''
    sr.final_condition = condition
    sr.final_notes = notes
    sr.final_identifiers = ids
    sr.final_taxonomy = {**taxonomy, **({'path': path} if path else {})}
    sr.final_specifications = specs
    sr.final_tracking = tracking
    sr.final_search_tags = list(x.search_tags or R.search_tags(x))
    is_product = x.match_kind == 'is' and x.match_product_id in products
    sr.final_matched_product_id = x.match_product_id if is_product else None
    by_hand = 'staff' in ((x.sources or {}).get('match_kind'), (x.sources or {}).get('match_product_id'))
    sr.match_source = ('staff' if by_hand else 'auto') if x.match_kind else ''
    sr.match_candidates = _candidates(x)
    if standard:
        sr.standard_brand = mr.brand or ''
        sr.standard_model = mr.model or ''
        sr.standard_condition = condition
        sr.standard_notes = notes
        sr.standard_identifiers = ids
        sr.standard_taxonomy = taxonomy
        sr.standard_specifications = specs
        sr.standard_tracking = tracking
        sr.standard_search_tags = []


def _price_open_lines(run: PrepRun, lines: list[PrepLine], user) -> int:
    """A line with no price gets the truck rule's price (its retail from the manifest first, when it has none).
    Normal rule passes: they show in the Retail and Price steps and can be undone there."""
    no_retail = [x.pk for x in lines if not x.retail and (x.src_retail or (x.src_ext_retail and x.src_qty))]
    if no_retail:
        S.run_rule(run, 'retail_manifest', no_retail, user=user, force=True)
    priced = 0
    no_price = list(PrepLine.objects.filter(run=run, price__isnull=True, retail__gt=0).values_list('pk', flat=True))
    no_price += list(PrepLine.objects.filter(run=run, price=0, retail__gt=0).values_list('pk', flat=True))
    if no_price:
        priced = S.run_rule(run, 'price_rule', no_price, user=user, force=True).changed_count
    return priced


# -- Send -----------------------------------------------------------------------------------------------------------

@transaction.atomic
def send(run: PrepRun, *, user=None) -> dict:
    """Write the truck into Processing. Raises ``SendRefused`` (nothing written) when it cannot."""
    from apps.inventory.models import ItemCheckIn, ManifestRow, PreprocessingRow, ProcessingRow, Product, PurchaseOrder
    from apps.inventory.services.processing_finalize import finalize_preprocessing_to_bookmarks
    from apps.inventory.services.processing_transforms import processing_break_apart_row

    started = time.monotonic()
    order = PurchaseOrder.objects.select_for_update().get(pk=run.purchase_order_id)
    why = blocked_reason(order)
    if why:
        raise SendRefused(why)
    again = bool(order.finalized_at)
    lines = list(PrepLine.objects.filter(run=run).order_by('row_number'))
    if not lines:
        raise SendRefused('This truck has no lines to send.')

    priced_by_rule = _price_open_lines(run, lines, user)
    lines = list(PrepLine.objects.filter(run=run).order_by('row_number'))

    # The staging rows (the uploaded manifest) must be the lines of this prep, one for one: finalize reads them all.
    staging = {p.row_number: p for p in PreprocessingRow.objects.filter(purchase_order=order)}
    if not staging:
        raise SendRefused('This truck has no uploaded manifest lines (an old import). '
                          'Upload its manifest again, load it here, then send.')
    if {x.row_number for x in lines} != set(staging) or any(
        x.preprocessing_row_id != staging[x.row_number].pk for x in lines
    ):
        raise SendRefused(f'The manifest changed after it was loaded here ({_n(len(staging), "line")} now, '
                          f'{len(lines):,} in this prep). Load the manifest again (step 1), then send.')

    # 1. The spine. Send writes it when the truck has none of its own: old standardize always stamps
    #    ``standardized_at`` and Send never does, so a spine without the stamp is one Send made (Undo send reads this).
    spine: dict[int, ManifestRow] = {}
    for mr in ManifestRow.objects.filter(purchase_order=order).order_by('-id'):
        spine[mr.row_number] = mr  # lowest id wins, as standardize picks
    owns_spine = order.standardized_at is None
    products = set(Product.objects.filter(
        pk__in={x.match_product_id for x in lines if x.match_kind == 'is' and x.match_product_id},
    ).values_list('pk', flat=True))
    create: list[ManifestRow] = []
    update: list[ManifestRow] = []
    spine_fields: list[str] = []
    now = timezone.now()
    rows: list[PreprocessingRow] = []
    standard = _standard_rows(order)
    for x in lines:
        mr = spine.get(x.row_number)
        ours = mr is None or owns_spine
        kept = mr if (mr is not None and not ours) else None  # old standardize's row: read, never rewritten
        std = standard.get(x.row_number) or {}
        guessed = _raw_buckets(x.raw)
        ids = _identifiers(x, _bucket(std, guessed, getattr(kept, 'identifiers', None), 'identifiers'))
        taxonomy = _bucket(std, guessed, getattr(kept, 'taxonomy', None), 'taxonomy')
        tracking = _bucket(std, guessed, getattr(kept, 'tracking', None), 'tracking')
        specs = _bucket(std, guessed, getattr(kept, 'specifications', None), 'specifications')
        std_notes = str(std.get('notes') or '').strip()
        notes = (kept.notes if kept else '') or ('' if std_notes.lower().startswith('http') else std_notes) \
            or _raw_notes(x.raw)
        condition = _condition(x.src_condition) or _condition(str(std.get('condition') or '')) \
            or (kept.condition if kept else '')
        if ours:
            fields = _spine_fields(x, std, ids=ids, taxonomy=taxonomy, tracking=tracking, specs=specs, notes=notes,
                                   condition=condition)
            spine_fields = spine_fields or list(fields)
            if mr is None:
                mr = ManifestRow(purchase_order=order, row_number=x.row_number, **fields)
                spine[x.row_number] = mr
                create.append(mr)
            else:
                for field, value in fields.items():
                    setattr(mr, field, value)
                update.append(mr)
        sr = staging[x.row_number]
        _write_staging(sr, mr, x, ids=ids, taxonomy=taxonomy, tracking=tracking, specs=specs, notes=notes,
                       condition=condition, products=products, standard=ours)
        sr.updated_at = now
        rows.append(sr)
    if create:
        ManifestRow.objects.bulk_create(create, batch_size=500)
    if update:
        ManifestRow.objects.bulk_update(update, spine_fields, batch_size=300)
    for sr in rows:
        sr.manifest_row_id = sr.manifest_row.pk  # a created row only has its id after bulk_create

    # 2. Prep Truck's values on the staging rows, where finalize reads them.
    PreprocessingRow.objects.bulk_update(rows, STAGING_FIELDS + STANDARD_FIELDS, batch_size=200)

    # 3. The same finalize old Preprocessing runs: the Processing rows, and the order finalized.
    try:
        written = finalize_preprocessing_to_bookmarks(order)
    except ValidationError as exc:  # finalize wants a title and a price on every line; Send gives each line both
        raise SendRefused('Processing would not take the truck: a line has no title or no price.') from exc
    PurchaseOrder.objects.filter(pk=order.pk).update(ai_cleanup_generation=F('ai_cleanup_generation') + 1)

    # 4. A line sold by the unit: Processing's own Break apart (row counts tags; retail and price of one tag).
    by_unit = [x for x in lines if _pieces(x) > 1]
    if by_unit:
        bookmarks = dict(ProcessingRow.objects.filter(
            purchase_order=order, row_kind=ProcessingRow.ROW_KIND_MANIFEST, split_parent__isnull=True,
            row_number__in=[x.row_number for x in by_unit],
        ).values_list('row_number', 'pk'))
        for x in by_unit:
            try:
                processing_break_apart_row(user, order, {
                    'processing_row_id': bookmarks[x.row_number], 'units': max(1, x.qty or 1), 'factor': _pieces(x),
                    'unit_retail': str(x.retail) if x.retail is not None else None,
                    'shelf_price': str(x.price) if x.price else None,
                })
            except (KeyError, ValueError, ProcessingRow.DoesNotExist) as exc:
                raise SendRefused(f'Line {x.row_number} could not be set to sell by the unit: {exc}') from exc

    # A check-in that landed while this ran: everything above is rolled back.
    if ItemCheckIn.objects.filter(purchase_order=order).exists():
        raise SendRefused('A check-in came in on this truck while it was being sent. Nothing was changed.')

    stamp = timezone.now().isoformat()
    steps = dict(run.steps or {})
    steps['send'] = {**steps.get('send', {}), 'state': 'done', 'done_at': stamp, 'sent_at': stamp,
                     'sent_by': getattr(user, 'pk', None), 'sent_rows': written, 'made_spine': owns_spine}
    run.steps = steps
    run.save(update_fields=['steps', 'updated_at'])
    PrepAction.objects.create(
        run=run, step='send', kind=PrepAction.KIND_RULE, name=ACTION_NAME,
        label='Sent to Processing again' if again else 'Sent to Processing', status=PrepAction.STATUS_APPLIED,
        line_count=len(lines), changed_count=written, seconds=round(time.monotonic() - started, 2),
        created_by=user if getattr(user, 'pk', None) else None, finished_at=timezone.now(),
    )
    return {'written': written, 'again': again, 'priced_by_rule': priced_by_rule, 'by_unit': len(by_unit),
            'products': sum(1 for sr in rows if sr.final_matched_product_id)}


# -- Undo send ------------------------------------------------------------------------------------------------------

@transaction.atomic
def undo(run: PrepRun, *, user=None) -> dict:
    """Take the truck back out of Processing, with old Preprocessing's own undo. The prep here is untouched."""
    from apps.inventory.models import ProcessingRow, PurchaseOrder
    from apps.inventory.services.intake_undo import UndoNotAllowed, apply_undo

    order = PurchaseOrder.objects.select_for_update().get(pk=run.purchase_order_id)
    if not order.finalized_at:
        raise SendRefused('This truck is not in Processing. There is nothing to undo.')
    why = blocked_reason(order)
    if why:
        raise SendRefused(why)
    removed = ProcessingRow.objects.filter(purchase_order=order).count()
    # The spine goes too only when a send from here made it: the run says so (the first cut, v2.342.0, left its
    # ``sent_at`` and no ``made_spine``), and old standardize never ran (it stamps ``standardized_at``). A truck old
    # Preprocessing finalized, or a run loaded again since, is only un-finalized: its manifest rows and layers stay.
    info = (run.steps or {}).get('send') or {}
    made_spine = order.standardized_at is None and bool(info.get('made_spine', 'sent_at' in info))
    try:
        apply_undo(order, 'finalize')  # the Processing rows go; the order is no longer finalized
        if made_spine:
            order.refresh_from_db()
            apply_undo(order, 'standardize')  # and the spine and layers Send wrote: an uploaded manifest again
    except UndoNotAllowed as exc:
        raise SendRefused(exc.message) from exc

    steps = dict(run.steps or {})
    kept = {k: v for k, v in info.items() if k not in ('done_at', 'sent_at', 'sent_by', 'sent_rows', 'rows', 'made_spine')}
    steps['send'] = {**kept, 'state': 'open'}
    run.steps = steps
    run.save(update_fields=['steps', 'updated_at'])
    run.actions.filter(name=ACTION_NAME, status=PrepAction.STATUS_APPLIED).update(status=PrepAction.STATUS_UNDONE)
    return {'removed': removed, 'by': getattr(user, 'pk', None)}
