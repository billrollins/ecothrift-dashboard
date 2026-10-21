from django.apps import AppConfig


class PosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.pos'
    verbose_name = 'POS'

    def ready(self):
        from apps.pos import approval_kinds  # noqa: F401
