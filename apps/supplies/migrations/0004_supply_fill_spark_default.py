"""The supply-item fill now reads a pasted product page: relabel it and default it to Spark contributor (cheap, fast).

Only when nobody has picked a model for it yet; Settings > AI can still switch it (Sonnet 5.5 medium if Spark falls short).
"""

from django.db import migrations

SPARK = 'muse-spark-1.3-contributor'


def forward(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiModel = apps.get_model('core', 'AiModel')
    action, _ = AiAction.objects.get_or_create(
        purpose='SUPPLY_FILL', defaults={'label': '', 'modality': 'text', 'effort': 'off'},
    )
    action.label = 'Supplies: fill an item from a pasted product page'
    fields = ['label']
    spark = AiModel.objects.filter(slug=SPARK, status='active').first()
    if action.model_id is None and spark is not None:
        action.model = spark
        fields.append('model')
    action.save(update_fields=fields)


class Migration(migrations.Migration):

    dependencies = [
        ('supplies', '0003_received_and_requests'),
        ('core', '0007_ai_provider_meta'),
    ]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
