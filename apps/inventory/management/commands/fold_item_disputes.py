"""One dispute record (Dash Update #102): fold the old item dispute marks into row disputes.

Before row disputes, a processor disputed a manifest row by checking in an Item and marking it: status lost ("did
not come"), status scrapped or dispute type broken ("broken"), or a dispute type with a % of value lost. Every such
mark becomes a row dispute linked to its item (``ManifestRowDispute.item``), so the header, Close the truck, the
B-Stock list and the Dispute window all read one record. The old open ``Dispute`` rows of kind processing (copies of
those marks, from May 2026) are marked resolved with a note.

Each truck is checked: its per-line truck numbers (missing, over, broken, disputed, marked missing) must be the same
before and after. A truck whose numbers would move is left as it was and reported STOPPED.

Items whose only mark is condition Salvage are not folded: since this release Salvage is a selling condition, not a
dispute, and no longer counts as Damaged (Mainline 2026-11-12, guessed for Bill). They are listed per truck so the
owner can see which claims they left.

    python manage.py fold_item_disputes                # dry run: everything is done in a transaction, then undone
    python manage.py fold_item_disputes --order TRGET-OL9-8K83
    python manage.py fold_item_disputes --apply        # keeps the changes (only trucks whose numbers match)
"""
from __future__ import annotations

from collections import Counter
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.inventory.models import Dispute, Item, ManifestRowDispute, ProcessingRow, PurchaseOrder

R = ManifestRowDispute
NOTE = 'Folded into row disputes (Dash Update #102).'
_PARTS = {'missing_pieces', 'missing_critical_piece'}


class _Rollback(Exception):
    pass


def reason_for(item: Item) -> str | None:
    """The row dispute reason for an item's old mark, or None when it has no mark to fold."""
    if item.status == 'lost':
        return R.REASON_DID_NOT_COME
    if item.status in ('intake', 'processing'):
        return None             # never received: its mark never counted, so there is nothing to carry over
    if item.status == 'scrapped' or item.dispute_type == 'broken':
        return R.REASON_BROKEN
    if item.dispute_type in _PARTS:
        return R.REASON_MISSING_PARTS
    if item.dispute_type:
        return R.REASON_OTHER
    return None


def fingerprint(order: PurchaseOrder) -> list[tuple]:
    from apps.inventory.services.truck_finalize import truck_lines

    def q(v) -> Decimal:
        return Decimal(v).quantize(Decimal('0.0001'))

    return [
        (line['row_number'], q(line['units']['received']), q(line['units']['missing']), q(line['units']['over']),
         q(line['units']['broken']), q(line['units']['disputed']), line['disputed_items'], q(line['marked_missing']))
        for line in truck_lines(order)
    ]


def marked_items(order: PurchaseOrder):
    already = ManifestRowDispute.objects.filter(purchase_order=order, item__isnull=False).values('item_id')
    return (
        Item.objects.filter(purchase_order=order, manifest_row_id__isnull=False)
        .filter(Q(status__in=('lost', 'scrapped')) | ~Q(dispute_type=''))
        .exclude(pk__in=already)
        .order_by('id')
    )


def fold_order(order: PurchaseOrder) -> dict:
    """Fold one truck inside the caller's transaction. Returns what was done; the caller keeps or undoes it."""
    rows = {}
    for pr in ProcessingRow.objects.filter(purchase_order=order, manifest_row_id__isnull=False).order_by('row_number'):
        rows.setdefault(pr.manifest_row_id, pr)
    made = Counter()
    touched_rows = set()
    for item in marked_items(order):
        reason = reason_for(item)
        if reason is None:
            continue
        partial = reason in (R.REASON_MISSING_PARTS, R.REASON_OTHER)
        pr = rows.get(item.manifest_row_id)
        what = item.dispute_type or item.status
        desc = (item.dispute_description or '').strip()
        ManifestRowDispute.objects.create(
            purchase_order=order, manifest_row_id=item.manifest_row_id, processing_row=pr, item=item, reason=reason,
            units=1, pct_lost=int(item.dispute_pct_loss or 0) if partial else 100,
            note=f'{NOTE} Was: {what}' + (f' - {desc}' if desc else ''),
        )
        made[reason] += 1
        if pr is not None:
            touched_rows.add(pr.pk)
    now = timezone.now()
    old = list(Dispute.objects.filter(purchase_order=order, kind=Dispute.KIND_PROCESSING, status=Dispute.STATUS_OPEN))
    for d in old:
        d.status, d.resolved_at = Dispute.STATUS_RESOLVED, now
        d.description = (d.description + '\n\n' if d.description else '') + NOTE
        d.save(update_fields=['status', 'resolved_at', 'description'])
    resolved = len(old)
    if resolved:
        from apps.inventory.services.disputes import recompute_dispute_rollups

        recompute_dispute_rollups(order.pk)
    if touched_rows:
        from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm

        refresh_processing_rows_denorm(order, processing_row_ids=sorted(touched_rows))
    return {'made': made, 'resolved': resolved}


def salvage_only(order: PurchaseOrder) -> int:
    return (
        Item.objects.filter(purchase_order=order, manifest_row_id__isnull=False, condition='salvage', dispute_type='')
        .exclude(status__in=('lost', 'scrapped', 'intake', 'processing'))
        .count()
    )


class Command(BaseCommand):
    help = 'Fold old item dispute marks into row disputes and resolve the old processing Dispute rows (Dash Update #102).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Keep the changes. Without it, nothing is kept.')
        parser.add_argument('--order', help='One truck: order number or id.')

    def handle(self, *args, **opts):
        apply = bool(opts['apply'])
        orders = PurchaseOrder.objects.all()
        if opts.get('order'):
            o = str(opts['order']).strip()
            orders = orders.filter(Q(order_number=o) | (Q(pk=int(o)) if o.isdigit() else Q(pk__in=[])))
        marked_ids = set(
            Item.objects.filter(manifest_row_id__isnull=False)
            .filter(Q(status__in=('lost', 'scrapped')) | ~Q(dispute_type=''))
            .values_list('purchase_order_id', flat=True)
        )
        open_ids = set(Dispute.objects.filter(kind=Dispute.KIND_PROCESSING, status=Dispute.STATUS_OPEN)
                       .values_list('purchase_order_id', flat=True))
        salvage_ids = set(Item.objects.filter(manifest_row_id__isnull=False, condition='salvage', dispute_type='')
                          .values_list('purchase_order_id', flat=True))
        orders = orders.filter(pk__in=marked_ids | open_ids | salvage_ids).order_by('order_number')

        self.stdout.write(('APPLY' if apply else 'DRY RUN (nothing is kept)') + f': {orders.count()} trucks')
        totals = Counter()
        for order in orders:
            before = fingerprint(order)
            outcome = 'nothing to fold'
            done = {'made': Counter(), 'resolved': 0}
            try:
                with transaction.atomic():
                    done = fold_order(order)
                    after = fingerprint(order)
                    same = before == after
                    if not same:
                        moved = [(b, a) for b, a in zip(before, after) if b != a][:3]
                        outcome = f'STOPPED: numbers would move {moved}'
                        raise _Rollback
                    if done['made'] or done['resolved']:
                        outcome = 'numbers match' + ('' if apply else ' (undone: dry run)')
                    if not apply:
                        raise _Rollback
            except _Rollback:
                pass
            made = done['made']
            salv = salvage_only(order)
            if outcome.startswith('STOPPED'):
                totals['stopped'] += 1
            else:
                totals.update(made)
                totals['resolved'] += done['resolved']
            totals['salvage_no_longer_damaged'] += salv
            totals['salvage_trucks'] += 1 if salv else 0
            parts = ', '.join(f'{k} {v}' for k, v in sorted(made.items())) or 'no item marks'
            self.stdout.write(
                f'{order.order_number or order.pk}: {parts}; old disputes resolved {done["resolved"]}; '
                f'salvage items no longer counted Damaged {salv}; {outcome}',
            )
        self.stdout.write(
            'TOTAL: ' + ', '.join(f'{k} {v}' for k, v in sorted(totals.items())) + ('' if apply else ' (dry run, nothing kept)'),
        )
