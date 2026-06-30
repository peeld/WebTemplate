from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_subscription_items_and_productprice_updates'),
        ('licensing', '0006_vendor_install_token'),
    ]

    operations = [
        migrations.CreateModel(
            name='VendorInvoice',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('vendor', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='invoices',
                    to='licensing.vendorprofile',
                )),
                ('period_start', models.DateField()),
                ('period_end', models.DateField()),
                ('status', models.CharField(
                    choices=[('draft', 'Draft'), ('issued', 'Issued'), ('paid', 'Paid'), ('void', 'Void')],
                    default='draft',
                    max_length=10,
                )),
                ('issued_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='VendorInvoiceLineItem',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('invoice', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='line_items',
                    to='licensing.vendorinvoice',
                )),
                ('product', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    to='billing.product',
                )),
                ('seats_used', models.PositiveIntegerField()),
                ('unit_price', models.PositiveIntegerField(
                    help_text='Cents; snapshot from ProductPrice.amount at invoice time',
                )),
                ('discount_pct', models.DecimalField(
                    decimal_places=4,
                    max_digits=5,
                    help_text='Snapshot from VendorProfile at invoice time',
                )),
                ('line_total', models.PositiveIntegerField(
                    help_text='Cents; seats_used * unit_price * (1 - discount_pct)',
                )),
            ],
        ),
    ]
