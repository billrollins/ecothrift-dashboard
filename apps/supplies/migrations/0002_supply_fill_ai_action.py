"""The supply-item fill's AI purpose, so Settings > AI can pick its model (blank = the AI_MODEL fallback)."""

from django.db import migrations


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiAction.objects.get_or_create(
        purpose='SUPPLY_FILL',
        defaults={'label': 'Supplies: fill an item from a pasted link', 'modality': 'text', 'effort': 'off'},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('supplies', '0001_initial'),
        ('core', '0013_ai_usage_retire_brief'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
