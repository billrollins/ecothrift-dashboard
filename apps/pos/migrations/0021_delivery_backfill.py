"""Data backfill for DeliveryDay location/items/stop snapshots."""

from django.db import migrations


def forwards(apps, schema_editor):
    # Import service against live models so backfill helpers stay in one place.
    from apps.pos.services.delivery_migration_backfill import backfill_delivery_days

    backfill_delivery_days(dry_run=False)


def backwards(apps, schema_editor):
    # Non-destructive reverse: leave backfilled rows in place.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0020_delivery_day_expand'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
