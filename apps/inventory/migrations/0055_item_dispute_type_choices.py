from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0054_processingrow_row_kind'),
    ]

    operations = [
        migrations.AlterField(
            model_name='item',
            name='dispute_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('', 'None'),
                    ('broken', 'Broken'),
                    ('undelivered', 'Undelivered'),
                    ('missing_pieces', 'Missing pieces'),
                    ('cosmetic_damage', 'Cosmetic damage'),
                    ('missing_critical_piece', 'Missing critical piece'),
                    ('bad_condition', 'Bad condition'),
                    ('other', 'Other'),
                ],
                default='',
                help_text='Processor dispute reason; may apply while item remains on shelf.',
                max_length=32,
            ),
        ),
    ]
