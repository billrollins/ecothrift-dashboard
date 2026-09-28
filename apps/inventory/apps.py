from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.inventory'
    verbose_name = 'Inventory'

    def ready(self):
        # Superuser → Requests kinds (apps/core/services/approval_requests.py).
        from apps.inventory import approval_kinds  # noqa: F401
