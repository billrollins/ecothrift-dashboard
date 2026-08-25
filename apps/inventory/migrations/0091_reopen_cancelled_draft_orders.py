from django.db import migrations


def reopen_killed_drafts(apps, schema_editor):
    Order = apps.get_model('inventory', 'RestorationPartsOrder')
    Order.objects.filter(
        status='cancelled',
        approved_at__isnull=True,
        purchased_at__isnull=True,
    ).update(
        status='draft',
        requested_at=None,
        requested_by=None,
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0090_parts_order_exclusive_request'),
    ]

    operations = [
        migrations.RunPython(reopen_killed_drafts, noop),
    ]
