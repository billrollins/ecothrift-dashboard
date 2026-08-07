# Generated manually for Sales log event history + backfill.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


def backfill_reservation_events(apps, schema_editor):
    Reservation = apps.get_model('webstore', 'Reservation')
    ReservationEvent = apps.get_model('webstore', 'ReservationEvent')

    for res in Reservation.objects.all().iterator():
        created = res.created_at or timezone.now()
        initial_to = (
            'pending_verification'
            if res.status == 'pending_verification' and not res.confirmed_at
            else 'requested'
        )
        rows = [
            {
                'kind': 'requested',
                'from_status': '',
                'to_status': initial_to,
                'actor_id': None,
                'note': 'backfilled',
                'created_at': created,
            },
        ]
        if res.confirmed_at:
            rows.append({
                'kind': 'confirmed',
                'from_status': 'requested',
                'to_status': 'confirmed',
                'actor_id': res.confirmed_by_id,
                'note': 'backfilled',
                'created_at': res.confirmed_at,
            })
        if res.staged_at:
            rows.append({
                'kind': 'staged',
                'from_status': 'confirmed' if res.confirmed_at else 'requested',
                'to_status': 'ready_for_pickup',
                'actor_id': res.staged_by_id,
                'note': 'backfilled',
                'created_at': res.staged_at,
            })
        if res.completed_at:
            note = 'backfilled'
            if res.pos_cart_id:
                note = f'backfilled; POS cart #{res.pos_cart_id}'
            rows.append({
                'kind': 'completed',
                'from_status': (
                    'ready_for_pickup' if res.staged_at else (
                        'confirmed' if res.confirmed_at else 'requested'
                    )
                ),
                'to_status': 'completed',
                'actor_id': res.completed_by_id,
                'note': note,
                'created_at': res.completed_at,
            })
        if res.status in ('declined', 'expired', 'cancelled') and not res.completed_at:
            rows.append({
                'kind': res.status,
                'from_status': '',
                'to_status': res.status,
                'actor_id': None,
                'note': 'backfilled',
                'created_at': res.updated_at or created,
            })

        for row in rows:
            when = row.pop('created_at')
            ev = ReservationEvent.objects.create(reservation_id=res.pk, **row)
            ReservationEvent.objects.filter(pk=ev.pk).update(created_at=when)


def noop_reverse(apps, schema_editor):
    ReservationEvent = apps.get_model('webstore', 'ReservationEvent')
    ReservationEvent.objects.filter(note__startswith='backfilled').delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('webstore', '0006_verified_holds_and_optional_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReservationEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[
                    ('requested', 'Requested'),
                    ('verified', 'Email verified'),
                    ('confirmed', 'Confirmed'),
                    ('staged', 'Staged'),
                    ('extended', 'Extended'),
                    ('completed', 'Completed'),
                    ('declined', 'Declined'),
                    ('expired', 'Expired'),
                    ('cancelled', 'Cancelled'),
                ], max_length=24)),
                ('from_status', models.CharField(blank=True, default='', max_length=24)),
                ('to_status', models.CharField(blank=True, default='', max_length=24)),
                ('note', models.CharField(blank=True, default='', max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('reservation', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='events',
                    to='webstore.reservation',
                )),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='reservationevent',
            index=models.Index(fields=['reservation', 'created_at'], name='webstore_re_reserva_7e8a0c_idx'),
        ),
        migrations.RunPython(backfill_reservation_events, noop_reverse),
    ]
