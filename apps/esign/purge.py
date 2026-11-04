"""Deleting a document is never silent (D22 § 2.4).

The owner asks for it with a reason; it stays restorable for ``ESIGN_PURGE_DAYS`` (90); then it is purged: the rows and
every stored file go, and a ``PurgeLog`` row keeps what it was, who asked, why, and its fingerprints. A document out
for signature is voided first. The host runs ``purge_due()`` daily (Dark Horse: the ``purge_deleted_documents``
command on the Heroku Scheduler).
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from . import adapter
from .models import Envelope, PurgeLog

logger = logging.getLogger(__name__)


def purge_days() -> int:
    return int(getattr(settings, 'ESIGN_PURGE_DAYS', 90))


@transaction.atomic
def request_delete(envelope: Envelope, *, by, reason: str) -> Envelope:
    from .services import log, person

    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    if envelope.delete_requested_at:
        raise ValidationError({'detail': 'This document is already being deleted.'})
    if envelope.status == Envelope.OUT:
        raise ValidationError({'detail': 'It is out for signature. Void it first, then delete it.'})
    reason = ' '.join(str(reason or '').split())[:300]
    if len(reason) < 3:
        raise ValidationError({'reason': 'Say why it is deleted.'})
    now = timezone.now()
    envelope.delete_requested_at = now
    envelope.delete_requested_by = by if getattr(by, 'pk', None) else None
    envelope.delete_reason = reason
    envelope.purge_after = now + timedelta(days=purge_days())
    envelope.save(update_fields=['delete_requested_at', 'delete_requested_by', 'delete_reason', 'purge_after'])
    log(envelope, 'delete_requested', actor=person(by),
        detail=f'{reason}. Purged after {timezone.localtime(envelope.purge_after):%B %d, %Y} unless restored')
    return envelope


@transaction.atomic
def restore(envelope: Envelope, *, by) -> Envelope:
    from .services import log, person

    envelope = Envelope.objects.select_for_update().get(pk=envelope.pk)
    if not envelope.delete_requested_at:
        raise ValidationError({'detail': 'This document is not being deleted.'})
    envelope.delete_requested_at = envelope.purge_after = None
    envelope.delete_requested_by = None
    envelope.delete_reason = ''
    envelope.save(update_fields=['delete_requested_at', 'delete_requested_by', 'delete_reason', 'purge_after'])
    log(envelope, 'restored', actor=person(by))
    return envelope


def _keys(envelope: Envelope) -> list[str]:
    keys = [envelope.source_pdf_key, envelope.final_pdf_key, *envelope.uploads.values_list('storage_key', flat=True)]
    keys += [k for k in (envelope.other_keys or []) if isinstance(k, str)]
    return [k for k in dict.fromkeys(keys) if k]


def purge(envelope: Envelope, *, by=None) -> PurgeLog:
    """Remove it for good. Only one already asked to be deleted. The log row is written before anything goes."""
    from .services import person

    if not envelope.delete_requested_at:
        raise ValidationError({'detail': 'Ask for it to be deleted first.'})
    keys = _keys(envelope)
    host = adapter.get()
    with transaction.atomic():
        entry = PurgeLog.objects.create(
            envelope_id=envelope.pk, title=envelope.title[:200], kind=envelope.kind, status=envelope.status,
            attached_type=envelope.attached_type, attached_id=envelope.attached_id,
            attached_label=(host.attachment_label(envelope.attached_type, envelope.attached_id)
                            if envelope.attached_type else '')[:200],
            parties=', '.join(envelope.parties.order_by('order').values_list('name', flat=True))[:500],
            fingerprint=envelope.fingerprint, final_pdf_sha256=envelope.final_pdf_sha256,
            requested_by=person(envelope.delete_requested_by) if envelope.delete_requested_by_id else '',
            requested_at=envelope.delete_requested_at, reason=envelope.delete_reason,
            purged_by=person(by) if by else 'scheduled', keys_removed=keys)
        if envelope.batch_id and envelope.batch.envelopes.count() == 1:
            batch = envelope.batch
            envelope.delete()
            batch.delete()
        else:
            envelope.delete()  # parties, signatures, links, boxes, events, uploads go with it
    for key in keys:  # after the rows, so a storage hiccup never leaves a row pointing at nothing
        try:
            host.storage_delete(key)
        except Exception:  # noqa: BLE001 - the row is gone and logged; a stray file is the lesser harm
            logger.exception('E-sign purge: could not delete stored file %s', key)
    return entry


def purge_due(*, now=None) -> int:
    """Purge every document whose wait is over. Returns how many."""
    now = now or timezone.now()
    count = 0
    for envelope in Envelope.objects.filter(delete_requested_at__isnull=False, purge_after__lte=now):
        purge(envelope)
        count += 1
    return count


def purge_log_json(entry: PurgeLog) -> dict:
    return {'id': entry.pk, 'envelope_id': entry.envelope_id, 'title': entry.title, 'kind': entry.kind,
            'status': entry.status, 'attached_label': entry.attached_label, 'parties': entry.parties,
            'fingerprint': entry.fingerprint, 'requested_by': entry.requested_by,
            'requested_at': entry.requested_at.isoformat() if entry.requested_at else None, 'reason': entry.reason,
            'purged_by': entry.purged_by, 'purged_at': entry.purged_at.isoformat(), 'files': len(entry.keys_removed)}
