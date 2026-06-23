"""Shared soft-delete helpers for HR models (30-day retention before hard purge)."""
from datetime import timedelta

from django.db import models
from django.utils import timezone

SOFT_DELETE_RETENTION_DAYS = 30


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def deleted(self):
        return self.filter(deleted_at__isnull=False)

    def soft_delete(self, user=None):
        kwargs = {'deleted_at': timezone.now()}
        if user is not None:
            kwargs['deleted_by'] = user
        return self.update(**kwargs)


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


def purge_soft_deleted(model, *, retention_days=SOFT_DELETE_RETENTION_DAYS):
    """Hard-delete rows soft-deleted at or before the retention cutoff."""
    cutoff = timezone.now() - timedelta(days=retention_days)
    return model.all_objects.filter(deleted_at__isnull=False, deleted_at__lte=cutoff).delete()
