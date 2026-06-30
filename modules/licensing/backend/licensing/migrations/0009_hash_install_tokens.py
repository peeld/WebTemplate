from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0008_alter_vendorinstalltoken_id_alter_vendorinvoice_id_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='installtoken',
            name='token',
            field=models.CharField(max_length=64, unique=True),
        ),
        migrations.AlterField(
            model_name='vendorinstalltoken',
            name='token',
            field=models.CharField(max_length=64, unique=True),
        ),
    ]
