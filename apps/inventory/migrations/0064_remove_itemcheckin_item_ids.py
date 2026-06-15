"""Remove legacy ItemCheckIn.item_ids JSON membership column."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0063_item_check_in_normalization'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='itemcheckin',
            name='item_ids',
        ),
    ]
