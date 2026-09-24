"""Revenue shrink per listing-condition group (register AUC-05), in Admin > Assumptions.

Seeded at 0 = "use the buying revenue shrink", so valuation is unchanged until the owner
sets a group. Groups: apps/buying/services/condition.py.
"""
from django.db import migrations

GROUPS = (
    ('new', 'New / Brand New'),
    ('like_new', 'Like New'),
    ('used_good', 'Used Good'),
    ('used_fair', 'Used Fair'),
    ('damaged', 'Salvage / Scratch & Dent'),
)


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for group, phrases in GROUPS:
        AppSetting.objects.get_or_create(
            key=f'buying_shrink_{group}',
            defaults={
                'value': 0,
                'description': (
                    f'Buying: revenue shrink (0-1) for auctions listed as {phrases}; '
                    '0 = use the buying revenue shrink.'
                ),
            },
        )


def unseed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.filter(key__in=[f'buying_shrink_{g}' for g, _ in GROUPS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('buying', '0028_taxonomy_23_categories'),
        ('core', '0007_ai_provider_meta'),
    ]

    operations = [migrations.RunPython(seed, unseed)]
