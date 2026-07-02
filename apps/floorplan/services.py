"""Floorplan housekeeping services."""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import FloorPlan, FloorPlanAsset, FloorPlanElementKind

# Newly uploaded assets are never purged inside this window, so an image that
# was just uploaded for a not-yet-saved plan can't be swept as an orphan.
ORPHAN_GRACE_HOURS = 24


def referenced_asset_ids() -> set[int]:
    """Asset ids referenced by any active plan element or active kind default."""
    ids: set[int] = set()
    for kind_image_id in FloorPlanElementKind.objects.filter(
        is_active=True, default_image__isnull=False,
    ).values_list('default_image_id', flat=True):
        ids.add(kind_image_id)
    for data in FloorPlan.objects.filter(is_active=True).values_list('data', flat=True):
        elements = (data or {}).get('elements') or []
        for element in elements:
            image = element.get('image') if isinstance(element, dict) else None
            if isinstance(image, int):
                ids.add(image)
    return ids


def purge_orphan_assets() -> int:
    """Hard-delete assets nothing references anymore.

    An asset is purged when it is NOT referenced by any active plan document or
    active element kind, AND it is either already soft-deleted or older than
    the grace window. Returns the number of rows deleted.
    """
    referenced = referenced_asset_ids()
    cutoff = timezone.now() - timedelta(hours=ORPHAN_GRACE_HOURS)
    candidates = FloorPlanAsset.objects.filter(
        Q(is_active=False) | Q(created_at__lt=cutoff),
    ).exclude(pk__in=referenced)
    deleted, _ = candidates.delete()
    return deleted
