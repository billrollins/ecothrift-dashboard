from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('routines', '0002_retail_opening_checklist'),
    ]

    operations = [
        migrations.AddField(
            model_name='routine',
            name='anchor_date',
            field=models.DateField(
                blank=True,
                help_text='First due date for a bi-weekly cycle. Later dues land every 14 days.',
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='routine',
            name='trigger',
            field=models.CharField(
                choices=[
                    ('daily', 'Daily'),
                    ('weekly', 'Weekly'),
                    ('biweekly', 'Bi-weekly'),
                    ('monthly', 'Monthly'),
                    ('quarterly', 'Quarterly'),
                    ('annual', 'Annual'),
                    ('on_demand', 'On demand'),
                ],
                default='daily',
                max_length=20,
            ),
        ),
    ]
