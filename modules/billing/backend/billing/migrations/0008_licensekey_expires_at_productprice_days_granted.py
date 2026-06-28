from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0007_alter_licensekey_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='licensekey',
            name='expires_at',
            field=models.DateTimeField(blank=True, help_text='Expiry for prepay (non-subscription) licenses; stacks on each purchase', null=True),
        ),
        migrations.AddField(
            model_name='productprice',
            name='days_granted',
            field=models.PositiveIntegerField(blank=True, help_text='Days of license access granted by a one-time purchase', null=True),
        ),
    ]
