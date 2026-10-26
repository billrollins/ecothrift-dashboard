"""The keys' AI purpose, so Settings > AI can pick its model: it reads a key photo and picks the match from a grid.

Starts on Gemini 3.8 Flash when the catalog has it active (a low-cost model that reads photos); without it the
fallback (`AI_MODEL`) is used."""

from django.db import migrations

MODEL = 'gemini-3.8-flash'


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiModel = apps.get_model('core', 'AiModel')
    model = AiModel.objects.filter(slug=MODEL, status='active').first()
    AiAction.objects.get_or_create(
        purpose='KEYS',
        defaults={'label': 'Keys: read a key photo and find its match', 'modality': 'text', 'effort': 'low',
                  'model': model},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('keys', '0001_initial'),
        ('core', '0013_ai_usage_retire_brief'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
