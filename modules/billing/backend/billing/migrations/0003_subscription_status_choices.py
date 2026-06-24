from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0002_productimage'),
    ]

    operations = [
        migrations.AlterField(
            model_name='subscription',
            name='status',
            field=models.CharField(
                choices=[
                    ('active',             'Active'),
                    ('trialing',           'Trialing'),
                    ('past_due',           'Past Due'),
                    ('canceled',           'Canceled'),
                    ('incomplete',         'Incomplete'),
                    ('unpaid',             'Unpaid'),
                    ('paused',             'Paused'),
                    ('incomplete_expired', 'Incomplete (Expired)'),
                ],
                max_length=20,
            ),
        ),
    ]
