from django.apps import AppConfig


class LicensingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'licensing'
    label = 'licensing'

    def ready(self):
        from . import signals  # noqa — triggers signal connection
        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured

        key_path = getattr(settings, 'LICENSE_RSA_PRIVATE_KEY_PATH', '')
        if not key_path:
            raise ImproperlyConfigured('LICENSE_RSA_PRIVATE_KEY_PATH must be set')
        try:
            with open(key_path, 'r') as f:
                LicensingConfig.private_key = f.read()
        except OSError as e:
            raise ImproperlyConfigured(f'Cannot read LICENSE_RSA_PRIVATE_KEY_PATH: {e}')
