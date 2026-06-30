from rest_framework import serializers

from .models import (
    InstallToken, LicenseKey, LicenseMachine,
    VendorInstallToken, VendorInvoice, VendorInvoiceLineItem,
    VendorLicensePool, VendorProfile,
)


class LicenseMachineSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LicenseMachine
        fields = ['id', 'machine_id_hash', 'label', 'first_seen', 'last_seen', 'is_active']
        read_only_fields = ['id', 'machine_id_hash', 'first_seen', 'last_seen']


class UserLicenseSerializer(serializers.ModelSerializer):
    product_name  = serializers.SerializerMethodField()
    product_slug  = serializers.SerializerMethodField()
    machines      = LicenseMachineSerializer(many=True, read_only=True)
    machines_used = serializers.SerializerMethodField()

    class Meta:
        model  = LicenseKey
        fields = [
            'key', 'product_name', 'product_slug', 'is_active', 'expires_at',
            'max_machines', 'offline_ttl_days', 'machines_used', 'machines', 'created_at',
        ]
        read_only_fields = fields

    def get_product_name(self, obj):
        return obj.product.name

    def get_product_slug(self, obj):
        return obj.product.slug

    def get_machines_used(self, obj):
        return obj.machines.filter(is_active=True).count()


class AdminLicenseSerializer(serializers.ModelSerializer):
    user_email    = serializers.SerializerMethodField()
    product_name  = serializers.SerializerMethodField()
    machines      = LicenseMachineSerializer(many=True, read_only=True)
    machines_used = serializers.SerializerMethodField()

    class Meta:
        model  = LicenseKey
        fields = [
            'id', 'key', 'user_email', 'product_name', 'is_active', 'expires_at',
            'max_machines', 'offline_ttl_days', 'machines_used', 'machines', 'created_at',
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        return obj.user.email if obj.user else None

    def get_product_name(self, obj):
        return obj.product.name

    def get_machines_used(self, obj):
        return obj.machines.filter(is_active=True).count()


class VendorProfileSerializer(serializers.ModelSerializer):
    org_id   = serializers.SerializerMethodField()
    org_name = serializers.SerializerMethodField()

    class Meta:
        model  = VendorProfile
        fields = ['id', 'org_id', 'org_name', 'discount_pct', 'is_active', 'notes', 'created_at']
        read_only_fields = ['id', 'org_id', 'org_name', 'created_at']

    def get_org_id(self, obj):
        return obj.org_id

    def get_org_name(self, obj):
        return str(obj.org)


class VendorLicensePoolSerializer(serializers.ModelSerializer):
    org_id          = serializers.SerializerMethodField()
    org_name        = serializers.SerializerMethodField()
    product_name    = serializers.SerializerMethodField()
    price_label     = serializers.SerializerMethodField()
    seats_issued    = serializers.SerializerMethodField()
    seats_remaining = serializers.SerializerMethodField()

    class Meta:
        model  = VendorLicensePool
        fields = [
            'id', 'vendor', 'org_id', 'org_name',
            'product', 'product_name', 'price', 'price_label',
            'seats_purchased', 'seats_issued', 'seats_remaining',
            'created_at',
        ]
        read_only_fields = ['id', 'org_id', 'org_name', 'product_name', 'price_label', 'seats_issued', 'seats_remaining', 'created_at']

    def get_org_id(self, obj):
        return obj.vendor.org_id

    def get_org_name(self, obj):
        return str(obj.vendor.org)

    def get_product_name(self, obj):
        return obj.product.name

    def get_price_label(self, obj):
        p = obj.price
        amount = f'${p.amount / 100:.2f}'
        if p.price_type == 'one_time':
            days = f' ({p.days_granted}d)' if p.days_granted else ''
            return f'{amount} one-time{days}'
        return f'{amount}/{p.interval}'

    def get_seats_issued(self, obj):
        return obj.seats_issued

    def get_seats_remaining(self, obj):
        return obj.seats_remaining


class VendorInstallTokenSerializer(serializers.ModelSerializer):
    redeemed = serializers.SerializerMethodField()

    class Meta:
        model  = VendorInstallToken
        fields = ['id', 'label', 'redeemed', 'created_at']
        read_only_fields = ['id', 'redeemed', 'created_at']

    def get_redeemed(self, obj):
        return obj.redeemed_at is not None


class VendorInvoiceLineItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model  = VendorInvoiceLineItem
        fields = ['id', 'product', 'product_name', 'seats_used', 'unit_price', 'discount_pct', 'line_total']
        read_only_fields = fields

    def get_product_name(self, obj):
        return obj.product.name


class VendorInvoiceSerializer(serializers.ModelSerializer):
    line_items = VendorInvoiceLineItemSerializer(many=True, read_only=True)

    class Meta:
        model  = VendorInvoice
        fields = [
            'id', 'vendor', 'period_start', 'period_end',
            'status', 'issued_at', 'paid_at', 'notes', 'created_at',
            'line_items',
        ]
        read_only_fields = ['id', 'issued_at', 'paid_at', 'created_at']
