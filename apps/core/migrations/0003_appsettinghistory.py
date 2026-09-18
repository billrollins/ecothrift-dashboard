from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0002_enhancement_request'),
    ]

    operations = [
        migrations.CreateModel(
            name='AppSettingHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(db_index=True, max_length=100)),
                ('old_value', models.JSONField(null=True)),
                ('new_value', models.JSONField(null=True)),
                ('changed_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-changed_at'],
            },
        ),
        migrations.AddIndex(
            model_name='appsettinghistory',
            index=models.Index(fields=['key', 'changed_at'], name='core_appset_key_chg_idx'),
        ),
    ]
