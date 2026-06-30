from django.contrib import admin
from .models import InstallToken, LicenseKey, LicenseMachine


class LicenseMachineInline(admin.TabularInline):
    model           = LicenseMachine
    extra           = 0
    fields          = ('machine_id_hash', 'label', 'first_seen', 'last_seen', 'is_active')
    readonly_fields = ('machine_id_hash', 'first_seen', 'last_seen')


class InstallTokenInline(admin.TabularInline):
    model           = InstallToken
    extra           = 0
    fields          = ('token', 'created_at', 'expires_at', 'used_at')
    readonly_fields = ('token', 'created_at', 'used_at')


@admin.register(LicenseKey)
class LicenseKeyAdmin(admin.ModelAdmin):
    list_display    = ('key', 'user', 'product', 'is_active', 'expires_at', 'max_machines', 'created_at')
    list_filter     = ('is_active', 'product')
    search_fields   = ('key', 'user__username', 'user__email', 'product__name')
    readonly_fields = ('key', 'created_at')
    inlines         = [LicenseMachineInline, InstallTokenInline]


@admin.register(LicenseMachine)
class LicenseMachineAdmin(admin.ModelAdmin):
    list_display    = ('license', 'label', 'machine_id_hash', 'is_active', 'first_seen', 'last_seen')
    list_filter     = ('is_active',)
    search_fields   = ('machine_id_hash', 'label', 'license__key', 'license__user__username')
    readonly_fields = ('machine_id_hash', 'first_seen', 'last_seen')


@admin.register(InstallToken)
class InstallTokenAdmin(admin.ModelAdmin):
    list_display    = ('token', 'license', 'created_at', 'expires_at', 'used_at')
    list_filter     = ('used_at',)
    search_fields   = ('token', 'license__key', 'license__user__username')
    readonly_fields = ('token', 'created_at', 'used_at')
