import uuid

from django.conf import settings
from django.db import models


class Product(models.Model):
    FULFILLMENT_CHOICES = [
        ('digital',  'Digital'),
        ('physical', 'Physical'),
    ]

    name              = models.CharField(max_length=255)
    slug              = models.SlugField(unique=True)
    description       = models.TextField(blank=True)
    thumbnail         = models.URLField(blank=True)
    features          = models.JSONField(default=list, blank=True, help_text='List of feature strings')
    stripe_product_id = models.CharField(max_length=255, blank=True)
    fulfillment_type  = models.CharField(max_length=20, choices=FULFILLMENT_CHOICES, default='digital')
    is_active         = models.BooleanField(default=True)
    sort_order        = models.PositiveIntegerField(default=0)
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class ProductPrice(models.Model):
    PRICE_TYPE_CHOICES = [
        ('one_time',  'One-time'),
        ('recurring', 'Recurring'),
    ]
    INTERVAL_CHOICES = [
        ('week',  'Weekly'),
        ('month', 'Monthly'),
        ('year',  'Annual'),
    ]

    product         = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='prices')
    stripe_price_id = models.CharField(max_length=255, blank=True)
    amount          = models.PositiveIntegerField(help_text='Price in cents')
    currency        = models.CharField(max_length=3, default='usd')
    price_type      = models.CharField(max_length=20, choices=PRICE_TYPE_CHOICES, default='recurring')
    interval        = models.CharField(max_length=10, choices=INTERVAL_CHOICES, blank=True)
    days_granted    = models.PositiveIntegerField(null=True, blank=True, help_text='Days of license access granted by a one-time purchase')
    is_active       = models.BooleanField(default=True)

    class Meta:
        ordering = ['price_type', 'interval']
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'interval'],
                condition=models.Q(price_type='recurring'),
                name='unique_recurring_price_per_interval',
            )
        ]

    def __str__(self):
        if self.price_type == 'one_time':
            return f'{self.product.name} — one-time'
        return f'{self.product.name} — {self.interval}'


class ProductImage(models.Model):
    product    = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image      = models.FileField(upload_to='product_images/')
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'created_at']

    def __str__(self):
        return f'{self.product.name} image {self.pk}'


class StripeCustomer(models.Model):
    user               = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='stripe_customer')
    stripe_customer_id = models.CharField(max_length=255, unique=True)
    created_at         = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user} — {self.stripe_customer_id}'


# Stripe models subscriptions as a two-level hierarchy:
#   Customer → Subscription(s) → SubscriptionItem(s)
# A customer can hold multiple independent subscriptions (e.g. separate products
# or billing intervals). Each subscription contains one or more items — one per
# price/product line. We mirror this structure so licenses can be granted per
# product independently of each other.

class Subscription(models.Model):
    STATUS_CHOICES = [
        ('active',             'Active'),
        ('trialing',           'Trialing'),
        ('past_due',           'Past Due'),
        ('canceled',           'Canceled'),
        ('incomplete',         'Incomplete'),
        ('unpaid',             'Unpaid'),
        ('paused',             'Paused'),
        ('incomplete_expired', 'Incomplete (Expired)'),
    ]

    customer               = models.ForeignKey(StripeCustomer, on_delete=models.CASCADE, related_name='subscriptions')
    stripe_subscription_id = models.CharField(max_length=255, unique=True)
    status                 = models.CharField(max_length=20, choices=STATUS_CHOICES)
    current_period_end     = models.DateTimeField()
    cancel_at_period_end   = models.BooleanField(default=False)
    updated_at             = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.customer.user} — {self.status}'


class SubscriptionItem(models.Model):
    subscription      = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name='items')
    stripe_price_id   = models.CharField(max_length=255)
    stripe_product_id = models.CharField(max_length=255)
    quantity          = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = [('subscription', 'stripe_price_id')]

    def __str__(self):
        return f'{self.subscription} — {self.stripe_price_id}'


class LicenseKey(models.Model):
    user             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='license_keys')
    product          = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='license_keys')
    subscription     = models.ForeignKey('Subscription', null=True, blank=True, on_delete=models.SET_NULL, related_name='license_keys')
    key              = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    is_active        = models.BooleanField(default=True)
    expires_at       = models.DateTimeField(null=True, blank=True, help_text='Expiry for prepay (non-subscription) licenses; stacks on each purchase')
    max_machines     = models.PositiveIntegerField(default=1)
    offline_ttl_days = models.PositiveIntegerField(default=30)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'product')]
        verbose_name        = 'License'
        verbose_name_plural = 'Licenses'

    def __str__(self):
        return f'{self.user} — {self.product.name} ({self.key})'


class InstallToken(models.Model):
    token      = models.CharField(max_length=19, unique=True)
    license    = models.ForeignKey(LicenseKey, on_delete=models.CASCADE, related_name='install_tokens')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at    = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.license} — {self.token}'


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
        return f'{self.license.user} — {self.label or self.machine_id_hash[:16]}'
