"""The training register (Bill, 2026-10-10): a register whose sales change nothing real."""
from django.db import migrations, models


def add_training_register(apps, schema_editor):
    Register = apps.get_model('pos', 'Register')
    WorkLocation = apps.get_model('core', 'WorkLocation')
    if Register.objects.filter(is_training=True).exists() or Register.objects.filter(code='TRAIN').exists():
        return
    location = WorkLocation.objects.order_by('pk').first()
    if location is None:
        return
    Register.objects.create(location=location, name='Training register', code='TRAIN', is_training=True)


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0034_staff_purchases'),
    ]

    operations = [
        migrations.AddField(
            model_name='register',
            name='is_training',
            field=models.BooleanField(
                default=False,
                help_text='Training register: sales are practice only (no money, no items sold, left out of every report).',
            ),
        ),
        migrations.AlterField(
            model_name='cart',
            name='status',
            field=models.CharField(
                choices=[('open', 'Open'), ('completed', 'Completed'), ('voided', 'Voided'),
                         ('training', 'Training (not a sale)')],
                default='open', max_length=20,
            ),
        ),
        migrations.RunPython(add_training_register, migrations.RunPython.noop),
    ]
