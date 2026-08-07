# Migration 0007 hardcoded an index name that does not match the one Django
# derives from ReservationEvent.Meta.indexes, which left makemigrations
# permanently dirty. Rename the index to the derived name.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0009_reservation_reopened_event'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='reservationevent',
            new_name='webstore_re_reserva_87017f_idx',
            old_name='webstore_re_reserva_7e8a0c_idx',
        ),
    ]
