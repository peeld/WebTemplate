"""
userauth/serializers.py — Auth serializers: registration and JWT login

Handles input validation for signup and normalizes username on JWT login.
Profile creation is intentionally excluded here — listen to the
`user_registered` signal (userauth.signals) in whatever module owns profiles.
"""

import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import EmailVerificationToken
from .signals import user_registered

logger = logging.getLogger(__name__)

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """
    Signup serializer — validates input and creates User + EmailVerificationToken.

    SIDE EFFECTS on create():
    - User created with is_active=False (requires email verification)
    - EmailVerificationToken created with 6-digit code
    - user_registered signal fired so other modules (e.g. profiles) can react
    """

    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    email    = serializers.EmailField(required=True)

    class Meta:
        model  = User
        fields = ['username', 'email', 'password']

    def validate_username(self, value):
        """Lowercase + case-insensitive uniqueness check."""
        value_lower = value.lower().strip()
        if not value_lower:
            raise serializers.ValidationError('Username cannot be empty.')
        if len(value_lower) < 3:
            raise serializers.ValidationError('Username must be at least 3 characters.')
        if len(value_lower) > 150:
            raise serializers.ValidationError('Username must be less than 150 characters.')
        if User.objects.filter(username__iexact=value_lower).exists():
            raise serializers.ValidationError('A user with that username already exists.')
        return value_lower

    def validate_email(self, value):
        """Lowercase + duplicate check."""
        value_lower = value.lower().strip()
        if User.objects.filter(email__iexact=value_lower).exists():
            raise serializers.ValidationError('A user with that email already exists.')
        return value_lower

    def validate_password(self, value):
        """Require at least one uppercase letter; disallow all-digit passwords."""
        if value.isdigit():
            raise serializers.ValidationError('Password cannot be only digits.')
        if value.lower() == value:
            raise serializers.ValidationError('Password must contain at least one uppercase letter.')
        return value

    def create(self, validated_data):
        """Create User (inactive) and EmailVerificationToken; fire user_registered signal."""
        try:
            user = User.objects.create_user(
                username=validated_data['username'].lower(),
                email=validated_data['email'].lower(),
                password=validated_data['password'],
                is_active=False,  # Email verification required before login
            )

            EmailVerificationToken.objects.get_or_create(user=user)

            # Signal: other modules (profiles, etc.) hook in here.
            user_registered.send(sender=user.__class__, user=user)
            logger.debug('user_registered signal sent for user_id=%s', user.id)

            return user
        except IntegrityError:
            raise serializers.ValidationError('Failed to create user. Username or email may already exist.')


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Accepts username or email in the username field.
    If the value contains '@', resolves to the matching username before JWT validation.
    """

    def validate(self, attrs):
        identifier = attrs.get('username', '').lower().strip()
        if '@' in identifier:
            # Email supplied — resolve to username so JWT machinery works normally.
            try:
                user = User.objects.get(email__iexact=identifier, is_active=True)
                attrs['username'] = user.username
            except User.DoesNotExist:
                pass  # Let super() raise the standard auth error
        else:
            attrs['username'] = identifier
        data = super().validate(attrs)
        data['username'] = self.user.username
        return data
