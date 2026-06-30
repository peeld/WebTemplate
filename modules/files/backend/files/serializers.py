from rest_framework import serializers
from .models import Release, ReleaseAsset


class ReleaseAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReleaseAsset
        fields = ['id', 'label', 'platform', 's3_bucket', 's3_key', 'file_size_bytes', 'sort_order']


class ReleaseSerializer(serializers.ModelSerializer):
    assets = ReleaseAssetSerializer(many=True, read_only=True)

    class Meta:
        model = Release
        fields = ['id', 'product_id', 'version', 'release_date', 'notes',
                  'is_latest', 'status', 'created_at', 'assets']
        read_only_fields = ['created_at']
