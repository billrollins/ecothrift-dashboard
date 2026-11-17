"""Ad results (Dash #182): a boost spend row becomes the ad read from a pasted results page, and the AD_RESULTS AI
purpose in Settings > AI, defaulted to Spark Contributor when nobody has picked a model for it."""

from django.db import migrations, models


SPARK = 'muse-spark-1.3-contributor'


def seed(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiModel = apps.get_model('core', 'AiModel')
    action, _ = AiAction.objects.get_or_create(
        purpose='AD_RESULTS',
        defaults={'label': 'Social: read a pasted ad results page', 'modality': 'text', 'effort': 'low'},
    )
    spark = AiModel.objects.filter(slug=SPARK, status='active').first()
    if action.model_id is None and spark is not None:
        action.model = spark
        action.save(update_fields=['model'])


class Migration(migrations.Migration):

    dependencies = [
        ('marketing', '0005_post_channels'),
        ('core', '0017_photo_drop'),
    ]

    operations = [
        migrations.AddField(
            model_name='marketingspend',
            name='audience',
            field=models.JSONField(blank=True, default=dict, help_text='Totals only: place, ages, women/men split.'),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='category_weights',
            field=models.JSONField(blank=True, default=dict, help_text='Categories to watch, {"Category" or "Category › Subcategory": percent}, summing to 100; {"ALL": 100}.'),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='daily_budget',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='end_day',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='goal',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='photos',
            field=models.ManyToManyField(blank=True, related_name='ads', to='marketing.socialphoto'),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='post_text',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='marketingspend',
            name='results',
            field=models.JSONField(blank=True, default=dict, help_text='Reach, views, engagements, link clicks and so on.'),
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
