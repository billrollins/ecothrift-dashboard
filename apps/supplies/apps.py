from django.apps import AppConfig


class SuppliesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.supplies'
    verbose_name = 'Supplies'

    def ready(self):
        # Superuser → Requests kinds (apps/core/services/approval_requests.py).
        from apps.supplies import approval_kinds  # noqa: F401
