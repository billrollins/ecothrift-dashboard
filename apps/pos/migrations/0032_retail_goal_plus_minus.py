from django.db import migrations


ALLOWED = {'A+', 'A', 'A-', 'B+', 'B', 'B-'}


def normalize_retail_goal(apps, schema_editor):
    Goal = apps.get_model('pos', 'DashboardDepartmentGoal')
    row = Goal.objects.filter(department='retail').first()
    if row is None:
        return
    raw = (row.value or '').strip().upper().replace(' ', '')
    if raw == 'A+':
        letter = 'A+'
    elif raw == 'A':
        letter = 'A'
    elif raw == 'B':
        letter = 'B'
    elif raw == 'C':
        letter = 'B-'
    elif raw in ALLOWED:
        letter = raw
    else:
        letter = 'B'
    if row.value != letter:
        row.value = letter
        row.save(update_fields=['value'])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0031_retail_goal_abc'),
    ]

    operations = [
        migrations.RunPython(normalize_retail_goal, noop_reverse),
    ]
