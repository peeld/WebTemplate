from django.apps import apps
from django.dispatch import receiver

from core_app.signals import license_grant_requested


@receiver(license_grant_requested)
def handle_license_grant(sender, user, product_id, **kwargs):
    LicenseKey = apps.get_model('licensing', 'LicenseKey')
    LicenseKey.objects.get_or_create(
        user=user,
        product_id=product_id,
        defaults={'is_active': True},
    )
