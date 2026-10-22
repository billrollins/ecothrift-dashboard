"""The post ideas' AI purpose (Lane F Phase 4), so Settings > AI can pick its model.

Starts on Gemini 3.8 Flash when the catalog has it active: in a side-by-side on 2026-10-22 the low-cost fallback
(Gemini 3.5 Flash-Lite, `AI_MODEL`) wrote vague ideas and skipped the week's photos, while 3.8 Flash named real items
with their prices and picked their photos, at about 1.4 cents and 7 seconds an idea run. Without it the fallback is
used."""

from django.db import migrations

MODEL = 'gemini-3.8-flash'


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiModel = apps.get_model('core', 'AiModel')
    model = AiModel.objects.filter(slug=MODEL, status='active').first()
    AiAction.objects.get_or_create(
        purpose='SOCIAL_POST',
        defaults={'label': 'Social Studio: post ideas and rewrites', 'modality': 'text', 'effort': 'low', 'model': model},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('marketing', '0002_photo_tag_overlay'),
        ('core', '0013_ai_usage_retire_brief'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
