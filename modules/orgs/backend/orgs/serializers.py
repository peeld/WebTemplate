from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Membership, OrgInvite, Organization

User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'created_at']
        read_only_fields = ['id', 'slug', 'created_at']


class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class MembershipSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)

    class Meta:
        model = Membership
        fields = ['id', 'user', 'role', 'joined_at']
        read_only_fields = ['id', 'user', 'joined_at']


class OrgInviteSerializer(serializers.ModelSerializer):
    invited_by_username = serializers.CharField(
        source='invited_by.username', read_only=True, default=None
    )

    class Meta:
        model = OrgInvite
        fields = ['id', 'email', 'invited_by_username', 'created_at', 'accepted']
        read_only_fields = ['id', 'email', 'invited_by_username', 'created_at', 'accepted']


class PendingInviteSerializer(serializers.ModelSerializer):
    org_id = serializers.IntegerField(source='org.id', read_only=True)
    org_name = serializers.CharField(source='org.name', read_only=True)
    invited_by_username = serializers.CharField(
        source='invited_by.username', read_only=True, default=None
    )

    class Meta:
        model = OrgInvite
        fields = ['token', 'org_id', 'org_name', 'invited_by_username', 'created_at']
        read_only_fields = fields
