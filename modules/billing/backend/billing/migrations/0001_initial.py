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
            name='StripeCustomer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_customer_id', models.CharField(max_length=255, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='stripe_customer', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_subscription_id', models.CharField(max_length=255, unique=True)),
                ('stripe_price_id', models.CharField(max_length=255)),
                ('stripe_product_id', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('active', 'Active'), ('trialing', 'Trialing'), ('past_due', 'Past Due'), ('canceled', 'Canceled'), ('incomplete', 'Incomplete')], max_length=20)),
                ('current_period_end', models.DateTimeField()),
                ('cancel_at_period_end', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='subscription', to='billing.stripecustomer')),
            ],
        ),
    ]
