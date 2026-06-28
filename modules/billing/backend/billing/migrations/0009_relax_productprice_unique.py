from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0008_licensekey_expires_at_productprice_days_granted'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='productprice',
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name='productprice',
            constraint=models.UniqueConstraint(
                condition=models.Q(price_type='recurring'),
                fields=['product', 'interval'],
                name='unique_recurring_price_per_interval',
            ),
        ),
    ]
