from django.db import migrations, models
from django.db.models import F
from django.db.models.functions import Coalesce


def backfill_label_printed_at(apps, schema_editor):
    Item = apps.get_model('inventory', 'Item')
    batch_size = 2000
    last_id = 0
    while True:
        ids = list(
            Item.objects.filter(label_printed_at__isnull=True, id__gt=last_id)
            .order_by('id')
            .values_list('id', flat=True)[:batch_size]
        )
        if not ids:
            break
        Item.objects.filter(pk__in=ids).update(
            label_printed_at=Coalesce(F('checked_in_at'), F('created_at')),
        )
        last_id = ids[-1]


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0066_processingrow_product_links'),
    ]

    operations = [
        migrations.AddField(
            model_name='item',
            name='label_printed_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Set when a shelf label successfully prints; null = never printed.',
                null=True,
            ),
        ),
        migrations.RunPython(backfill_label_printed_at, migrations.RunPython.noop),
    ]
