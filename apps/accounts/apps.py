from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'
    verbose_name = 'Accounts'

    def ready(self):
        # Owner 2026-10-15: every active staff user is also a website customer (signals.py).
        from apps.accounts import signals  # noqa: F401
        from apps.accounts import approval_kinds  # noqa: F401  (Superuser → Requests kinds)
