from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0010_installtoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='licensemachine',
            name='machine_secret',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]
