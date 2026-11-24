"""Dash #209, owner 2026-11-24: the photo editor's prompt writer gets its own row in Settings > AI.

Before each AI run a text model that reads photos looks at the picture with the house rules and writes the image
model's prompt for that photo (what brand labels to keep, which price tag to remove). It sits on the Standard tier
with no model of its own, like the other photo readers (Keys, Add item drafts).
"""
from django.db import migrations


def seed(apps, schema_editor):
    apps.get_model('core', 'AiAction').objects.get_or_create(purpose='PHOTO_PROMPT', defaults={
        'label': 'Write the prompt for one photo',
        'description': ('Photo editor, AI tab: reads the photo with the house rules and writes the image model\'s '
                        'prompt for it (brand labels to keep, price tags to remove). Needs a model that reads photos.'),
        'workspace': 'Processing', 'page': 'Photo projects', 'modality': 'text', 'tier': 'standard', 'effort': '',
    })


def unseed(apps, schema_editor):
    apps.get_model('core', 'AiAction').objects.filter(purpose='PHOTO_PROMPT').delete()


class Migration(migrations.Migration):

    dependencies = [('core', '0021_photo_bg_keeps_brands')]

    operations = [migrations.RunPython(seed, unseed)]
