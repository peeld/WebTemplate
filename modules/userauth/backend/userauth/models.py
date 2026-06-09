"""
userauth/models.py -- Authentication token models

Handles email verification and password reset tokens.
"""

import uuid
import secrets
from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

User = get_user_model()


class EmailVerificationToken(models.Model):
    """
    Email verification token issued at signup.
    OneToOne ensures one active token per user.

    Two verification paths:
      - token (UUID link): /verify-email/<token>
      - code (6-digit):    inline form during signup
    """

    user       = models.OneToOneField(User, on_delete=models.CASCADE, related_name='verification_token')
    token      = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    code       = models.CharField(max_length=6, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Email Verification Tokens'

    def save(self, *args, **kwargs):
        """Generate 6-digit code on first save if not already set."""
        if not self.code:
            self.code = str(secrets.randbelow(900000) + 100000)
        super().save(*args, **kwargs)

    def is_expired(self):
        """Token expires after 24 hours."""
        return (timezone.now() - self.created_at).total_seconds() > 86400

    def __str__(self):
        return f'{self.user.username} verification token'


class PasswordResetToken(models.Model):
    """
    One-time password reset token; expires after 1 hour.
    ForeignKey allows multiple tokens per user -- only the latest valid one should be used.
    """

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_tokens')
    token      = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    used       = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Password Reset Tokens'
        ordering = ['-created_at']

    def is_expired(self):
        """Token expires after 1 hour."""
        return (timezone.now() - self.created_at).total_seconds() > 3600

    def __str__(self):
        return f'{self.user.username} reset token'
