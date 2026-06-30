from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0005_vendor_license_pool'),
    ]

    operations = [
        migrations.CreateModel(
            name='VendorInstallToken',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pool', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='tokens',
                    to='licensing.vendorlicensepool',
                )),
                ('token', models.CharField(max_length=19, unique=True)),
                ('license_key', models.OneToOneField(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='vendor_install_token',
                    to='licensing.licensekey',
                )),
                ('label', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('redeemed_at', models.DateTimeField(blank=True, null=True)),
            ],
        ),
    ]
