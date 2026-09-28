from django.db import migrations

SETTINGS = [
    (
        'thrift_plus_cover_amount',
        '10.00',
        'Thrift+: the monthly cover. The first this-many dollars of rewards each calendar month pay for '
        'the membership; it resets on the 1st.',
    ),
    (
        'thrift_plus_bank_bonus',
        '0.05',
        'Thrift+: the bonus on banked rewards (0.05 = the reward past the cover is banked at 1.05x). '
        'Never above 0.10. See .ai/extended/discount-logic.md.',
    ),
    (
        'thrift_plus_return_credit_share',
        '0.95',
        'Thrift+ returns: store credit is this share of what was paid for the item, before tax '
        '(0.95: the 5% is the cost of not testing in the store).',
    ),
    (
        'thrift_plus_test_registers',
        [],
        'Thrift+: register codes where Thrift+ is live even while the switch is off (a test register, '
        'the staff dry run). Empty at launch.',
    ),
    (
        'thrift_plus_nonreturnable_categories',
        ['Apparel & accessories', 'Bedding', 'Linens', 'Towels', 'Curtains'],
        'Thrift+ returns: product categories or subcategories that are final sale (clothing and soft goods).',
    ),
    (
        'thrift_plus_nonreturnable_words',
        ['as-is', 'as is', 'for parts', 'parts only', 'untested', 'crossbow'],
        'Thrift+ returns: words in a title, note or flag that make an item final sale.',
    ),
]


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    for key, value, description in SETTINGS:
        AppSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': description})


class Migration(migrations.Migration):

    dependencies = [('thriftplus', '0005_register')]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
