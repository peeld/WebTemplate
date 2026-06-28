import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_licensekey_licensemachine'),
    ]

    operations = [
        migrations.AddField(
            model_name='licensekey',
            name='subscription',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='license_keys',
                to='billing.subscription',
            ),
        ),
    ]
