from django.db import models


class Release(models.Model):
    product_id   = models.IntegerField(db_index=True)
    version      = models.CharField(max_length=50)
    release_date = models.DateField()
    notes        = models.TextField(blank=True)
    is_latest    = models.BooleanField(default=False, db_index=True)
    status       = models.CharField(
                       max_length=20,
                       choices=[('draft', 'Draft'), ('published', 'Published')],
                       default='draft')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-release_date']
        unique_together = [('product_id', 'version')]

    def __str__(self):
        return f"Release {self.version} (product {self.product_id})"


class ReleaseAsset(models.Model):
    release         = models.ForeignKey(Release, on_delete=models.CASCADE,
                                        related_name='assets')
    label           = models.CharField(max_length=100)
    platform        = models.CharField(max_length=50)
    s3_bucket       = models.CharField(max_length=255)
    s3_key          = models.CharField(max_length=500)
    file_size_bytes = models.BigIntegerField(null=True, blank=True)
    sort_order      = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'label']

    def __str__(self):
        return f"{self.label} ({self.platform})"
