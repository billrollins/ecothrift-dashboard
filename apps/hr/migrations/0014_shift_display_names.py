from django.db import migrations


NEW_NAMES = {
    'retail_open': 'Retail Open',
    'retail_day': 'Retail Mid',
    'retail_close': 'Retail Close',
    'retail_reset': 'Retail Reset',
    'processing': 'Processing',
    'restoration': 'Restoration',
    'office': 'Office',
}

OLD_NAMES = {
    'retail_open': ('Cashier - Open',),
    'retail_day': ('Cashier - Day',),
    'retail_close': ('Cashier - Close', 'Retail Close'),
    'retail_reset': ('Retail - Reset',),
    'processing': ('Processing - Day',),
    'restoration': ('Restoration - Day',),
    'office': ('Office - Day',),
}


def apply(apps, schema_editor):
    Shift = apps.get_model('hr', 'Shift')
    for code, new_name in NEW_NAMES.items():
        Shift.objects.filter(punch_code=code, name__in=OLD_NAMES[code]).exclude(name=new_name).update(name=new_name)


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0013_office_display_name'),
    ]

    operations = [
        migrations.RunPython(apply, migrations.RunPython.noop),
    ]
