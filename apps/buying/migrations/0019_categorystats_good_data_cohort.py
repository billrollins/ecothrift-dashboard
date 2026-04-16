# Generated manually for good-data cohort fields and help_text updates.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('buying', '0018_alter_categorystats_recovery_rate'),
    ]

    operations = [
        migrations.AddField(
            model_name='categorystats',
            name='good_data_sample_size',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Count of sold rows in the good-data cohort (sale, retail, cost each 0.01–9999).',
            ),
        ),
        migrations.AddField(
            model_name='categorystats',
            name='recovery_cost_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='SUM(cost) for qualifying sold rows (same cohort as recovery_rate).',
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='categorystats',
            name='avg_cost',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text=(
                    'Mean cost per qualifying sold row (sale + retail + cost each in [0.01, 9999], all-time).'
                ),
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='categorystats',
            name='avg_retail',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text=(
                    'Mean retail_value per qualifying sold row (sale + retail + cost each in [0.01, 9999], all-time).'
                ),
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='categorystats',
            name='avg_sold_price',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text=(
                    'Mean sold_for per qualifying sold row (sale + retail + cost each in [0.01, 9999], all-time).'
                ),
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='categorystats',
            name='recovery_rate',
            field=models.DecimalField(
                decimal_places=6,
                help_text=(
                    '0–1; SUM(sold_for)/SUM(retail_value) for all-time sold rows where sold_for, '
                    'retail_value, and cost are each between 0.01 and 9999; 0 when denominator is zero.'
                ),
                max_digits=8,
            ),
        ),
    ]
