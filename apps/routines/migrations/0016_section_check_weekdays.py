from django.db import migrations


def seed_weekdays(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(
        key='retail_qa.section_check_weekdays',
        defaults={
            'value': [False, True, True, True, True, True, False],
            'description': 'Days a section check is required. Default is every open day (Tue-Sat).',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_appsettinghistory'),
        ('routines', '0015_hard_time'),
    ]

    operations = [
        migrations.RunPython(seed_weekdays, migrations.RunPython.noop),
    ]
