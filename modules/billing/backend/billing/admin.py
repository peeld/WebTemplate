from django.contrib import admin
from .models import StripeCustomer, Subscription


@admin.register(StripeCustomer)
class StripeCustomerAdmin(admin.ModelAdmin):
    list_display = ('user', 'stripe_customer_id', 'created_at')
    search_fields = ('user__username', 'user__email', 'stripe_customer_id')
    readonly_fields = ('created_at',)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('customer', 'status', 'stripe_price_id', 'current_period_end', 'cancel_at_period_end')
    list_filter = ('status',)
    search_fields = ('customer__user__username', 'stripe_subscription_id')
    readonly_fields = ('updated_at',)
