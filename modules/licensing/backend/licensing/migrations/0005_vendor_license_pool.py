from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_subscription_items_and_productprice_updates'),
        ('licensing', '0004_vendor_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='VendorLicensePool',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('vendor', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='pools',
                    to='licensing.vendorprofile',
                )),
                ('product', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    to='billing.product',
                )),
                ('price', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    to='billing.productprice',
                )),
                ('seats_purchased', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'unique_together': {('vendor', 'product')},
            },
        ),
        migrations.AddField(
            model_name='licensekey',
            name='vendor_pool',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='license_keys',
                to='licensing.vendorlicensepool',
            ),
        ),
    ]
