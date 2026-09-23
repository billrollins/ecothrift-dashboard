"""Move per-purpose AI model choices from .env into Settings > AI.

Before this migration each purpose read ``AI_MODEL_<PURPOSE>`` from .env with a
chain of defaults (see the old ecothrift/settings.py). This copies the value
each purpose was actually using into its AiAction row, creating catalog rows as
needed, so behaviour is unchanged after the env vars are removed. It also adds
INVENTORY_CLEANUP as an action.

- Runs against whatever environment migrates it: local .env locally, Heroku
  config vars in the release phase.
- Skipped under tests so test runs never depend on a developer's .env.
- Rows that already have a model are left alone, so a re-run changes nothing.
"""
from decouple import config
from django.conf import settings
from django.db import migrations


def _norm(model_id):
    mid = (model_id or '').strip()
    if mid == 'claude-haiku-4-6':
        return 'claude-haiku-4-5'
    return mid


def _env(key, default):
    raw = str(config(key, default='') or '').strip()
    return _norm(raw or default)


def old_env_models():
    """The model each purpose resolved to under the old settings.py chain."""
    base = _env('AI_MODEL', 'claude-sonnet-4-6')
    fast = _env('AI_MODEL_FAST', 'claude-haiku-4-5')
    chat = _env('AI_MODEL_AI_CHAT', base)
    item = _env('AI_MODEL_SUGGEST_ITEM', fast)
    return {
        'INVENTORY_CLEANUP': _env('AI_MODEL_INVENTORY_CLEANUP', 'gemini-2.5-flash'),
        'PREPROCESSING_SUGGEST': _env('AI_MODEL_PREPROCESSING_SUGGEST', base),
        'SUGGEST_ITEM': item,
        'SUGGEST_PRODUCT': _env('AI_MODEL_SUGGEST_PRODUCT', item),
        'SUGGEST_FINALIZATION': _env('AI_MODEL_SUGGEST_FINALIZATION', base),
        'AI_CHAT': chat,
        'LABEL_STRUCTURE': _env('AI_MODEL_LABEL_STRUCTURE', chat),
        'LABEL_IMAGE': _env('AI_MODEL_LABEL_IMAGE', 'grok-imagine-image-quality'),
        'MANIFEST_TEMPLATE': _env('AI_MODEL_MANIFEST_TEMPLATE', base),
        'CATEGORY_AI': _env('AI_MODEL_CATEGORY_AI', base),
        'KEY_MAPPING': _env('AI_MODEL_KEY_MAPPING', base),
        'TITLE_CATEGORY_ESTIMATE': _env('AI_MODEL_TITLE_CATEGORY_ESTIMATE', fast),
        'INVENTORY_CLASSIFY': _env('AI_MODEL_INVENTORY_CLASSIFY', fast),
        'FLOORPLAN_SVG': base,
        'FLOORPLAN_ADJUST': base,
    }


def _provider(model_id):
    forced = str(config('AI_PROVIDER', default='auto') or 'auto').strip().lower()
    if forced in ('anthropic', 'xai', 'google'):
        return forced
    mid = model_id.lower()
    if mid.startswith('grok'):
        return 'xai'
    if mid.startswith('gemini'):
        return 'google'
    return 'anthropic'


def copy_env_models(apps, schema_editor):
    AiModel = apps.get_model('core', 'AiModel')
    AiAction = apps.get_model('core', 'AiAction')
    AiAction.objects.get_or_create(
        purpose='INVENTORY_CLEANUP',
        defaults={'label': 'Inventory cleanup (preprocessing)', 'modality': 'text', 'effort': 'off'},
    )
    if getattr(settings, 'RUNNING_TESTS', False):
        return
    for purpose, slug in old_env_models().items():
        if not slug:
            continue
        action = AiAction.objects.filter(purpose=purpose).first()
        if action is None or action.model_id is not None:
            continue
        model, _created = AiModel.objects.get_or_create(
            slug=slug,
            defaults={
                'label': '',
                'provider': _provider(slug),
                'modality': action.modality,
                'status': 'active',
                'source': 'manual',
            },
        )
        if model.modality != action.modality:
            continue
        if model.status != 'active':
            model.status = 'active'
            model.save(update_fields=['status', 'updated_at'])
        action.model = model
        action.save(update_fields=['model', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_seed_ai_settings'),
    ]

    operations = [
        migrations.RunPython(copy_env_models, migrations.RunPython.noop),
    ]
