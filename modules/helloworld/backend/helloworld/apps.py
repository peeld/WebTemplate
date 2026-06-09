from django.apps import AppConfig


class HelloworldConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'helloworld'
    label = 'helloworld'
    verbose_name = 'Hello World'

    def ready(self):
        import helloworld.signals  # noqa: F401
