import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name='UploadedFile',
            fields=[
                ('id',                models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('original_filename', models.CharField(max_length=255)),
                ('content_type',      models.CharField(max_length=100)),
                ('size',              models.PositiveBigIntegerField(blank=True, null=True)),
                ('status',            models.CharField(
                    choices=[('pending', 'Pending'), ('processing', 'Processing'), ('complete', 'Complete'), ('failed', 'Failed')],
                    default='pending',
                    max_length=20,
                )),
                ('error_message',     models.TextField(blank=True)),
                ('created_at',        models.DateTimeField(auto_now_add=True)),
                ('updated_at',        models.DateTimeField(auto_now=True)),
                ('user',              models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='uploaded_files',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
