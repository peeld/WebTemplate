from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'billing'

    def ready(self):
        import billing.signals as sigs  # noqa: F401 — ensures signal senders exist

        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured
        if not getattr(settings, 'STRIPE_SECRET_KEY', ''):
            raise ImproperlyConfigured('STRIPE_SECRET_KEY is not set.')
