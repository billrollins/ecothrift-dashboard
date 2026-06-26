from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0072_restoration_bench_and_parts'),
    ]

    operations = [
        migrations.AddField(
            model_name='restorationjob',
            name='timer_started_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='restoration_jobs_timer_running',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
