"""Dash #78, AI routing for buying (owner 11-05).

- Volume work goes to Spark Contributor at low effort: KEY_MAPPING (manifest key -> our bucket), CATEGORY_AI and
  TITLE_CATEGORY_ESTIMATE. Only purposes with no model picked yet are filled (the house pattern, supplies 0004), so a
  choice made in Settings > AI is kept; Settings > AI stays the one place to change it.
- The monthly miss review (BUYING_MISS_REVIEW) is seeded with Opus 5.5 at medium effort (Bill's exception to the
  house ladder, where escalations go to Sonnet 5.5 medium).
- The estimate itself (Estimate Profit, quick check, lightweight valuation) uses no AI.
"""

from django.db import migrations

SPARK = 'muse-spark-1.3-contributor'
OPUS = 'claude-opus-5-5'
VOLUME = {
    'KEY_MAPPING': 'Buying (volume: Spark): manifest category key to our bucket',
    'CATEGORY_AI': 'Buying (volume: Spark): one manifest category key',
    'TITLE_CATEGORY_ESTIMATE': 'Buying (volume: Spark): category mix from a lot title',
}


def forward(apps, schema_editor):
    AiAction = apps.get_model('core', 'AiAction')
    AiModel = apps.get_model('core', 'AiModel')
    spark = AiModel.objects.filter(slug=SPARK, status='active').first()
    opus = AiModel.objects.filter(slug=OPUS, status='active').first()
    for purpose, label in VOLUME.items():
        action, _ = AiAction.objects.get_or_create(
            purpose=purpose, defaults={'label': label, 'modality': 'text', 'effort': 'off'},
        )
        action.label = label
        fields = ['label']
        if action.model_id is None and spark is not None:
            action.model = spark
            action.effort = 'low'
            fields += ['model', 'effort']
        action.save(update_fields=fields)
    review, created = AiAction.objects.get_or_create(
        purpose='BUYING_MISS_REVIEW',
        defaults={'label': 'Buying (monthly): miss review and proposed rate changes', 'modality': 'text',
                  'effort': 'medium', 'model': opus},
    )
    if not created and review.model_id is None and opus is not None:
        review.model = opus
        review.effort = 'medium'
        review.save(update_fields=['model', 'effort'])


class Migration(migrations.Migration):

    dependencies = [
        ('buying', '0041_miss_review'),
        ('core', '0016_dash_fix_session'),
    ]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
