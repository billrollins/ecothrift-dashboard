from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0004_soft_delete_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='timeentry',
            name='shift',
            field=models.CharField(
                blank=True,
                choices=[
                    ('retail_open', 'Retail - Open'),
                    ('retail_day', 'Retail - Day'),
                    ('retail_close', 'Retail - Close'),
                    ('restoration', 'Restoration'),
                    ('processing', 'Processing'),
                    ('retail_cs', 'Retail - Customer Service'),
                ],
                default='',
                max_length=20,
            ),
        ),
    ]
