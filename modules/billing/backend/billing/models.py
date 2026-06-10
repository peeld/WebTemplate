from django.conf import settings
from django.db import models


class StripeCustomer(models.Model):
    user             = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='stripe_customer')
    stripe_customer_id = models.CharField(max_length=255, unique=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user} — {self.stripe_customer_id}'


class Subscription(models.Model):
    STATUS_CHOICES = [
        ('active',     'Active'),
        ('trialing',   'Trialing'),
        ('past_due',   'Past Due'),
        ('canceled',   'Canceled'),
        ('incomplete', 'Incomplete'),
    ]

    customer               = models.OneToOneField(StripeCustomer, on_delete=models.CASCADE, related_name='subscription')
    stripe_subscription_id = models.CharField(max_length=255, unique=True)
    stripe_price_id        = models.CharField(max_length=255)
    stripe_product_id      = models.CharField(max_length=255)
    status                 = models.CharField(max_length=20, choices=STATUS_CHOICES)
    current_period_end     = models.DateTimeField()
    cancel_at_period_end   = models.BooleanField(default=False)
    updated_at             = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.customer.user} — {self.status}'
