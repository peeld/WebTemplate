from django.contrib import admin
from .models import LicenseKey, LicenseMachine, Product, ProductPrice, StripeCustomer, Subscription


class ProductPriceInline(admin.TabularInline):
    model  = ProductPrice
    extra  = 1
    fields = ('price_type', 'interval', 'stripe_price_id', 'amount', 'currency', 'is_active')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display        = ('name', 'fulfillment_type', 'stripe_product_id', 'is_active', 'sort_order')
    list_editable       = ('is_active', 'sort_order')
    list_filter         = ('is_active', 'fulfillment_type')
    search_fields       = ('name', 'stripe_product_id')
    prepopulated_fields = {'slug': ('name',)}
    inlines             = [ProductPriceInline]


@admin.register(ProductPrice)
class ProductPriceAdmin(admin.ModelAdmin):
    list_display  = ('product', 'price_type', 'interval', 'amount', 'currency', 'stripe_price_id', 'is_active')
    list_filter   = ('price_type', 'interval', 'is_active')
    search_fields = ('product__name', 'stripe_price_id')


@admin.register(StripeCustomer)
class StripeCustomerAdmin(admin.ModelAdmin):
    list_display  = ('user', 'stripe_customer_id', 'created_at')
    search_fields = ('user__username', 'user__email', 'stripe_customer_id')
    readonly_fields = ('created_at',)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display  = ('customer', 'status', 'stripe_price_id', 'current_period_end', 'cancel_at_period_end')
    list_filter   = ('status',)
    search_fields = ('customer__user__username', 'stripe_subscription_id')
    readonly_fields = ('updated_at',)


class LicenseMachineInline(admin.TabularInline):
    model        = LicenseMachine
    extra        = 0
    fields       = ('machine_id_hash', 'label', 'is_active', 'first_seen', 'last_seen')
    readonly_fields = ('machine_id_hash', 'first_seen', 'last_seen')


@admin.register(LicenseKey)
class LicenseKeyAdmin(admin.ModelAdmin):
    list_display    = ('user', 'product', 'key', 'is_active', 'max_machines', 'offline_ttl_days', 'created_at')
    list_filter     = ('is_active', 'product')
    search_fields   = ('user__username', 'user__email', 'key')
    readonly_fields = ('key', 'created_at')
    inlines         = [LicenseMachineInline]


@admin.register(LicenseMachine)
class LicenseMachineAdmin(admin.ModelAdmin):
    list_display    = ('license', 'machine_id_hash', 'label', 'is_active', 'last_seen')
    list_filter     = ('is_active',)
    search_fields   = ('license__user__username', 'machine_id_hash', 'label')
    readonly_fields = ('machine_id_hash', 'first_seen', 'last_seen')
