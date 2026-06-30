import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0003_subscription_status_choices'),
    ]

    operations = [
        # Subscription: OneToOneField → ForeignKey (allows multiple subscriptions per customer)
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
                ('stripe_price_id', models.CharField(max_length=255)),
                ('stripe_product_id', models.CharField(max_length=255)),
                ('quantity', models.PositiveIntegerField(default=1)),
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
        # ProductPrice: add days_granted for one-time purchases
        migrations.AddField(
            model_name='productprice',
            name='days_granted',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text='Days of license access granted by a one-time purchase',
            ),
        ),
        # ProductPrice: replace blanket unique_together with a conditional constraint
        # (only recurring prices need uniqueness per interval)
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
