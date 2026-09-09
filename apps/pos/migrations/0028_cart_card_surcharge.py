# CardX record-only credit surcharge fields + seed pos.card_surcharge

from decimal import Decimal

from django.db import migrations, models


def seed_card_surcharge_setting(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(
        key='pos.card_surcharge',
        defaults={
            'value': {'enabled': True, 'percent': 3},
            'description': (
                'POS credit-card surcharge recorded from CardX '
                '(enabled + percent). Must match the CardX program rate.'
            ),
        },
    )


def unseed_card_surcharge_setting(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.filter(key='pos.card_surcharge').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0027_cartline_sale_fields_assembly'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cart',
            name='card_type',
            field=models.CharField(
                blank=True,
                choices=[('', ''), ('credit', 'Credit'), ('debit', 'Debit')],
                default='',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='cart',
            name='card_surcharge_rate',
            field=models.DecimalField(decimal_places=4, default=Decimal('0'), max_digits=5),
        ),
        migrations.AddField(
            model_name='cart',
            name='card_surcharge_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10),
        ),
        migrations.AddField(
            model_name='cart',
            name='card_charged_total',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.RunPython(seed_card_surcharge_setting, unseed_card_surcharge_setting),
    ]
