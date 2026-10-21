from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'
    verbose_name = 'Core'

    def ready(self):
        # Server 500s go to the owner's error alerts (AppError).
        from django.core.signals import got_request_exception

        from .services.app_errors import on_request_exception

        got_request_exception.connect(on_request_exception, dispatch_uid='core.app_errors')
