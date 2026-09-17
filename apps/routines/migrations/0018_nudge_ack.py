from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('routines', '0017_day_override_exclusion'),
    ]

    operations = [
        migrations.AddField(
            model_name='qanudge',
            name='employee',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='qa_nudges_received',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='qanudge',
            name='acked_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='qanudge',
            name='acked_by_device',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='qanudge',
            name='ack_kind',
            field=models.CharField(blank=True, default='', max_length=16),
        ),
    ]
