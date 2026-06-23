import uuid

from django.conf import settings
from django.db import models


class UploadedFile(models.Model):
    class Status(models.TextChoices):
        PENDING    = 'pending',    'Pending'
        PROCESSING = 'processing', 'Processing'
        COMPLETE   = 'complete',   'Complete'
        FAILED     = 'failed',     'Failed'

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user              = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='uploaded_files')
    original_filename = models.CharField(max_length=255)
    content_type      = models.CharField(max_length=100)
    size              = models.PositiveBigIntegerField(null=True, blank=True)
    status            = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    error_message     = models.TextField(blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    @property
    def s3_key(self):
        return f'{self.user_id}/{self.id}'

    def __str__(self):
        return f'{self.user} — {self.original_filename} ({self.status})'
