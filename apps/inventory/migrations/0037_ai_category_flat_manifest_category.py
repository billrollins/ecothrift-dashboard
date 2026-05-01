# Generated manually: flat EcoThrift category on PreprocessingRow + ManifestRow.category

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0036_preprocessing_three_layer'),
    ]

    operations = [
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_category',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_category',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='manifestrow',
            name='category',
            field=models.CharField(
                blank=True,
                default='',
                help_text='EcoThrift taxonomy v1 category (from preprocessing final_category).',
                max_length=200,
            ),
        ),
    ]
