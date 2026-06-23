from django.contrib import admin

from .models import UploadedFile


@admin.register(UploadedFile)
class UploadedFileAdmin(admin.ModelAdmin):
    list_display    = ('id', 'user', 'original_filename', 'content_type', 'size', 'status', 'created_at')
    list_filter     = ('status',)
    search_fields   = ('user__email', 'original_filename')
    readonly_fields = ('id', 'created_at', 'updated_at')
