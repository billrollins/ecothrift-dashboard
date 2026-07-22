"""Apply Delivery Day uniqueness / integrity constraints after preflight is clean."""

from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Partial unique indexes for canonical Day identity and run/item integrity.

    Operators should run `report_delivery_migration_conflicts --fail-on-blockers`
    before applying this migration in production.
    """

    dependencies = [
        ('pos', '0021_delivery_backfill'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='deliveryday',
            constraint=models.UniqueConstraint(
                fields=['date'],
                condition=models.Q(archived_at__isnull=True, location__isnull=True),
                name='pos_dday_unique_date_no_loc',
            ),
        ),
        migrations.AddConstraint(
            model_name='deliveryday',
            constraint=models.UniqueConstraint(
                fields=['location', 'date'],
                condition=models.Q(archived_at__isnull=True, location__isnull=False),
                name='pos_dday_unique_loc_date',
            ),
        ),
        migrations.AddConstraint(
            model_name='deliveryrun',
            constraint=models.UniqueConstraint(
                fields=['availability'],
                condition=models.Q(is_canonical=True, availability__isnull=False),
                name='pos_drun_one_canonical_per_day',
            ),
        ),
        migrations.AddConstraint(
            model_name='deliveryjobitem',
            constraint=models.UniqueConstraint(
                fields=['job', 'position'],
                condition=models.Q(is_active=True),
                name='pos_djitem_active_position',
            ),
        ),
        migrations.AddConstraint(
            model_name='deliveryaddressrevision',
            constraint=models.UniqueConstraint(
                fields=['job'],
                condition=models.Q(is_active=True),
                name='pos_daddr_one_active_per_job',
            ),
        ),
        migrations.AddConstraint(
            model_name='deliveryattachment',
            constraint=models.UniqueConstraint(
                fields=['run', 'client_photo_id'],
                condition=models.Q(client_photo_id__isnull=False),
                name='pos_datt_run_client_photo',
            ),
        ),
        migrations.AddConstraint(
            model_name='deliveryjobitem',
            constraint=models.CheckConstraint(
                check=models.Q(quantity__gte=1),
                name='pos_djitem_qty_positive',
            ),
        ),
    ]
