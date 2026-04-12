# Copy taxonomy_v1 category from source item for RETAGGED_FROM_DB2 on-shelf items.

from django.db import migrations


def fix_retag_categories(apps, schema_editor):
    Item = apps.get_model('inventory', 'Item')

    retag_items = Item.objects.filter(
        status='on_shelf',
        notes__startswith='RETAGGED_FROM_DB2:',
    )

    updated = 0
    for item in retag_items.iterator():
        first_line = (item.notes or '').split('\n')[0]
        source_sku = first_line.replace('RETAGGED_FROM_DB2:', '').strip()
        if not source_sku:
            continue

        source = Item.objects.filter(sku=source_sku).first()
        if source and source.category and source.category != item.category:
            item.category = source.category
            item.save(update_fields=['category'])
            updated += 1

    print(f'Updated {updated} retag item categories')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0020_po_manual_corrections'),
    ]

    operations = [
        migrations.RunPython(fix_retag_categories, noop_reverse),
    ]
