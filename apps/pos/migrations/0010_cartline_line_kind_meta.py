# Generated manually for CartLine.line_kind + meta

from django.db import migrations, models


def backfill_manual_kinds(apps, schema_editor):
    CartLine = apps.get_model('pos', 'CartLine')
    CartLine.objects.filter(item__isnull=True).update(line_kind='manual')


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0009_qualityauditform'),
    ]

    operations = [
        migrations.AddField(
            model_name='cartline',
            name='line_kind',
            field=models.CharField(
                choices=[
                    ('item', 'Inventory item'),
                    ('manual', 'Manual / unscannable'),
                    ('discount', 'Discount / store credit'),
                    ('delivery', 'Delivery fee'),
                ],
                db_index=True,
                default='item',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='cartline',
            name='meta',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(backfill_manual_kinds, migrations.RunPython.noop),
    ]
