from django.contrib import admin
from django.utils import timezone
from .models import Product, ProductPrice, StripeCustomer, Subscription, SubscriptionItem


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


class SubscriptionItemInline(admin.TabularInline):
    model           = SubscriptionItem
    extra           = 0
    fields          = ('stripe_price_id', 'stripe_product_id', 'quantity')
    readonly_fields = ('stripe_price_id', 'stripe_product_id', 'quantity')


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display    = ('customer', 'status', 'term', 'days_remaining', 'current_period_end', 'cancel_at_period_end')
    list_filter     = ('status',)
    search_fields   = ('customer__user__username', 'stripe_subscription_id')
    readonly_fields = ('updated_at',)
    inlines         = [SubscriptionItemInline]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('items')

    @admin.display(description='Term')
    def term(self, obj):
        price_ids = [item.stripe_price_id for item in obj.items.all()]
        if not price_ids:
            return '—'
        intervals = (
            ProductPrice.objects
            .filter(stripe_price_id__in=price_ids)
            .values_list('interval', flat=True)
            .distinct()
        )
        labels = {'week': 'Weekly', 'month': 'Monthly', 'year': 'Annual'}
        return ', '.join(labels.get(i, i) for i in intervals) or '—'

    @admin.display(description='Days remaining')
    def days_remaining(self, obj):
        return max((obj.current_period_end - timezone.now()).days, 0)


