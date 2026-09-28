from django.apps import AppConfig


class ThriftPlusConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.thriftplus'
    verbose_name = 'Thrift+'

    def ready(self):
        # Superuser → Requests kinds (apps/core/services/approval_requests.py).
        from apps.thriftplus import approval_kinds  # noqa: F401
