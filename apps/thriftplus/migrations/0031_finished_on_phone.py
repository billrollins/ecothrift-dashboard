"""
Owner 2026-11-03 (J8, Dash Update #58): a join on the customer's own phone is finished there, with no staff step. Pending
memberships whose main member already has a first and last name, a verified phone, a selfie and the tap on I agree (or
an older signature) become members now, as ``members.finish_on_phone`` does from here on. Never an Assisted join (J22:
those still finish on Finalize) or a practice member. Logged as ``finished_on_phone`` (``by: migration``).

Reverse: puts the memberships this migration finished back to pending.
"""
from django.db import migrations
from django.utils import timezone


def _ready(Person):
    return (Person.objects.filter(role='primary', removed_at__isnull=True, account__status='pending',
                                  account__is_practice=False, phone_verified_at__isnull=False)
            .exclude(first_name='').exclude(last_name='').exclude(photo=''))


def forward(apps, schema_editor):
    Account = apps.get_model('thriftplus', 'Account')
    Card = apps.get_model('thriftplus', 'Card')
    Event = apps.get_model('thriftplus', 'Event')
    Person = apps.get_model('thriftplus', 'Person')
    assisted = set(Event.objects.filter(action='assisted_join', account__isnull=False).values_list('account_id', flat=True))
    done = 0
    for person in _ready(Person).select_related('account'):
        agreed = person.signed_at is not None or bool(person.signature)
        if not agreed or person.account_id in assisted or not person.first_name.strip() or not person.last_name.strip():
            continue
        Account.objects.filter(pk=person.account_id, status='pending').update(status='active')
        Event.objects.create(action='finished_on_phone', account_id=person.account_id, person=person,
                             detail={'by': 'migration'})
        done += 1
        if not Card.objects.filter(person=person, status='active').exists():
            # The member code every member has (members.new_member_code); the app made one already in practice.
            from apps.thriftplus.services.cards import new_code

            code = new_code()
            while Card.objects.filter(code=code).exists():
                code = new_code()
            Card.objects.create(code=code, person=person, status='active', issued_at=timezone.now())
    print(f'\n  Thrift+: {done} phone joins finished (now members).')


def backward(apps, schema_editor):
    Account = apps.get_model('thriftplus', 'Account')
    Event = apps.get_model('thriftplus', 'Event')
    rows = Event.objects.filter(action='finished_on_phone', detail__by='migration')
    Account.objects.filter(pk__in=rows.values_list('account_id', flat=True), status='active').update(status='pending')
    rows.delete()


class Migration(migrations.Migration):

    dependencies = [('thriftplus', '0030_late_return_approved_by')]

    operations = [migrations.RunPython(forward, backward)]
