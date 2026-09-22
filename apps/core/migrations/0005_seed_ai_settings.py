"""Seed Settings > AI: four starting models and one row per AI purpose.

get_or_create is used on purpose so a re-run never wipes a superuser's
assignment. Astra (OpenAI gpt-6-astra) is not seeded: the router has no
OpenAI provider.
"""
from django.db import migrations

# (slug, label, provider)
SEED_MODELS = [
    ('grok-4.7', 'Grok 4.7', 'xai'),
    ('claude-opus-5-5', 'Claude Opus 5.5', 'anthropic'),
    ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'google'),
    ('gemini-3.8-flash', 'Gemini 3.8 Flash', 'google'),
]

# (purpose, label, modality, effort)
SEED_ACTIONS = [
    ('AI_CHAT', 'AI chat', 'text', 'off'),
    ('CATEGORY_AI', 'Buying category AI', 'text', 'off'),
    ('FLOORPLAN_ADJUST', 'Floorplan: adjust this plan', 'text', 'low'),
    ('FLOORPLAN_SVG', 'Floorplan: build an element SVG', 'text', 'low'),
    ('INVENTORY_CLASSIFY', 'Inventory category classify', 'text', 'off'),
    ('KEY_MAPPING', 'Manifest key mapping', 'text', 'off'),
    ('LABEL_IMAGE', 'Label Studio background image', 'image', 'off'),
    ('LABEL_STRUCTURE', 'Label Studio AI Create layout', 'text', 'off'),
    ('MANIFEST_TEMPLATE', 'Manifest template', 'text', 'off'),
    ('PREPROCESSING_SUGGEST', 'Preprocessing suggest', 'text', 'off'),
    ('SUGGEST_FINALIZATION', 'Suggest finalization', 'text', 'off'),
    ('SUGGEST_ITEM', 'Suggest item', 'text', 'off'),
    ('SUGGEST_PRODUCT', 'Suggest product', 'text', 'off'),
    ('TITLE_CATEGORY_ESTIMATE', 'Title category estimate', 'text', 'off'),
]


def seed(apps, schema_editor):
    AiModel = apps.get_model('core', 'AiModel')
    AiAction = apps.get_model('core', 'AiAction')
    for slug, label, provider in SEED_MODELS:
        AiModel.objects.get_or_create(
            slug=slug,
            defaults={
                'label': label,
                'provider': provider,
                'modality': 'text',
                'status': 'active',
                'source': 'manual',
            },
        )
    for purpose, label, modality, effort in SEED_ACTIONS:
        AiAction.objects.get_or_create(
            purpose=purpose,
            defaults={'label': label, 'modality': modality, 'effort': effort},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_ai_settings'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
