"""Dash #224, owner 2026-11-24: "New product from a pasted page" gets its own row in Settings > AI.

In Processing, on a manifest row's New product, the processor pastes all the text of a vendor's product page and the AI
drafts the product (title, brand, category, retail, pack, details) for review before saving. Fast tier, no model of
its own until the owner picks one in Settings > AI.
"""
from django.db import migrations


def seed(apps, schema_editor):
    apps.get_model('core', 'AiAction').objects.get_or_create(purpose='PRODUCT_FROM_PAGE', defaults={
        'label': 'New product from a pasted page',
        'description': ('Processing, a manifest row\'s New product: reads the pasted text of a vendor\'s product page '
                        'with the row\'s own facts and drafts the product (title, brand, category, retail, pack, '
                        'details) for the processor to check before saving.'),
        # Fast tier (Spark Contributor, the house volume model that Add item's Clean up runs on by default): on
        # 2026-11-24 the Standard tier's model refused tool calls through chat completions.
        'workspace': 'Processing', 'page': 'Processing', 'modality': 'text', 'tier': 'fast', 'effort': '',
    })


def unseed(apps, schema_editor):
    apps.get_model('core', 'AiAction').objects.filter(purpose='PRODUCT_FROM_PAGE').delete()


class Migration(migrations.Migration):

    dependencies = [('core', '0022_photo_prompt_action')]

    operations = [migrations.RunPython(seed, unseed)]
