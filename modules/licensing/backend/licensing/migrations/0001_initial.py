import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('billing', '0004_subscription_items_and_productprice_updates'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LicenseKey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('expires_at', models.DateTimeField(
                    blank=True,
                    help_text='Expiry for prepay (non-subscription) licenses; stacks on each purchase',
                    null=True,
                )),
                ('max_machines', models.PositiveIntegerField(default=1)),
                ('offline_ttl_days', models.PositiveIntegerField(default=30)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='license_keys',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('product', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='license_keys',
                    to='billing.product',
                )),
                ('subscription', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='license_keys',
                    to='billing.subscription',
                )),
            ],
            options={
                'verbose_name': 'License',
                'verbose_name_plural': 'Licenses',
            },
        ),
        migrations.CreateModel(
            name='LicenseMachine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('machine_id_hash', models.CharField(max_length=64)),
                ('label', models.CharField(blank=True, max_length=255)),
                ('machine_secret', models.CharField(blank=True, default='', max_length=64)),
                ('first_seen', models.DateTimeField(auto_now_add=True)),
                ('last_seen', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('license', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='machines',
                    to='licensing.licensekey',
                )),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='licensekey',
            unique_together={('user', 'product')},
        ),
        migrations.AlterUniqueTogether(
            name='licensemachine',
            unique_together={('license', 'machine_id_hash')},
        ),
    ]
