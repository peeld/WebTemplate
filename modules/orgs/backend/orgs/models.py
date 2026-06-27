from uuid import uuid4

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class Organization(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Organization'
        verbose_name_plural = 'Organizations'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._unique_slug()
        super().save(*args, **kwargs)

    def _unique_slug(self):
        base = slugify(self.name) or 'org'
        slug, n = base, 1
        while Organization.objects.filter(slug=slug).exists():
            slug = f'{base}-{n}'
            n += 1
        return slug

    def __str__(self):
        return self.name


class Membership(models.Model):
    ROLES = [('owner', 'Owner'), ('admin', 'Admin'), ('member', 'Member')]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='org_memberships',
    )
    org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(max_length=20, choices=ROLES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'org')]
        ordering = ['joined_at']

    def __str__(self):
        return f'{self.user} — {self.org} ({self.role})'


class OrgInvite(models.Model):
    org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='invites',
    )
    email = models.EmailField()
    token = models.UUIDField(default=uuid4, unique=True, editable=False)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_org_invites',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def is_expired(self):
        return (timezone.now() - self.created_at).total_seconds() > 7 * 86400

    def __str__(self):
        return f'Invite {self.email} → {self.org}'
