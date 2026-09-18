from django.db import migrations


OLD_DEFAULT = [False, True, True, True, True, True, False]
NEW_DEFAULT = [True, True, True, True, True, True, False]
NEW_HELP = 'Every section gets an owner check on these days, open or closed.'


def update_weekdays(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='retail_qa.section_check_weekdays').first()
    if row is None:
        AppSetting.objects.create(
            key='retail_qa.section_check_weekdays',
            value=NEW_DEFAULT,
            description=NEW_HELP,
        )
        return
    if row.value != OLD_DEFAULT:
        return
    row.value = NEW_DEFAULT
    row.description = NEW_HELP
    row.save(update_fields=['value', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_appsettinghistory'),
        ('routines', '0018_nudge_ack'),
    ]

    operations = [
        migrations.RunPython(update_weekdays, migrations.RunPython.noop),
    ]
