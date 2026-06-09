from django.apps import AppConfig


class UserauthConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'userauth'
    label = 'userauth'
    verbose_name = 'User Authentication'

    def ready(self):
        import userauth.signals  # noqa: F401 — registers signal handlers
