from rest_framework import serializers
from .models import Product, ProductImage, ProductPrice, Subscription


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
        fields = ['id', 'stripe_price_id', 'amount', 'currency', 'price_type', 'interval', 'is_active']


class ProductSerializer(serializers.ModelSerializer):
    prices = ProductPriceSerializer(many=True, read_only=True)

    class Meta:
        model  = Product
        fields = ['id', 'name', 'slug', 'description', 'thumbnail', 'features', 'fulfillment_type', 'prices']


class SubscriptionSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model  = Subscription
        fields = [
            'stripe_subscription_id',
            'stripe_price_id',
            'stripe_product_id',
            'product_name',
            'status',
            'current_period_end',
            'cancel_at_period_end',
            'updated_at',
        ]
        read_only_fields = fields

    def get_product_name(self, obj):
        product = Product.objects.filter(stripe_product_id=obj.stripe_product_id).first()
        return product.name if product else None


class AdminProductPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model            = ProductPrice
        fields           = ['id', 'stripe_price_id', 'amount', 'currency', 'price_type', 'interval', 'is_active']
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
    user_email = serializers.CharField(source='customer.user.email', read_only=True)
    username   = serializers.CharField(source='customer.user.username', read_only=True)

    class Meta:
        model  = Subscription
        fields = [
            'id',
            'user_email',
            'username',
            'stripe_subscription_id',
            'stripe_price_id',
            'stripe_product_id',
            'status',
            'current_period_end',
            'cancel_at_period_end',
            'updated_at',
        ]
