# Generated manually — ProcessingRow.search_string for workspace substring search.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0042_processing_data_build'),
    ]

    operations = [
        migrations.AddField(
            model_name='processingrow',
            name='search_string',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Lowercased denormalized blob for substring workspace search; rebuilt on save.',
            ),
        ),
    ]
