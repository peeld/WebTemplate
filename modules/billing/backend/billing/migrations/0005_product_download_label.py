from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_subscription_items_and_productprice_updates'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='download_label',
            field=models.CharField(
                blank=True,
                default='',
                help_text='If set, shows a download button on the product card. '
                          'Example: "Download" or "Download 30-day trial". '
                          'Requires the files module to be installed.',
                max_length=100,
            ),
        ),
    ]
