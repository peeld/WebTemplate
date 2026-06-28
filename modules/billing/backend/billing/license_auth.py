import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from django.core.cache import cache
from rest_framework.exceptions import APIException, NotFound, PermissionDenied

from .models import LicenseKey, LicenseMachine, Product

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {'active', 'trialing'}
GRACE_STATUSES  = {'past_due'}  # billing retry window — still let clients in


class SubscriptionRequired(APIException):
    status_code = 402
    default_detail = 'An active subscription is required.'
    default_code = 'subscription_required'


def generate_machine_secret():
    return secrets.token_hex(32)  # 256 bits


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
            .select_related('product', 'subscription')
            .get(key=license_key_str)
        )
    except (LicenseKey.DoesNotExist, ValueError):
        raise NotFound('License key not found.')

    if not lic.is_active:
        raise SubscriptionRequired('License is inactive.')

    now = datetime.now(tz=timezone.utc)

    # Prepay path: expires_at in the future is sufficient on its own.
    has_active_expiry = bool(lic.expires_at and lic.expires_at > now)

    # Subscription path: active/grace status and product covered.
    has_active_sub = False
    if lic.subscription_id:
        sub = lic.subscription
        if sub.status in (ACTIVE_STATUSES | GRACE_STATUSES):
            if sub.items.filter(stripe_product_id=lic.product.stripe_product_id).exists():
                has_active_sub = True

    if not has_active_sub and not has_active_expiry:
        if lic.subscription_id:
            raise SubscriptionRequired(f'Subscription status is {lic.subscription.status!r}.')
        if lic.expires_at:
            raise SubscriptionRequired('License period has expired.')
        raise SubscriptionRequired('No active subscription or license period.')

    return lic, machine_id_hash


def verify_machine_request(request):
    """
    Validate a machine-secret-signed request. No license key needed on the client.
    The machine_secret (issued at activation) is used as the HMAC key.

    Expected headers: X-Machine-ID, X-Product-Slug, X-Timestamp, X-Nonce, X-Signature.
    Signature = HMAC-SHA256(machine_secret, machine_id_hash + product_slug + timestamp + nonce).

    Returns (LicenseKey, LicenseMachine) or raises a DRF exception.

    # TODO (Step 2): add per-machine server challenge rotation to catch VM clones.
    # At check-in, client includes current server_challenge in the HMAC message.
    # Server rotates server_challenge after each successful check-in.
    # A clone using a stale challenge fails after the legitimate machine checks in first.
    # Requires storing server_challenge on LicenseMachine and a recovery path for
    # desync (e.g. re-activation via install token).
    """
    machine_id_hash = request.headers.get('X-Machine-ID', '')
    product_slug    = request.headers.get('X-Product-Slug', '')
    timestamp_str   = request.headers.get('X-Timestamp', '')
    nonce           = request.headers.get('X-Nonce', '')
    signature       = request.headers.get('X-Signature', '')

    if not all([machine_id_hash, product_slug, timestamp_str, nonce, signature]):
        raise PermissionDenied('Missing required headers.')

    try:
        ts = int(timestamp_str)
    except ValueError:
        raise PermissionDenied('Invalid timestamp.')

    if abs(int(time.time()) - ts) > 300:
        raise PermissionDenied('Request timestamp out of range.')

    nonce_cache_key = f'lic_mnonce:{nonce}'
    if cache.get(nonce_cache_key):
        raise PermissionDenied('Duplicate nonce — replay detected.')
    cache.set(nonce_cache_key, 1, timeout=600)

    candidates = list(
        LicenseMachine.objects
        .select_related('license__product', 'license__subscription', 'license__user')
        .filter(
            machine_id_hash=machine_id_hash,
            license__product__slug=product_slug,
            is_active=True,
        )
    )
    if not candidates:
        raise NotFound('Machine not registered for this product.')

    msg     = f'{machine_id_hash}{product_slug}{timestamp_str}{nonce}'.encode()
    machine = None
    for candidate in candidates:
        if not candidate.machine_secret:
            continue
        expected = hmac.new(candidate.machine_secret.encode(), msg, hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, signature.lower()):
            machine = candidate
            break

    if machine is None:
        raise PermissionDenied('Invalid signature.')

    lic = machine.license
    if not lic.is_active:
        raise SubscriptionRequired('License is inactive.')

    now               = datetime.now(tz=timezone.utc)
    has_active_expiry = bool(lic.expires_at and lic.expires_at > now)

    has_active_sub = False
    if lic.subscription_id:
        sub = lic.subscription
        if sub.status in (ACTIVE_STATUSES | GRACE_STATUSES):
            if sub.items.filter(stripe_product_id=lic.product.stripe_product_id).exists():
                has_active_sub = True

    if not has_active_sub and not has_active_expiry:
        if lic.subscription_id:
            raise SubscriptionRequired(f'Subscription status is {lic.subscription.status!r}.')
        if lic.expires_at:
            raise SubscriptionRequired('License period has expired.')
        raise SubscriptionRequired('No active subscription or license period.')

    return lic, machine


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

    # Cap at subscription period end if subscription-backed.
    if lic.subscription_id and lic.subscription.current_period_end:
        cap = lic.subscription.current_period_end
        if cap < now:
            grace_days = getattr(settings, 'LICENSE_GRACE_PERIOD_DAYS', 5)
            cap = now + timedelta(days=grace_days)
        expires_at = min(expires_at, cap)

    # Also cap at prepay expiry if set (takes effect when no subscription or subscription has lapsed).
    if lic.expires_at:
        expires_at = min(expires_at, lic.expires_at)

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
    """Auto-create or re-activate a LicenseKey for each product in the subscription."""
    if subscription.status not in ACTIVE_STATUSES:
        return

    product_ids = list(subscription.items.values_list('stripe_product_id', flat=True))
    products    = Product.objects.filter(stripe_product_id__in=product_ids)

    for product in products:
        lic, created = LicenseKey.objects.get_or_create(
            user=user,
            product=product,
            defaults={
                'subscription':     subscription,
                'max_machines':     getattr(settings, 'LICENSE_DEFAULT_MAX_MACHINES', 1),
                'offline_ttl_days': getattr(settings, 'LICENSE_DEFAULT_OFFLINE_TTL_DAYS', 30),
            },
        )
        if not created:
            update_fields = ['subscription']
            if not lic.is_active:
                lic.is_active = True
                update_fields.append('is_active')
                logger.info('Reactivated license key %s for user %s', lic.key, user.pk)
            lic.subscription = subscription
            lic.save(update_fields=update_fields)
        else:
            logger.info('Created license key %s for user %s, product %s', lic.key, user.pk, product.slug)


def _on_subscription_cancelled(sender, user, subscription, **kwargs):
    """Deactivate LicenseKeys for all products in the cancelled subscription."""
    product_ids = list(subscription.items.values_list('stripe_product_id', flat=True))
    products    = Product.objects.filter(stripe_product_id__in=product_ids)
    updated     = LicenseKey.objects.filter(user=user, product__in=products, is_active=True).update(is_active=False)
    if updated:
        logger.info('Deactivated %d license key(s) for user %s', updated, user.pk)
