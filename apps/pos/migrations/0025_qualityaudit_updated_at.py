# Generated manually for QualityAudit.updated_at

from django.db import migrations, models
from django.utils import timezone


def backfill_updated_at(apps, schema_editor):
    QualityAudit = apps.get_model('pos', 'QualityAudit')
    for audit in QualityAudit.objects.all().only('id', 'started_at', 'submitted_at'):
        stamp = audit.submitted_at or audit.started_at or timezone.now()
        QualityAudit.objects.filter(pk=audit.pk).update(updated_at=stamp)


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0024_delivery_run_truck_reopened'),
    ]

    operations = [
        migrations.AddField(
            model_name='qualityaudit',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
        migrations.RunPython(backfill_updated_at, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='qualityaudit',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
