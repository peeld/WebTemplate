from django.apps import AppConfig


class UserauthConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'userauth'

    def ready(self):
        """Load signal handlers on app startup."""
        import userauth.signals  # noqa: F401
