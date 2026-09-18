from django.db import migrations, models


TUE_SAT = [1, 2, 3, 4, 5]
LETTERS = set('ABCDEF')


def _is_numeric_goal(value: str) -> bool:
    text = (value or '').strip()
    if not text:
        return False
    try:
        float(text)
    except ValueError:
        return False
    return True


def _is_letter_goal(value: str) -> bool:
    return (value or '').strip().upper() in LETTERS


def convert_retail_goal(apps, schema_editor):
    Goal = apps.get_model('pos', 'DashboardDepartmentGoal')
    row = Goal.objects.filter(department='retail').first()
    if row is None:
        Goal.objects.create(
            department='retail',
            value='B',
            description='Target QA letter grade.',
            schedule={'weekdays': list(TUE_SAT)},
        )
        return

    schedule = dict(row.schedule) if isinstance(row.schedule, dict) else {}
    weekdays = []
    for raw in schedule.get('weekdays') or []:
        try:
            day = int(raw)
        except (TypeError, ValueError):
            continue
        if 0 <= day <= 6 and day not in weekdays:
            weekdays.append(day)
    if not weekdays:
        weekdays = list(TUE_SAT)

    value = (row.value or '').strip()
    if _is_numeric_goal(value):
        row.value = 'B'
    elif not _is_letter_goal(value) and not value:
        row.value = 'B'

    row.schedule = {'weekdays': weekdays}
    row.save(update_fields=['value', 'schedule'])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0029_cart_card_type_fixed'),
    ]

    operations = [
        migrations.AlterField(
            model_name='dashboarddepartmentgoal',
            name='schedule',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Optional schedule configuration. Retail QA uses {"weekdays": [0..6]}.',
            ),
        ),
        migrations.RunPython(convert_retail_goal, noop_reverse),
    ]
