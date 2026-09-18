from django.db import migrations


GRADE_SCALE = [
    {'letter': 'A+', 'min': 97},
    {'letter': 'A', 'min': 93},
    {'letter': 'A-', 'min': 90},
    {'letter': 'B+', 'min': 87},
    {'letter': 'B', 'min': 83},
    {'letter': 'B-', 'min': 80},
    {'letter': 'C+', 'min': 77},
    {'letter': 'C', 'min': 73},
    {'letter': 'C-', 'min': 70},
    {'letter': 'D+', 'min': 67},
    {'letter': 'D', 'min': 65},
    {'letter': 'D-', 'min': 60},
]
OLD_KEYS = (
    'retail_qa.grade_a',
    'retail_qa.grade_b',
    'retail_qa.grade_c',
    'retail_qa.grade_d',
)


def apply(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.update_or_create(
        key='retail_qa.grade_scale',
        defaults={
            'value': GRADE_SCALE,
            'description': 'Ordered letter floors. F is anything below the last min.',
        },
    )
    AppSetting.objects.filter(key__in=OLD_KEYS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_appsettinghistory'),
        ('routines', '0019_section_check_monday'),
    ]

    operations = [
        migrations.RunPython(apply, migrations.RunPython.noop),
    ]
