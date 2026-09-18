from django.db import migrations


RENAMES = {
    'retail.open': (('Retail open',), 'Opening checklist'),
    'retail.day': (('Retail day',), 'Midday checklist'),
    'retail.close': (('Retail close',), 'Closing checklist'),
    'retail.section_tally': (('My section daily check', 'My section - daily check'), 'Section check'),
    'retail.section_audit': (('Tuesday cross-check',), 'Cross-check'),
    'retail.owner_spot': (('Owner spot check',), 'Spot walk'),
    'retail.work_cycle': (('Work cycle',), 'Register activity'),
}


def apply(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    for key, (old_names, new_name) in RENAMES.items():
        Routine.objects.filter(system_key=key, title__in=old_names).exclude(title=new_name).update(title=new_name)


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0020_grade_scale'),
    ]

    operations = [
        migrations.RunPython(apply, migrations.RunPython.noop),
    ]
