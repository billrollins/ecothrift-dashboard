from django.db import migrations


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiAction.objects.get_or_create(
        purpose='SUPERVISOR_BRIEF',
        defaults={'label': "AI supervisor: owner's daily brief", 'modality': 'text', 'effort': 'medium'},
    )


class Migration(migrations.Migration):

    dependencies = [('core', '0009_context_snapshot_daily_brief')]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
