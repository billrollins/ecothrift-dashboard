"""Due vs hard deadline on Open / Day / Close, plus auto-nudge source."""
from django.db import migrations, models

from apps.routines.program import apply_program


def reseed(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    apply_program(Routine)


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0014_shift_fk_expected'),
    ]

    operations = [
        migrations.AddField(
            model_name='routine',
            name='hard_time',
            field=models.TimeField(
                blank=True,
                help_text='Hard deadline: red stripe, red chip, and an automatic nudge.',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='qanudge',
            name='source',
            field=models.CharField(default='manual', max_length=16),
        ),
        migrations.RunPython(reseed, migrations.RunPython.noop),
    ]
