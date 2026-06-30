import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('licensing', '0001_initial'),
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
                    to='licensing.licensekey',
                )),
            ],
        ),
    ]
