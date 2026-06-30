import hashlib
import hmac
import logging
import secrets
import time
from datetime import timedelta

import jwt
from django.apps import apps
from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from django.db import transaction

from .models import (
    InstallToken, LicenseKey, LicenseMachine,
    VendorInstallToken, VendorInvoice, VendorInvoiceLineItem,
    VendorLicensePool, VendorProfile,
    _generate_install_token, _hash_token,
)
from .serializers import (
    AdminLicenseSerializer,
    UserLicenseSerializer,
    VendorInstallTokenSerializer,
    VendorInvoiceSerializer,
    VendorLicensePoolSerializer,
    VendorProfileSerializer,
)

logger = logging.getLogger(__name__)

_REPLAY_WINDOW = 300  # seconds


def _verify_legacy_hmac(request):
    """Verify X-Signature for license-key-based requests.

    message = X-License-Key + X-Timestamp + X-Nonce + X-Machine-ID
    sig = HMAC-SHA256(LICENSE_APP_SECRET, message)

    Returns (license_key_str, machine_id_hash) or raises ValueError.
    """
    license_key = request.META.get('HTTP_X_LICENSE_KEY', '')
    machine_id  = request.META.get('HTTP_X_MACHINE_ID', '')
    timestamp   = request.META.get('HTTP_X_TIMESTAMP', '')
    nonce       = request.META.get('HTTP_X_NONCE', '')
    signature   = request.META.get('HTTP_X_SIGNATURE', '')

    if not all([license_key, machine_id, timestamp, nonce, signature]):
        raise ValueError('Missing required auth headers')

    try:
        ts = int(timestamp)
    except (ValueError, TypeError):
        raise ValueError('Invalid timestamp')

    if abs(int(time.time()) - ts) > _REPLAY_WINDOW:
        raise ValueError('Request timestamp out of window')

    app_secret = getattr(settings, 'LICENSE_APP_SECRET', '')
    if not app_secret:
        raise ValueError('LICENSE_APP_SECRET not configured')

    msg = (license_key + timestamp + nonce + machine_id).encode()
    expected = hmac.new(app_secret.encode(), msg, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ValueError('Invalid signature')

    return license_key, machine_id


def _issue_jwt(license_key_obj, machine):
    """Sign and return (token_str, expires_at_iso) for a verified machine."""
    ttl_days = license_key_obj.offline_ttl_days or getattr(settings, 'LICENSE_DEFAULT_OFFLINE_TTL_DAYS', 30)
    exp = timezone.now() + timedelta(days=ttl_days)

    payload = {
        'license': str(license_key_obj.key),
        'machine': machine.machine_id_hash,
        'product': license_key_obj.product.slug,
        'iat':     int(timezone.now().timestamp()),
        'exp':     int(exp.timestamp()),
    }

    private_key = apps.get_app_config('licensing').private_key
    token = jwt.encode(payload, private_key, algorithm='RS256')

    return token, exp.isoformat()


class LicenseKeyView(APIView):
    """List active license keys for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        keys = (
            LicenseKey.objects
            .filter(user=request.user, is_active=True)
            .select_related('product')
            .prefetch_related('machines')
        )
        return Response(UserLicenseSerializer(keys, many=True).data)


class LicenseMachineView(APIView):
    """List machines registered against one of the user's license keys."""
    permission_classes = [IsAuthenticated]

    def get(self, request, key):
        try:
            license_key = LicenseKey.objects.get(key=key, user=request.user)
        except LicenseKey.DoesNotExist:
            return Response({'error': 'License key not found.'}, status=404)
        from .serializers import LicenseMachineSerializer
        return Response(LicenseMachineSerializer(license_key.machines.all(), many=True).data)


class InstallTokenView(APIView):
    """Create a single-use install token for one of the user's license keys."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        key_uuid = request.data.get('license_key')
        if not key_uuid:
            return Response({'error': 'license_key is required.'}, status=400)

        try:
            license_key = LicenseKey.objects.get(key=key_uuid, user=request.user, is_active=True)
        except LicenseKey.DoesNotExist:
            return Response({'error': 'License key not found.'}, status=404)

        expires = timezone.now() + timedelta(days=7)
        raw_token = _generate_install_token()
        InstallToken.objects.create(
            license=license_key,
            token=_hash_token(raw_token),
            expires_at=expires,
        )
        return Response({'token': raw_token, 'expires_at': expires.isoformat()}, status=201)


class InstallTokenExchangeThrottle(AnonRateThrottle):
    rate = '10/hour'


class InstallTokenExchangeView(APIView):
    """Exchange a single-use install token for the associated license key UUID.

    Checks InstallToken first; falls through to VendorInstallToken if not found.
    """
    permission_classes = [AllowAny]
    throttle_classes = [InstallTokenExchangeThrottle]

    def post(self, request):
        token_str = request.data.get('token', '')
        if not token_str:
            return Response({'error': 'token is required.'}, status=400)

        token_hash = _hash_token(token_str)

        # --- Regular install token path ---
        try:
            install_token = (
                InstallToken.objects
                .select_related('license__product')
                .get(token=token_hash)
            )
        except InstallToken.DoesNotExist:
            install_token = None

        if install_token is not None:
            if install_token.used_at:
                return Response({'error': 'Token already used.'}, status=400)

            if install_token.expires_at < timezone.now():
                return Response({'error': 'Token expired.'}, status=400)

            if not install_token.license.is_active:
                return Response({'error': 'License is not active.'}, status=400)

            install_token.used_at = timezone.now()
            install_token.save(update_fields=['used_at'])

            product = install_token.license.product
            return Response({
                'license_key':   str(install_token.license.key),
                'product_slug':  product.slug,
                'product_name':  product.name,
            })

        # --- Vendor install token fallthrough ---
        try:
            vendor_token = (
                VendorInstallToken.objects
                .select_related('license_key__product')
                .get(token=token_hash)
            )
        except VendorInstallToken.DoesNotExist:
            logger.warning('install-token exchange: token not found')
            return Response({'error': 'Invalid token.'}, status=404)

        if vendor_token.redeemed_at is not None:
            return Response({'error': 'Token already used.'}, status=400)

        if vendor_token.license_key is None or not vendor_token.license_key.is_active:
            return Response({'error': 'License is not active.'}, status=400)

        vendor_token.redeemed_at = timezone.now()
        vendor_token.save(update_fields=['redeemed_at'])

        product = vendor_token.license_key.product
        return Response({
            'license_key':   str(vendor_token.license_key.key),
            'product_slug':  product.slug,
            'product_name':  product.name,
        })


class LicenseActivateView(APIView):
    """Register a machine and issue an offline JWT. Uses legacy HMAC auth."""
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            license_key_str, machine_id_hash = _verify_legacy_hmac(request)
        except ValueError as e:
            return Response({'error': str(e)}, status=401)

        machine_label = request.data.get('machine_label', '')

        try:
            license_key = LicenseKey.objects.select_related('product').get(key=license_key_str)
        except LicenseKey.DoesNotExist:
            return Response({'error': 'License key not found.'}, status=404)

        if not license_key.is_active:
            return Response({'error': 'License is not active.'}, status=403)

        if license_key.expires_at and license_key.expires_at < timezone.now():
            return Response({'error': 'License has expired.'}, status=403)

        try:
            machine = LicenseMachine.objects.get(license=license_key, machine_id_hash=machine_id_hash)
            if not machine.is_active:
                return Response({'error': 'Machine is deactivated.'}, status=403)
            if machine_label and machine.label != machine_label:
                machine.label = machine_label
            machine.save()
        except LicenseMachine.DoesNotExist:
            active_count = license_key.machines.filter(is_active=True).count()
            if active_count >= license_key.max_machines:
                return Response({'error': 'Machine limit reached.'}, status=403)
            machine = LicenseMachine.objects.create(
                license=license_key,
                machine_id_hash=machine_id_hash,
                label=machine_label,
                machine_secret=secrets.token_hex(32),
                is_active=True,
            )

        token, expires_at = _issue_jwt(license_key, machine)
        machines_used = license_key.machines.filter(is_active=True).count()

        logger.info('License activated: key=%s machine=%s', str(license_key.key)[:8], machine_id_hash[:8])
        return Response({
            'token':          token,
            'expires_at':     expires_at,
            'machine_secret': machine.machine_secret,
            'machines_used':  machines_used,
            'max_machines':   license_key.max_machines,
        })


class LicenseCheckView(APIView):
    """Legacy checkin: renew offline JWT using license-key HMAC headers."""
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            license_key_str, machine_id_hash = _verify_legacy_hmac(request)
        except ValueError as e:
            return Response({'error': str(e)}, status=401)

        try:
            license_key = LicenseKey.objects.select_related('product').get(key=license_key_str)
        except LicenseKey.DoesNotExist:
            return Response({'error': 'License key not found.'}, status=404)

        if not license_key.is_active:
            return Response({'error': 'License is not active.'}, status=403)

        if license_key.expires_at and license_key.expires_at < timezone.now():
            return Response({'error': 'License has expired.'}, status=403)

        try:
            machine = LicenseMachine.objects.get(
                license=license_key,
                machine_id_hash=machine_id_hash,
                is_active=True,
            )
        except LicenseMachine.DoesNotExist:
            return Response({'error': 'Machine not registered.'}, status=404)

        machine.save()  # update last_seen
        token, expires_at = _issue_jwt(license_key, machine)
        return Response({'token': token, 'expires_at': expires_at})


class MachineCheckinView(APIView):
    """Renew offline JWT using machine_secret — preferred over legacy checkin."""
    permission_classes = [AllowAny]

    def post(self, request):
        machine_id   = request.META.get('HTTP_X_MACHINE_ID', '')
        product_slug = request.META.get('HTTP_X_PRODUCT_SLUG', '')
        timestamp    = request.META.get('HTTP_X_TIMESTAMP', '')
        nonce        = request.META.get('HTTP_X_NONCE', '')
        signature    = request.META.get('HTTP_X_SIGNATURE', '')

        if not all([machine_id, product_slug, timestamp, nonce, signature]):
            return Response({'error': 'Missing required auth headers.'}, status=401)

        try:
            ts = int(timestamp)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid timestamp.'}, status=401)

        if abs(int(time.time()) - ts) > _REPLAY_WINDOW:
            return Response({'error': 'Request timestamp out of window.'}, status=401)

        Product = apps.get_model('billing', 'Product')
        try:
            product = Product.objects.get(slug=product_slug)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        candidates = list(
            LicenseMachine.objects
            .select_related('license__product')
            .filter(machine_id_hash=machine_id, license__product=product, is_active=True)
        )
        if not candidates:
            return Response({'error': 'Machine not registered.'}, status=404)

        # A machine may have multiple LicenseMachine rows (e.g. multiple vendor tokens
        # redeemed on the same machine). The machine_secret in the HMAC identifies which one.
        msg = (machine_id + product_slug + timestamp + nonce).encode()
        machine = None
        for m in candidates:
            if m.machine_secret:
                expected = hmac.new(m.machine_secret.encode(), msg, hashlib.sha256).hexdigest()
                if hmac.compare_digest(expected, signature):
                    machine = m
                    break

        if machine is None:
            return Response({'error': 'Invalid signature.'}, status=401)

        license_key = machine.license
        if not license_key.is_active:
            return Response({'error': 'License is not active.'}, status=403)

        if license_key.expires_at and license_key.expires_at < timezone.now():
            return Response({'error': 'License has expired.'}, status=403)

        machine.save()  # update last_seen
        token, expires_at = _issue_jwt(license_key, machine)
        return Response({'token': token, 'expires_at': expires_at})


class AdminLicenseListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        keys = (
            LicenseKey.objects
            .select_related('product', 'user')
            .prefetch_related('machines')
            .order_by('-created_at')
        )
        return Response(AdminLicenseSerializer(keys, many=True).data)


# ---------------------------------------------------------------------------
# Vendor endpoints — authenticated, any org member
# ---------------------------------------------------------------------------

def _get_user_org_ids(user):
    Membership = apps.get_model('orgs', 'Membership')
    return list(Membership.objects.filter(user=user).values_list('org_id', flat=True))


def _vendor_pool_for_user(pk, user):
    """Return the VendorLicensePool with given pk that belongs to one of the user's orgs."""
    org_ids = _get_user_org_ids(user)
    return VendorLicensePool.objects.select_related('vendor__org', 'product', 'price').get(
        pk=pk, vendor__org_id__in=org_ids, vendor__is_active=True,
    )


class VendorPoolListView(APIView):
    """List all vendor pools for orgs the requesting user belongs to."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org_ids = _get_user_org_ids(request.user)
        pools = (
            VendorLicensePool.objects
            .filter(vendor__org_id__in=org_ids, vendor__is_active=True)
            .select_related('vendor__org', 'product', 'price')
        )
        return Response(VendorLicensePoolSerializer(pools, many=True).data)


class VendorTokenView(APIView):
    """GET: list tokens for a pool; POST: create tokens from a pool."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            pool = _vendor_pool_for_user(pk, request.user)
        except VendorLicensePool.DoesNotExist:
            return Response({'error': 'Pool not found.'}, status=404)
        tokens = pool.tokens.select_related('license_key').order_by('-created_at')
        return Response(VendorInstallTokenSerializer(tokens, many=True).data)

    def post(self, request, pk):
        try:
            pool = _vendor_pool_for_user(pk, request.user)
        except VendorLicensePool.DoesNotExist:
            return Response({'error': 'Pool not found.'}, status=404)

        try:
            count = int(request.data.get('count', 1))
        except (TypeError, ValueError):
            return Response({'error': 'count must be an integer.'}, status=400)

        if not (1 <= count <= 100):
            return Response({'error': 'count must be between 1 and 100.'}, status=400)

        label = str(request.data.get('label', ''))

        if pool.seats_remaining < count:
            return Response(
                {'error': f'Only {pool.seats_remaining} seat(s) remaining in this pool.'},
                status=400,
            )

        created_tokens = []
        with transaction.atomic():
            for _ in range(count):
                _instance, raw_token = VendorInstallToken.objects.create_for_pool(pool, label=label)
                created_tokens.append(raw_token)

        return Response({'tokens': created_tokens}, status=201)


class VendorTokenDetailView(APIView):
    """DELETE: revoke an unredeemed vendor install token and free the seat."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, token_pk):
        try:
            pool = _vendor_pool_for_user(pk, request.user)
        except VendorLicensePool.DoesNotExist:
            return Response({'error': 'Pool not found.'}, status=404)

        try:
            token = pool.tokens.select_related('license_key').get(pk=token_pk)
        except VendorInstallToken.DoesNotExist:
            return Response({'error': 'Token not found.'}, status=404)

        if token.redeemed_at is not None:
            return Response({'error': 'Token has already been redeemed and cannot be revoked.'}, status=400)

        license_key = token.license_key
        with transaction.atomic():
            token.delete()
            if license_key is not None:
                license_key.delete()

        logger.info('Vendor token %s revoked by user %s (pool=%s)', token_pk, request.user.pk, pk)
        return Response(status=204)


# ---------------------------------------------------------------------------
# Admin vendor / invoice endpoints — is_staff only
# ---------------------------------------------------------------------------

class AdminVendorListView(APIView):
    """GET: list all VendorProfiles. POST: create one."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        vendors = VendorProfile.objects.select_related('org').order_by('id')
        return Response(VendorProfileSerializer(vendors, many=True).data)

    def post(self, request):
        org_id = request.data.get('org_id')
        if not org_id:
            return Response({'error': 'org_id is required.'}, status=400)
        Organization = apps.get_model('orgs', 'Organization')
        try:
            org = Organization.objects.get(pk=org_id)
        except Organization.DoesNotExist:
            return Response({'error': 'Organization not found.'}, status=404)
        if VendorProfile.objects.filter(org=org).exists():
            return Response({'error': 'This org already has a VendorProfile.'}, status=400)
        vendor = VendorProfile.objects.create(
            org=org,
            discount_pct=request.data.get('discount_pct', '0.0000'),
            is_active=request.data.get('is_active', True),
            notes=request.data.get('notes', ''),
        )
        return Response(VendorProfileSerializer(VendorProfile.objects.select_related('org').get(pk=vendor.pk)).data, status=201)


class AdminVendorDetailView(APIView):
    """GET/PATCH/DELETE a single VendorProfile."""
    permission_classes = [IsAdminUser]

    def _get_vendor(self, pk):
        try:
            return VendorProfile.objects.select_related('org').get(pk=pk)
        except VendorProfile.DoesNotExist:
            return None

    def get(self, request, pk):
        vendor = self._get_vendor(pk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)
        return Response(VendorProfileSerializer(vendor).data)

    def patch(self, request, pk):
        vendor = self._get_vendor(pk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)
        for field in ('discount_pct', 'is_active', 'notes'):
            if field in request.data:
                setattr(vendor, field, request.data[field])
        vendor.save()
        return Response(VendorProfileSerializer(vendor).data)

    def delete(self, request, pk):
        vendor = self._get_vendor(pk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)
        vendor.delete()
        return Response(status=204)


class AdminVendorPoolListView(APIView):
    """GET: list pools for a vendor. POST: create a pool."""
    permission_classes = [IsAdminUser]

    def _get_vendor(self, vpk):
        try:
            return VendorProfile.objects.get(pk=vpk)
        except VendorProfile.DoesNotExist:
            return None

    def get(self, request, vpk):
        vendor = self._get_vendor(vpk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)
        pools = vendor.pools.select_related('vendor__org', 'product', 'price').order_by('id')
        return Response(VendorLicensePoolSerializer(pools, many=True).data)

    def post(self, request, vpk):
        vendor = self._get_vendor(vpk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)

        product_id = request.data.get('product')
        price_id = request.data.get('price')
        seats_purchased = request.data.get('seats_purchased')

        if not all([product_id, price_id, seats_purchased is not None]):
            return Response({'error': 'product, price, and seats_purchased are required.'}, status=400)

        try:
            seats_purchased = int(seats_purchased)
        except (TypeError, ValueError):
            return Response({'error': 'seats_purchased must be an integer.'}, status=400)

        if seats_purchased <= 0:
            return Response({'error': 'seats_purchased must be positive.'}, status=400)

        Product = apps.get_model('billing', 'Product')
        ProductPrice = apps.get_model('billing', 'ProductPrice')

        try:
            product = Product.objects.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        try:
            price = ProductPrice.objects.get(pk=price_id)
        except ProductPrice.DoesNotExist:
            return Response({'error': 'ProductPrice not found.'}, status=404)

        if VendorLicensePool.objects.filter(vendor=vendor, price=price).exists():
            return Response({'error': 'A pool for this price already exists for this vendor.'}, status=400)

        pool = VendorLicensePool.objects.create(
            vendor=vendor, product=product, price=price, seats_purchased=seats_purchased,
        )
        return Response(
            VendorLicensePoolSerializer(
                VendorLicensePool.objects.select_related('vendor__org', 'product', 'price').get(pk=pool.pk)
            ).data,
            status=201,
        )


class AdminVendorPoolDetailView(APIView):
    """GET/PATCH a single vendor pool."""
    permission_classes = [IsAdminUser]

    def _get_pool(self, vpk, pk):
        try:
            return (
                VendorLicensePool.objects
                .select_related('vendor__org', 'product', 'price')
                .get(pk=pk, vendor_id=vpk)
            )
        except VendorLicensePool.DoesNotExist:
            return None

    def get(self, request, vpk, pk):
        pool = self._get_pool(vpk, pk)
        if pool is None:
            return Response({'error': 'Pool not found.'}, status=404)
        return Response(VendorLicensePoolSerializer(pool).data)

    def patch(self, request, vpk, pk):
        pool = self._get_pool(vpk, pk)
        if pool is None:
            return Response({'error': 'Pool not found.'}, status=404)
        if 'seats_purchased' in request.data:
            try:
                new_seats = int(request.data['seats_purchased'])
            except (TypeError, ValueError):
                return Response({'error': 'seats_purchased must be an integer.'}, status=400)
            if new_seats < pool.seats_issued:
                return Response(
                    {'error': f'Cannot reduce below seats already issued ({pool.seats_issued}).'},
                    status=400,
                )
            pool.seats_purchased = new_seats
        pool.save()
        return Response(VendorLicensePoolSerializer(pool).data)


class AdminVendorInvoiceListView(APIView):
    """GET: list invoices for a vendor. POST: generate a draft invoice."""
    permission_classes = [IsAdminUser]

    def _get_vendor(self, vpk):
        try:
            return VendorProfile.objects.get(pk=vpk)
        except VendorProfile.DoesNotExist:
            return None

    def get(self, request, vpk):
        vendor = self._get_vendor(vpk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)
        invoices = vendor.invoices.prefetch_related('line_items__product').order_by('-period_start')
        return Response(VendorInvoiceSerializer(invoices, many=True).data)

    def post(self, request, vpk):
        from collections import defaultdict
        from datetime import date

        vendor = self._get_vendor(vpk)
        if vendor is None:
            return Response({'error': 'Vendor not found.'}, status=404)

        period_start_str = request.data.get('period_start')
        period_end_str = request.data.get('period_end')
        if not period_start_str or not period_end_str:
            return Response({'error': 'period_start and period_end are required.'}, status=400)

        try:
            period_start = date.fromisoformat(str(period_start_str))
            period_end = date.fromisoformat(str(period_end_str))
        except (ValueError, TypeError):
            return Response({'error': 'period_start and period_end must be YYYY-MM-DD.'}, status=400)

        if period_end < period_start:
            return Response({'error': 'period_end must be on or after period_start.'}, status=400)

        overlapping = VendorInvoice.objects.filter(
            vendor=vendor,
            period_start__lte=period_end,
            period_end__gte=period_start,
        ).exclude(status=VendorInvoice.STATUS_VOID)
        if overlapping.exists():
            return Response(
                {'error': 'An invoice already exists for an overlapping period.'},
                status=400,
            )

        tokens = (
            VendorInstallToken.objects
            .filter(
                pool__vendor=vendor,
                redeemed_at__date__gte=period_start,
                redeemed_at__date__lte=period_end,
            )
            .select_related('pool__product', 'pool__price')
        )
        if not tokens.exists():
            return Response({'error': 'No redeemed tokens found in this period.'}, status=400)

        product_groups = defaultdict(lambda: {'tokens': [], 'price': None, 'product': None})
        for tok in tokens:
            key = tok.pool.product_id
            product_groups[key]['tokens'].append(tok)
            product_groups[key]['price'] = tok.pool.price
            product_groups[key]['product'] = tok.pool.product

        with transaction.atomic():
            invoice = VendorInvoice.objects.create(
                vendor=vendor,
                period_start=period_start,
                period_end=period_end,
                status=VendorInvoice.STATUS_DRAFT,
                notes=request.data.get('notes', ''),
            )
            for group in product_groups.values():
                seats_used = len(group['tokens'])
                unit_price = group['price'].amount
                discount_pct = vendor.discount_pct
                line_total = round(seats_used * unit_price * (1 - float(discount_pct)))
                VendorInvoiceLineItem.objects.create(
                    invoice=invoice,
                    product=group['product'],
                    seats_used=seats_used,
                    unit_price=unit_price,
                    discount_pct=discount_pct,
                    line_total=line_total,
                )

        result = VendorInvoice.objects.prefetch_related('line_items__product').get(pk=invoice.pk)
        return Response(VendorInvoiceSerializer(result).data, status=201)


class AdminVendorInvoiceDetailView(APIView):
    """GET/PATCH a single vendor invoice. PATCH accepts action: issue|pay|void."""
    permission_classes = [IsAdminUser]

    def _get_invoice(self, vpk, pk):
        try:
            return (
                VendorInvoice.objects
                .prefetch_related('line_items__product')
                .get(pk=pk, vendor_id=vpk)
            )
        except VendorInvoice.DoesNotExist:
            return None

    def get(self, request, vpk, pk):
        invoice = self._get_invoice(vpk, pk)
        if invoice is None:
            return Response({'error': 'Invoice not found.'}, status=404)
        return Response(VendorInvoiceSerializer(invoice).data)

    def patch(self, request, vpk, pk):
        invoice = self._get_invoice(vpk, pk)
        if invoice is None:
            return Response({'error': 'Invoice not found.'}, status=404)

        action = request.data.get('action')
        if action:
            now = timezone.now()
            if action == 'issue':
                if invoice.status != VendorInvoice.STATUS_DRAFT:
                    return Response({'error': 'Only draft invoices can be issued.'}, status=400)
                invoice.status = VendorInvoice.STATUS_ISSUED
                invoice.issued_at = now
                invoice.save(update_fields=['status', 'issued_at'])
            elif action == 'pay':
                if invoice.status != VendorInvoice.STATUS_ISSUED:
                    return Response({'error': 'Only issued invoices can be marked paid.'}, status=400)
                invoice.status = VendorInvoice.STATUS_PAID
                invoice.paid_at = now
                invoice.save(update_fields=['status', 'paid_at'])
            elif action == 'void':
                if invoice.status == VendorInvoice.STATUS_VOID:
                    return Response({'error': 'Invoice is already void.'}, status=400)
                invoice.status = VendorInvoice.STATUS_VOID
                invoice.save(update_fields=['status'])
            else:
                return Response({'error': f'Unknown action "{action}". Valid: issue, pay, void.'}, status=400)
        elif 'notes' in request.data:
            invoice.notes = request.data['notes']
            invoice.save(update_fields=['notes'])

        return Response(VendorInvoiceSerializer(invoice).data)
