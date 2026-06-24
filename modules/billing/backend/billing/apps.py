from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'billing'

    def ready(self):
        # Ensures signal senders are available before any receivers connect.
        import billing.signals  # noqa: F401

        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured
        if not getattr(settings, 'STRIPE_SECRET_KEY', ''):
            raise ImproperlyConfigured('STRIPE_SECRET_KEY is not set.')
