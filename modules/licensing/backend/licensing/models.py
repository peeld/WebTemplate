import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def _generate_install_token():
    """Return a XXXX-XXXX-XXXX-XXXX format install token."""
    return '-'.join(secrets.token_hex(2).upper() for _ in range(4))


def _hash_token(raw_token):
    """SHA-256 hex digest of a raw install token for DB storage."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


class LicenseKey(models.Model):
    user             = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='license_keys',
    )
    product          = models.ForeignKey('billing.Product', on_delete=models.CASCADE, related_name='license_keys')
    subscription     = models.ForeignKey(
        'billing.Subscription',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='license_keys',
    )
    key              = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    is_active        = models.BooleanField(default=True)
    expires_at       = models.DateTimeField(null=True, blank=True, help_text='Expiry for prepay (non-subscription) licenses; stacks on each purchase')
    max_machines     = models.PositiveIntegerField(default=1)
    offline_ttl_days = models.PositiveIntegerField(default=30)
    source           = models.CharField(
        max_length=10,
        choices=[('stripe', 'Stripe'), ('vendor', 'Vendor')],
        default='stripe',
    )
    vendor_pool      = models.ForeignKey(
        'VendorLicensePool',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='license_keys',
    )
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'License'
        verbose_name_plural = 'Licenses'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'product'],
                condition=models.Q(user__isnull=False),
                name='unique_user_product_license',
            ),
        ]

    def __str__(self):
        user_part = str(self.user) if self.user else 'anon'
        return f'{user_part} — {self.product.name} ({self.key})'


class InstallToken(models.Model):
    token      = models.CharField(max_length=64, unique=True)  # SHA-256 hex of raw token
    license    = models.ForeignKey(LicenseKey, on_delete=models.CASCADE, related_name='install_tokens')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at    = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.license} — [token]'


class LicenseMachine(models.Model):
    license         = models.ForeignKey(LicenseKey, on_delete=models.CASCADE, related_name='machines')
    machine_id_hash = models.CharField(max_length=64)
    label           = models.CharField(max_length=255, blank=True)
    machine_secret  = models.CharField(max_length=64, blank=True, default='')
    first_seen      = models.DateTimeField(auto_now_add=True)
    last_seen       = models.DateTimeField(auto_now=True)
    is_active       = models.BooleanField(default=True)

    class Meta:
        unique_together = [('license', 'machine_id_hash')]

    def __str__(self):
        return f'{self.license.product.name} — {self.label or self.machine_id_hash[:16]}'


class VendorProfile(models.Model):
    org          = models.OneToOneField(
        'orgs.Organization',
        on_delete=models.CASCADE,
        related_name='vendor_profile',
    )
    discount_pct = models.DecimalField(max_digits=5, decimal_places=4, default='0.0000')
    is_active    = models.BooleanField(default=True)
    notes        = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'VendorProfile({self.org})'


class VendorLicensePool(models.Model):
    vendor          = models.ForeignKey(VendorProfile, on_delete=models.CASCADE, related_name='pools')
    product         = models.ForeignKey('billing.Product', on_delete=models.CASCADE)
    price           = models.ForeignKey('billing.ProductPrice', on_delete=models.PROTECT)
    seats_purchased = models.PositiveIntegerField()
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('vendor', 'price')]

    @property
    def seats_issued(self):
        return self.license_keys.count()

    @property
    def seats_remaining(self):
        return self.seats_purchased - self.seats_issued

    def __str__(self):
        return f'VendorPool({self.vendor.org} — {self.product})'


class VendorInstallTokenManager(models.Manager):
    def create_for_pool(self, pool, label=''):
        """Create a token for the pool. Returns (instance, raw_token) — raw_token is shown once."""
        if pool.seats_remaining <= 0:
            raise ValidationError('No seats remaining in this vendor pool.')
        price = pool.price
        if price.price_type == 'one_time' and price.days_granted:
            expires_at      = timezone.now() + timedelta(days=price.days_granted)
            offline_ttl_days = price.days_granted
        else:
            expires_at       = None
            offline_ttl_days = 30
        license_key = LicenseKey.objects.create(
            user=None,
            product=pool.product,
            source='vendor',
            vendor_pool=pool,
            is_active=True,
            max_machines=1,
            expires_at=expires_at,
            offline_ttl_days=offline_ttl_days,
        )
        raw_token = _generate_install_token()
        instance = self.create(pool=pool, token=_hash_token(raw_token), license_key=license_key, label=label)
        return instance, raw_token


class VendorInstallToken(models.Model):
    pool        = models.ForeignKey(VendorLicensePool, on_delete=models.CASCADE, related_name='tokens')
    token       = models.CharField(max_length=64, unique=True)  # SHA-256 hex of raw token
    license_key = models.OneToOneField(
        LicenseKey,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='vendor_install_token',
    )
    label       = models.CharField(max_length=255, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    redeemed_at = models.DateTimeField(null=True, blank=True)

    objects = VendorInstallTokenManager()

    def __str__(self):
        return f'VendorToken({self.pool.vendor.org} — {self.token})'


class VendorInvoice(models.Model):
    STATUS_DRAFT  = 'draft'
    STATUS_ISSUED = 'issued'
    STATUS_PAID   = 'paid'
    STATUS_VOID   = 'void'
    STATUS_CHOICES = [
        (STATUS_DRAFT,  'Draft'),
        (STATUS_ISSUED, 'Issued'),
        (STATUS_PAID,   'Paid'),
        (STATUS_VOID,   'Void'),
    ]

    vendor       = models.ForeignKey(VendorProfile, on_delete=models.CASCADE, related_name='invoices')
    period_start = models.DateField()
    period_end   = models.DateField()
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    issued_at    = models.DateTimeField(null=True, blank=True)
    paid_at      = models.DateTimeField(null=True, blank=True)
    notes        = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Invoice({self.vendor.org} {self.period_start}–{self.period_end} [{self.status}])'


class VendorInvoiceLineItem(models.Model):
    invoice      = models.ForeignKey(VendorInvoice, on_delete=models.CASCADE, related_name='line_items')
    product      = models.ForeignKey('billing.Product', on_delete=models.PROTECT)
    seats_used   = models.PositiveIntegerField()
    unit_price   = models.PositiveIntegerField(help_text='Cents; snapshot from ProductPrice.amount at invoice time')
    discount_pct = models.DecimalField(max_digits=5, decimal_places=4, help_text='Snapshot from VendorProfile at invoice time')
    line_total   = models.PositiveIntegerField(help_text='Cents; seats_used * unit_price * (1 - discount_pct)')

    def __str__(self):
        return f'LineItem({self.invoice} — {self.product})'
