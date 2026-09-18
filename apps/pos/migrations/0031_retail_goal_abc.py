from django.db import migrations


def fix_retail_goal_band(apps, schema_editor):
    Goal = apps.get_model('pos', 'DashboardDepartmentGoal')
    row = Goal.objects.filter(department='retail').first()
    if row is None:
        return
    raw = (row.value or '').strip().upper().replace(' ', '')
    band = raw[:1] if raw else 'B'
    if band not in ('A', 'B', 'C'):
        band = 'B'
    if row.value != band:
        row.value = band
        row.save(update_fields=['value'])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0030_retail_goal_letter'),
    ]

    operations = [
        migrations.RunPython(fix_retail_goal_band, noop_reverse),
    ]
