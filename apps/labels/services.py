"""Label Studio housekeeping — orphan S3 media cleanup."""
from __future__ import annotations

import logging
from datetime import timedelta

from django.core.files.storage import default_storage
from django.utils import timezone

from apps.core.models import S3File

from .models import CustomLabel

logger = logging.getLogger(__name__)

# Fresh uploads (e.g. replace-then-fail) are not swept inside this window.
ORPHAN_GRACE_HOURS = 24
LABEL_S3_PREFIX = 'label-studio/'


def referenced_label_s3_ids() -> set[int]:
    """S3File ids still attached to any CustomLabel (active or soft-archived)."""
    ids: set[int] = set()
    for bg_id, pdf_id in CustomLabel.objects.values_list('background_id', 'pdf_file_id'):
        if bg_id:
            ids.add(bg_id)
        if pdf_id:
            ids.add(pdf_id)
    return ids


def purge_orphan_label_media() -> int:
    """Hard-delete unreferenced ``label-studio/`` S3File rows older than the grace window.

    Soft-archived labels still protect their media so printable history remains.
    Returns the number of S3File rows deleted.
    """
    referenced = referenced_label_s3_ids()
    cutoff = timezone.now() - timedelta(hours=ORPHAN_GRACE_HOURS)
    candidates = list(
        S3File.objects.filter(
            key__startswith=LABEL_S3_PREFIX,
            uploaded_at__lt=cutoff,
        ).exclude(pk__in=referenced)
    )
    deleted = 0
    for s3 in candidates:
        try:
            default_storage.delete(s3.key)
        except Exception:
            logger.warning('Failed to delete storage object %s', s3.key, exc_info=True)
            continue
        s3.delete()
        deleted += 1
    return deleted


def safe_purge_orphan_label_media() -> None:
    """Best-effort purge; never raises into the request path."""
    try:
        purge_orphan_label_media()
    except Exception:
        logger.warning('purge_orphan_label_media failed', exc_info=True)
