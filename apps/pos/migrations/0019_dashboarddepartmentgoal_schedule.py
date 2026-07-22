from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0018_delivery_board_unified'),
    ]

    operations = [
        migrations.AddField(
            model_name='dashboarddepartmentgoal',
            name='schedule',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Optional schedule configuration. Retail QA uses '
                    '{"weekdays": [0..6], "audits_per_day": N}.'
                ),
            ),
        ),
    ]
