from django.db import migrations, models


def forwards_house_to_misc(apps, schema_editor):
    Item = apps.get_model('inventory', 'Item')
    Item.objects.filter(source='house').update(source='misc')


def backwards_misc_to_house(apps, schema_editor):
    Item = apps.get_model('inventory', 'Item')
    Item.objects.filter(source='misc').update(source='house')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0011_add_retaglog'),
    ]

    operations = [
        migrations.AlterField(
            model_name='item',
            name='source',
            field=models.CharField(
                choices=[
                    ('purchased', 'Purchased'),
                    ('consignment', 'Consignment'),
                    ('misc', 'Miscellaneous'),
                ],
                default='purchased',
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards_house_to_misc, backwards_misc_to_house),
    ]
