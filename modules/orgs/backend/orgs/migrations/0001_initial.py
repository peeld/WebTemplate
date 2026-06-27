import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('slug', models.SlugField(unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Organization',
                'verbose_name_plural': 'Organizations',
            },
        ),
        migrations.CreateModel(
            name='Membership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(
                    choices=[('owner', 'Owner'), ('admin', 'Admin'), ('member', 'Member')],
                    default='member',
                    max_length=20,
                )),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('org', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='memberships',
                    to='orgs.organization',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='org_memberships',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['joined_at'],
                'unique_together': {('user', 'org')},
            },
        ),
        migrations.CreateModel(
            name='OrgInvite',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('token', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('accepted', models.BooleanField(default=False)),
                ('invited_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sent_org_invites',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('org', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='invites',
                    to='orgs.organization',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
