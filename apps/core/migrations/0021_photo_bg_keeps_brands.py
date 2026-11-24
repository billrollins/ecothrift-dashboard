"""Remove background keeps brands (owner 2026-11-24): the Settings > AI wording for PHOTO_REMOVE_BACKGROUND.

0020 is already applied in production, so its text is fixed here rather than edited there.
"""
from django.db import migrations

OLD = ('Photo editor, AI tab: the item alone on white, black or a picked color, tags and stickers removed. The '
       'answer keeps the shape of the version it was made from.')
NEW = ('Photo editor, AI tab: the item alone on white, black or a picked color, price tags removed, brands kept. The '
       'answer keeps the shape of the version it was made from.')


def forwards(apps, schema_editor):
    apps.get_model('core', 'AiAction').objects.filter(purpose='PHOTO_REMOVE_BACKGROUND', description=OLD).update(description=NEW)


def backwards(apps, schema_editor):
    apps.get_model('core', 'AiAction').objects.filter(purpose='PHOTO_REMOVE_BACKGROUND', description=NEW).update(description=OLD)


class Migration(migrations.Migration):
    dependencies = [('core', '0020_photo_versions')]
    operations = [migrations.RunPython(forwards, backwards)]
