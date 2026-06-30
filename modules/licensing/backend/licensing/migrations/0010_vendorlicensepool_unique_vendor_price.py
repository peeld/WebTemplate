from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0009_hash_install_tokens'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='vendorlicensepool',
            unique_together={('vendor', 'price')},
        ),
    ]
