from django.db import migrations

SETTINGS = [
    (
        'thrift_plus_floor_share',
        '0.10',
        'Thrift+ rewards: a member never pays less than this share of the tag price. 0.10 means a '
        'reward stops at 90% off; 0 would let it reach the whole tag. Cost plays no part.',
    ),
    (
        'thrift_plus_rewards_start',
        '',
        'Thrift+ rewards: day 1 is never earlier than this date (YYYY-MM-DD). Set it to the launch day '
        'so stock already on the floor starts at day 1; blank counts each item from its own floor date.',
    ),
]


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, value, description in SETTINGS:
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})
    AiAction = apps.get_model('core', 'AiAction')
    AiAction.objects.get_or_create(
        purpose='THRIFTPLUS_FAMILY',
        defaults={'label': 'Thrift+: same family? (reward pacing)', 'modality': 'text', 'effort': 'low'},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0003_reward_engine'),
        ('core', '0010_seed_supervisor_brief_action'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
