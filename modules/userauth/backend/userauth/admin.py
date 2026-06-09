from django.contrib import admin
from .models import EmailVerificationToken, PasswordResetToken


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at')
    readonly_fields = ('token', 'code', 'created_at')


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'used', 'created_at')
    readonly_fields = ('token', 'created_at')
