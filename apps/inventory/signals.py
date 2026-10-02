"""Inventory signals. Imported in `InventoryConfig.ready`."""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.inventory.models import Product, ProductProfile

logger = logging.getLogger(__name__)


def _refresh_search_text(product_id: int) -> None:
    from apps.inventory.services.inventory_search import rebuild_search_text

    def refresh() -> None:
        try:
            rebuild_search_text([product_id])
        except Exception:  # noqa: BLE001 - a stale search line must never fail a check-in or a sale
            logger.exception('search text refresh failed for product %s', product_id)

    transaction.on_commit(refresh)


@receiver(post_save, sender=Product, dispatch_uid='product_search_text')
def product_saved(sender, instance, update_fields=None, **kwargs):
    if update_fields is not None and set(update_fields) <= {'search_text', 'updated_at'}:
        return
    _refresh_search_text(instance.pk)


@receiver(post_save, sender=ProductProfile, dispatch_uid='profile_search_text')
def profile_saved(sender, instance, **kwargs):
    _refresh_search_text(instance.product_id)
