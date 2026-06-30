from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0002_installtoken'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='licensekey',
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name='licensekey',
            constraint=models.UniqueConstraint(
                fields=['user', 'product'],
                condition=models.Q(user__isnull=False),
                name='unique_user_product_license',
            ),
        ),
        migrations.AddField(
            model_name='licensekey',
            name='source',
            field=models.CharField(
                choices=[('stripe', 'Stripe'), ('vendor', 'Vendor')],
                default='stripe',
                max_length=10,
            ),
        ),
    ]
