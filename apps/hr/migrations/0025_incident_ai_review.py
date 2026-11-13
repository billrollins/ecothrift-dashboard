"""AI review of an incident report (#133): the 'ai_review' history kind, and the INCIDENT_REVIEW purpose in
Settings > AI, defaulted to Spark Contributor (cheap, fast) when nobody has picked a model for it."""

from django.db import migrations, models

SPARK = 'muse-spark-1.3-contributor'


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiModel = apps.get_model('core', 'AiModel')
    action, _ = AiAction.objects.get_or_create(
        purpose='INCIDENT_REVIEW',
        defaults={'label': 'HR: AI review of an incident report', 'modality': 'text', 'effort': 'low'},
    )
    spark = AiModel.objects.filter(slug=SPARK, status='active').first()
    if action.model_id is None and spark is not None:
        action.model = spark
        action.save(update_fields=['model'])


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0024_incident_reports'),
        ('core', '0017_photo_drop'),
    ]

    operations = [
        migrations.AlterField(
            model_name='incidentnote',
            name='kind',
            field=models.CharField(
                choices=[('note', 'Note'), ('edit', 'Edit'), ('closed', 'Closed'), ('reopened', 'Reopened'),
                         ('photo', 'Photo added'), ('ai_review', 'AI review')],
                default='note', max_length=10,
            ),
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
