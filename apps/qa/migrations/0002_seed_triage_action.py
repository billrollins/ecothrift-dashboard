from django.db import migrations


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiAction.objects.get_or_create(
        purpose='QA_TRIAGE',
        defaults={'label': 'Data QA: nightly triage of the checks', 'modality': 'text', 'effort': 'low'},
    )


class Migration(migrations.Migration):

    dependencies = [('qa', '0001_initial'), ('core', '0010_seed_supervisor_brief_action')]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
