from django.apps import AppConfig


class PrepStepsConfig(AppConfig):
    """Truck Prep, version A (Dash #225): a guided line of steps over a copy of the truck's lines.

    Reads inventory tables (orders, manifest rows, products); writes only its own tables.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.prep_steps'
    verbose_name = 'Truck Prep A: Steps'
