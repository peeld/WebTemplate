from django.utils import timezone
from rest_framework import serializers
from .models import Product, ProductImage, ProductPrice, Subscription, SubscriptionItem


class ProductImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model  = ProductImage
        fields = ['id', 'image_url', 'sort_order', 'created_at']
        read_only_fields = ['image_url', 'created_at']

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ProductPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductPrice
        fields = ['id', 'stripe_price_id', 'amount', 'currency', 'price_type', 'interval', 'days_granted', 'is_active']


class ProductSerializer(serializers.ModelSerializer):
    prices = ProductPriceSerializer(many=True, read_only=True)

    class Meta:
        model  = Product
        fields = ['id', 'name', 'slug', 'description', 'thumbnail', 'features', 'fulfillment_type', 'download_label', 'prices']


class SubscriptionItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model  = SubscriptionItem
        fields = ['stripe_price_id', 'stripe_product_id', 'quantity', 'product_name']

    def get_product_name(self, obj):
        product = Product.objects.filter(stripe_product_id=obj.stripe_product_id).first()
        return product.name if product else None


class SubscriptionSerializer(serializers.ModelSerializer):
    items = SubscriptionItemSerializer(many=True, read_only=True)

    class Meta:
        model  = Subscription
        fields = [
            'stripe_subscription_id',
            'items',
            'status',
            'current_period_end',
            'cancel_at_period_end',
            'updated_at',
        ]
        read_only_fields = fields


class AdminProductPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model            = ProductPrice
        fields           = ['id', 'stripe_price_id', 'amount', 'currency', 'price_type', 'interval', 'days_granted', 'is_active']
        read_only_fields = ['stripe_price_id']

    def validate(self, data):
        if self.instance and self.instance.stripe_price_id:
            immutable = {'amount', 'currency', 'price_type', 'interval'}
            changed = immutable & set(data.keys())
            if changed:
                raise serializers.ValidationError(
                    'Price amount and interval cannot be changed after creation in Stripe. '
                    'Delete and recreate instead.'
                )

        price_type = data.get('price_type', getattr(self.instance, 'price_type', 'recurring'))
        interval   = data.get('interval', '')
        if price_type == 'recurring' and not interval:
            raise serializers.ValidationError({'interval': 'Interval is required for recurring prices.'})
        if price_type == 'one_time':
            data['interval'] = ''
        return data


class AdminProductSerializer(serializers.ModelSerializer):
    prices = AdminProductPriceSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model  = Product
        fields = '__all__'


class AdminSubscriptionSerializer(serializers.ModelSerializer):
    user_email     = serializers.CharField(source='customer.user.email', read_only=True)
    username       = serializers.CharField(source='customer.user.username', read_only=True)
    items          = SubscriptionItemSerializer(many=True, read_only=True)
    term           = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()

    class Meta:
        model  = Subscription
        fields = [
            'id',
            'user_email',
            'username',
            'stripe_subscription_id',
            'items',
            'status',
            'term',
            'days_remaining',
            'current_period_end',
            'cancel_at_period_end',
            'updated_at',
        ]

    def get_term(self, obj):
        price_ids = [item.stripe_price_id for item in obj.items.all()]
        if not price_ids:
            return None
        intervals = list(
            ProductPrice.objects
            .filter(stripe_price_id__in=price_ids)
            .values_list('interval', flat=True)
            .distinct()
        )
        labels = {'week': 'Weekly', 'month': 'Monthly', 'year': 'Annual'}
        return ', '.join(labels.get(i, i) for i in intervals) or None

    def get_days_remaining(self, obj):
        return max((obj.current_period_end - timezone.now()).days, 0)


