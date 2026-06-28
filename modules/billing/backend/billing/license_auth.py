import hashlib
import hmac
import logging
import time
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.exceptions import APIException, NotFound, PermissionDenied

from .models import LicenseKey, Product

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {'active', 'trialing'}


class SubscriptionRequired(APIException):
    status_code = 402
    default_detail = 'An active subscription is required.'
    default_code = 'subscription_required'


def verify_license_request(request):
    """
    Validate HMAC-signed license request headers.
    Returns (LicenseKey, machine_id_hash) or raises a DRF exception.
    """
    license_key_str = request.headers.get('X-License-Key', '')
    machine_id_hash = request.headers.get('X-Machine-ID', '')
    timestamp_str   = request.headers.get('X-Timestamp', '')
    nonce           = request.headers.get('X-Nonce', '')
    signature       = request.headers.get('X-Signature', '')

    if not all([license_key_str, machine_id_hash, timestamp_str, nonce, signature]):
        raise PermissionDenied('Missing required license headers.')

    try:
        ts = int(timestamp_str)
    except ValueError:
        raise PermissionDenied('Invalid timestamp.')

    if abs(int(time.time()) - ts) > 300:
        raise PermissionDenied('Request timestamp out of range.')

    # Store nonce before HMAC check to prevent replay under concurrent requests.
    nonce_cache_key = f'lic_nonce:{nonce}'
    if cache.get(nonce_cache_key):
        raise PermissionDenied('Duplicate nonce — replay detected.')
    cache.set(nonce_cache_key, 1, timeout=600)

    app_secret = getattr(settings, 'LICENSE_APP_SECRET', '')
    if not app_secret:
        logger.error('LICENSE_APP_SECRET is not configured')
        raise PermissionDenied('License service misconfigured.')

    msg      = f'{license_key_str}{timestamp_str}{nonce}{machine_id_hash}'.encode()
    expected = hmac.new(app_secret.encode(), msg, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        raise PermissionDenied('Invalid signature.')

    try:
        lic = (
            LicenseKey.objects
            .select_related('product', 'user__stripe_customer__subscription')
            .get(key=license_key_str)
        )
    except (LicenseKey.DoesNotExist, ValueError):
        raise NotFound('License key not found.')

    if not lic.is_active:
        raise SubscriptionRequired('License is inactive.')

    try:
        sub = lic.user.stripe_customer.subscription
    except ObjectDoesNotExist:
        raise SubscriptionRequired('No active subscription found.')

    if sub.status not in ACTIVE_STATUSES:
        raise SubscriptionRequired(f'Subscription status is {sub.status!r}.')

    return lic, machine_id_hash


def issue_license_token(lic, machine_id_hash):
    """Return (token_str, expires_at_utc_datetime)."""
    key_path = getattr(settings, 'LICENSE_RSA_PRIVATE_KEY_PATH', '')
    if not key_path:
        raise RuntimeError('LICENSE_RSA_PRIVATE_KEY_PATH is not configured.')
    try:
        private_key = open(key_path).read()
    except OSError as e:
        raise RuntimeError(f'Cannot read LICENSE_RSA_PRIVATE_KEY_PATH: {e}') from e

    now        = datetime.now(tz=timezone.utc)
    expires_at = now + timedelta(days=lic.offline_ttl_days)

    payload = {
        'sub': str(lic.user.pk),
        'lic': str(lic.key),
        'mid': machine_id_hash,
        'prd': lic.product.slug,
        'iat': int(now.timestamp()),
        'exp': int(expires_at.timestamp()),
    }

    token = jwt.encode(payload, private_key, algorithm='RS256')
    return token, expires_at


def _on_subscription_activated(sender, user, subscription, **kwargs):
    """Auto-create or re-activate a LicenseKey when a subscription becomes active."""
    try:
        product = Product.objects.get(stripe_product_id=subscription.stripe_product_id)
    except Product.DoesNotExist:
        return

    lic, created = LicenseKey.objects.get_or_create(
        user=user,
        product=product,
        defaults={
            'max_machines':     getattr(settings, 'LICENSE_DEFAULT_MAX_MACHINES', 1),
            'offline_ttl_days': getattr(settings, 'LICENSE_DEFAULT_OFFLINE_TTL_DAYS', 30),
        },
    )
    if not created and not lic.is_active:
        lic.is_active = True
        lic.save(update_fields=['is_active'])
        logger.info('Reactivated license key %s for user %s', lic.key, user.pk)
    elif created:
        logger.info('Created license key %s for user %s, product %s', lic.key, user.pk, product.slug)


def _on_subscription_cancelled(sender, user, subscription, **kwargs):
    """Deactivate LicenseKeys when a subscription is cancelled."""
    try:
        product = Product.objects.get(stripe_product_id=subscription.stripe_product_id)
    except Product.DoesNotExist:
        return

    updated = LicenseKey.objects.filter(user=user, product=product, is_active=True).update(is_active=False)
    if updated:
        logger.info('Deactivated license key for user %s, product %s', user.pk, product.slug)
