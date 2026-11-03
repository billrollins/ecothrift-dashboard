from django.apps import AppConfig


class HrConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.hr'
    verbose_name = 'HR'

    def ready(self):
        from apps.hr import approval_kinds  # noqa: F401  (Superuser → Requests kinds)
