"""Add unique short pickup_code to Reservation (backfill existing rows)."""
import secrets

from django.db import migrations, models
from django.db.models import Q


_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


def _gen_code() -> str:
    return ''.join(secrets.choice(_ALPHABET) for _ in range(5))


def backfill_pickup_codes(apps, schema_editor):
    Reservation = apps.get_model('webstore', 'Reservation')
    used = set(
        Reservation.objects.exclude(pickup_code='')
        .exclude(pickup_code__isnull=True)
        .values_list('pickup_code', flat=True)
    )
    for row in Reservation.objects.filter(Q(pickup_code__isnull=True) | Q(pickup_code='')).iterator():
        for _ in range(40):
            code = _gen_code()
            if code not in used:
                used.add(code)
                row.pickup_code = code
                row.save(update_fields=['pickup_code'])
                break
        else:
            raise RuntimeError(f'Could not allocate pickup_code for reservation {row.pk}')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0010_fix_reservationevent_index_name'),
    ]

    operations = [
        # No db_index here - unique=True below creates the index (+ varchar_pattern_ops).
        migrations.AddField(
            model_name='reservation',
            name='pickup_code',
            field=models.CharField(blank=True, max_length=5, null=True),
        ),
        migrations.RunPython(backfill_pickup_codes, noop_reverse),
        migrations.AlterField(
            model_name='reservation',
            name='pickup_code',
            field=models.CharField(db_index=True, max_length=5, unique=True),
        ),
    ]
