import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Release',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('product_id', models.IntegerField(db_index=True)),
                ('version', models.CharField(max_length=50)),
                ('release_date', models.DateField()),
                ('notes', models.TextField(blank=True)),
                ('is_latest', models.BooleanField(db_index=True, default=False)),
                ('status', models.CharField(
                    choices=[('draft', 'Draft'), ('published', 'Published')],
                    default='draft',
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-release_date'],
            },
        ),
        migrations.CreateModel(
            name='ReleaseAsset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=100)),
                ('platform', models.CharField(max_length=50)),
                ('s3_bucket', models.CharField(max_length=255)),
                ('s3_key', models.CharField(max_length=500)),
                ('file_size_bytes', models.BigIntegerField(blank=True, null=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('release', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='assets',
                    to='files.release',
                )),
            ],
            options={
                'ordering': ['sort_order', 'label'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='release',
            unique_together={('product_id', 'version')},
        ),
    ]
