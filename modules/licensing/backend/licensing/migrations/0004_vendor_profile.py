from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0003_licensekey_vendor_fields'),
        ('orgs', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='VendorProfile',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('org', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='vendor_profile',
                    to='orgs.organization',
                )),
                ('discount_pct', models.DecimalField(decimal_places=4, default='0.0000', max_digits=5)),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
