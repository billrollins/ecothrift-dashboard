from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0005_timeentry_shift'),
    ]

    operations = [
        migrations.AlterField(
            model_name='timeentry',
            name='shift',
            field=models.CharField(
                blank=True,
                choices=[
                    ('retail_open', 'Cashier - Open'),
                    ('retail_day', 'Cashier - Day'),
                    ('retail_close', 'Cashier - Close'),
                    ('retail_cs', 'Customer Service'),
                    ('processing', 'Processing'),
                    ('restoration', 'Restoration'),
                    ('office', 'Management'),
                ],
                default='',
                max_length=20,
            ),
        ),
    ]
