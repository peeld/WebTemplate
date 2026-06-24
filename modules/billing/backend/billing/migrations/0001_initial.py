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
            name='Product',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('slug', models.SlugField(unique=True)),
                ('description', models.TextField(blank=True)),
                ('thumbnail', models.URLField(blank=True)),
                ('features', models.JSONField(blank=True, default=list, help_text='List of feature strings')),
                ('stripe_product_id', models.CharField(blank=True, max_length=255)),
                ('fulfillment_type', models.CharField(
                    choices=[('digital', 'Digital'), ('physical', 'Physical')],
                    default='digital',
                    max_length=20,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='StripeCustomer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_customer_id', models.CharField(max_length=255, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='stripe_customer',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_subscription_id', models.CharField(max_length=255, unique=True)),
                ('stripe_price_id', models.CharField(max_length=255)),
                ('stripe_product_id', models.CharField(max_length=255)),
                ('status', models.CharField(
                    choices=[
                        ('active', 'Active'),
                        ('trialing', 'Trialing'),
                        ('past_due', 'Past Due'),
                        ('canceled', 'Canceled'),
                        ('incomplete', 'Incomplete'),
                    ],
                    max_length=20,
                )),
                ('current_period_end', models.DateTimeField()),
                ('cancel_at_period_end', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='subscription',
                    to='billing.stripecustomer',
                )),
            ],
        ),
        migrations.CreateModel(
            name='ProductPrice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_price_id', models.CharField(blank=True, max_length=255)),
                ('amount', models.PositiveIntegerField(help_text='Price in cents')),
                ('currency', models.CharField(default='usd', max_length=3)),
                ('price_type', models.CharField(
                    choices=[('one_time', 'One-time'), ('recurring', 'Recurring')],
                    default='recurring',
                    max_length=20,
                )),
                ('interval', models.CharField(
                    blank=True,
                    choices=[('week', 'Weekly'), ('month', 'Monthly'), ('year', 'Annual')],
                    max_length=10,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('product', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='prices',
                    to='billing.product',
                )),
            ],
            options={
                'ordering': ['price_type', 'interval'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='productprice',
            unique_together={('product', 'price_type', 'interval')},
        ),
    ]
