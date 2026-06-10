from rest_framework import serializers
from .models import Subscription


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = [
            'stripe_subscription_id',
            'stripe_price_id',
            'stripe_product_id',
            'status',
            'current_period_end',
            'cancel_at_period_end',
            'updated_at',
        ]
        read_only_fields = fields
