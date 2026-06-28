import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0005_licensekey_subscription'),
    ]

    operations = [
        # Change OneToOneField → ForeignKey (removes the unique constraint on customer_id)
        migrations.AlterField(
            model_name='subscription',
            name='customer',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='subscriptions',
                to='billing.stripecustomer',
            ),
        ),
        migrations.RemoveField(
            model_name='subscription',
            name='stripe_price_id',
        ),
        migrations.RemoveField(
            model_name='subscription',
            name='stripe_product_id',
        ),
        migrations.CreateModel(
            name='SubscriptionItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_price_id',   models.CharField(max_length=255)),
                ('stripe_product_id', models.CharField(max_length=255)),
                ('quantity',          models.PositiveIntegerField(default=1)),
                ('subscription', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='items',
                    to='billing.subscription',
                )),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='subscriptionitem',
            unique_together={('subscription', 'stripe_price_id')},
        ),
    ]
