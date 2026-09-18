from django.db import migrations


def apply(apps, schema_editor):
    Department = apps.get_model('hr', 'Department')
    Department.objects.filter(slug='office', name='Management').update(name='Office')


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0012_shift_set_unique_punch'),
    ]

    operations = [
        migrations.RunPython(apply, migrations.RunPython.noop),
    ]
