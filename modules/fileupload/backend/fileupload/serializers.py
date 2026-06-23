from rest_framework import serializers

from .models import UploadedFile


class UploadedFileSerializer(serializers.ModelSerializer):
    class Meta:
        model        = UploadedFile
        fields       = ['id', 'original_filename', 'content_type', 'size', 'status', 'created_at', 'updated_at']
        read_only_fields = fields


class PresignRequestSerializer(serializers.Serializer):
    filename     = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    size         = serializers.IntegerField(min_value=0, required=False)


class WebhookSerializer(serializers.Serializer):
    file_id = serializers.UUIDField()
    status  = serializers.ChoiceField(choices=['complete', 'failed'])
    error   = serializers.CharField(required=False, allow_blank=True, default='')
