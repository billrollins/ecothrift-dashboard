from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0010_routine_audience'),
    ]

    operations = [
        migrations.AlterField(
            model_name='routine',
            name='subject_source',
            field=models.CharField(
                choices=[
                    ('pool', 'No section (plain checklist)'),
                    ('my_section', 'The sections this person owns'),
                    ('other_section', "Somebody else's section, rotating"),
                ],
                default='pool',
                max_length=20,
            ),
        ),
        migrations.RemoveField(
            model_name='routine',
            name='subject_pool',
        ),
    ]
