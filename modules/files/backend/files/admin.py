from django.contrib import admin
from .models import Release, ReleaseAsset


class ReleaseAssetInline(admin.TabularInline):
    model = ReleaseAsset
    extra = 0


@admin.register(Release)
class ReleaseAdmin(admin.ModelAdmin):
    list_display = ['product_id', 'version', 'release_date', 'status', 'is_latest', 'created_at']
    list_filter = ['status', 'is_latest', 'product_id']
    search_fields = ['version', 'notes']
    inlines = [ReleaseAssetInline]
    # product_id is an opaque IntegerField — enter the billing Product.id directly
