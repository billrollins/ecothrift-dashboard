from django.apps import AppConfig


class StocktakeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.stocktake'

    def ready(self):
        from apps.stocktake import approval_kinds  # noqa: F401
