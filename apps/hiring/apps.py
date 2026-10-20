from django.apps import AppConfig


class HiringConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.hiring'
    verbose_name = 'Hiring'

    def ready(self):
        # Superuser → Requests kinds (apps/core/services/approval_requests.py).
        from apps.hiring import approval_kinds  # noqa: F401
