from django.contrib import admin

from .models import Membership, OrgInvite, Organization


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    fields = ('user', 'role', 'joined_at')
    readonly_fields = ('joined_at',)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'created_at')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    inlines = [MembershipInline]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'org', 'role', 'joined_at')
    list_filter = ('role',)
    search_fields = ('user__username', 'org__name')


@admin.register(OrgInvite)
class OrgInviteAdmin(admin.ModelAdmin):
    list_display = ('email', 'org', 'invited_by', 'created_at', 'accepted')
    list_filter = ('accepted',)
    search_fields = ('email', 'org__name')
    readonly_fields = ('token', 'created_at')
