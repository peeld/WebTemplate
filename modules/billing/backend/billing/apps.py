from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'billing'

    def ready(self):
        import billing.signals as sigs  # noqa: F401 — ensures signal senders exist

        from billing.license_auth import _on_subscription_activated, _on_subscription_cancelled
        sigs.subscription_activated.connect(_on_subscription_activated)
        sigs.subscription_cancelled.connect(_on_subscription_cancelled)

        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured
        if not getattr(settings, 'STRIPE_SECRET_KEY', ''):
            raise ImproperlyConfigured('STRIPE_SECRET_KEY is not set.')
