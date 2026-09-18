from django.db import migrations


NAMES = {
    'retail-operations': 'Retail',
    'office': 'Management',
}


def apply_names(apps, schema_editor):
    Department = apps.get_model('hr', 'Department')
    for slug, name in NAMES.items():
        Department.objects.filter(slug=slug).exclude(name=name).update(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0010_department_slug_icon_sort'),
    ]

    operations = [
        migrations.RunPython(apply_names, migrations.RunPython.noop),
    ]
