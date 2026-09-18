from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0007_shift_schedule'),
    ]

    operations = [
        migrations.AddField(
            model_name='shiftassignment',
            name='weekdays',
            field=models.JSONField(
                default=list,
                help_text='Subset of shift days, 0=Mon … 6=Sun. Empty means every day the shift runs.',
            ),
        ),
    ]
