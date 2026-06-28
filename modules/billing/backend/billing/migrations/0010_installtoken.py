from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0009_relax_productprice_unique'),
    ]

    operations = [
        migrations.CreateModel(
            name='InstallToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(max_length=19, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('license', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='install_tokens',
                    to='billing.licensekey',
                )),
            ],
        ),
    ]
