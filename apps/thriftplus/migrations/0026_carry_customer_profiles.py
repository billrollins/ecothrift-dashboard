"""One customer system (standards T62, 2026-10-20): carry what ``accounts.CustomerProfile`` still holds onto the
customer's Thrift+ person, so the profile can stop being read or written.

Per profile of a website customer (never a staff login), in its own savepoint:

1. The login joins the Customer group (that group is what marks a website customer now).
2. Its Thrift+ person is found: the one linked to the login, else the unlinked person with the same email (an active
   membership first, then pending; never a staff or practice membership), which is then linked (``Person.user``).
3. No person yet, a confirmed email and a name: a pending membership is made (the same rows ``one_account.person_for_user``
   makes, no member code: the app makes one on first use), dated the customer's "since" day. A profile whose email was
   never confirmed makes none: an unconfirmed pending membership is purged after 24 hours, and the owner's rule is "a
   member account IF they have email verified AND a name".
4. On the person: ``email_verified_at`` is copied (only when the person's email is the login's email), and the profile
   notes are added to ``Account.notes`` (never twice). One ``customer_record_carried`` event keeps the old CUS number.

Idempotent (run it twice and nothing changes) and it deletes nothing: the profile rows stay, unread, until a later
release drops the table. A profile that cannot be carried is skipped and counted; the release does not fail on it.
"""
from collections import Counter
from datetime import datetime

from django.db import migrations, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.services.names import clean_name  # pure functions, no models

STAFF_GROUPS = ('Admin', 'Manager', 'Employee', 'Consignee')
MADE_NOTE = 'Made from an ecothrift.us customer record (one customer system, 2026-10-20).'
RANK = {'active': 0, 'pending': 1}


def _find_person(Person, user, email):
    person = Person.objects.select_related('account').filter(user=user).first()
    if person is not None or not email:
        return person, False
    candidates = list(Person.objects.select_related('account').filter(
        email=email, removed_at__isnull=True, user__isnull=True,
        account__staff_user__isnull=True, account__is_practice=False)[:20])
    if not candidates:
        return None, False
    candidates.sort(key=lambda p: (RANK.get(p.account.status, 2), p.role != 'primary', p.pk))
    return candidates[0], True


def carry(apps, schema_editor):
    CustomerProfile = apps.get_model('accounts', 'CustomerProfile')
    User = apps.get_model('accounts', 'User')
    Group = apps.get_model('auth', 'Group')
    Account = apps.get_model('thriftplus', 'Account')
    Person = apps.get_model('thriftplus', 'Person')
    Event = apps.get_model('thriftplus', 'Event')

    group = Group.objects.filter(name__iexact='customer').first() or Group.objects.create(name='Customer')
    staff_ids = set(User.objects.filter(
        Q(is_superuser=True) | Q(is_staff=True) | Q(groups__name__in=STAFF_GROUPS)).values_list('pk', flat=True))
    stats = Counter()

    for profile in CustomerProfile.objects.select_related('user').order_by('pk').iterator():
        user = profile.user
        if user.pk in staff_ids:
            stats['staff_skipped'] += 1
            continue
        try:
            with transaction.atomic():
                email = (user.email or '').strip().lower()
                if not user.groups.filter(pk=group.pk).exists():
                    user.groups.add(group)
                    stats['joined_group'] += 1
                person, by_email = _find_person(Person, user, email)
                if person is not None and by_email:
                    person.user = user
                    person.save(update_fields=['user', 'updated_at'])
                    stats['linked'] += 1
                if person is None and email and profile.email_verified_at:
                    first, last = clean_name(user.first_name, user.last_name)
                    if first:
                        account = Account.objects.create(status='pending', notes=MADE_NOTE)
                        since = profile.customer_since
                        if since:
                            Account.objects.filter(pk=account.pk).update(created_at=timezone.make_aware(
                                datetime(since.year, since.month, since.day, 12)))
                        person = Person.objects.create(
                            account=account, role='primary', first_name=first, last_name=last, email=email,
                            user=user, email_verified_at=profile.email_verified_at)
                        Event.objects.create(action='joined_website', account=account, person=person,
                                             detail={'source': 'customer_profile',
                                                     'customer_number': profile.customer_number})
                        stats['made'] += 1
                if person is None:
                    stats['no_person'] += 1
                    continue
                if (profile.email_verified_at and person.email_verified_at is None
                        and (person.email or '').strip().lower() == email):
                    person.email_verified_at = profile.email_verified_at
                    person.save(update_fields=['email_verified_at', 'updated_at'])
                    stats['verified_copied'] += 1
                note = (profile.notes or '').strip()
                account = person.account
                if note and note not in (account.notes or ''):
                    account.notes = f'{account.notes.rstrip()}\n{note}'.strip() if account.notes else note
                    account.save(update_fields=['notes', 'updated_at'])
                    stats['notes_copied'] += 1
                logged = (Event.objects.filter(person=person, action='customer_record_carried').exists()
                          or Event.objects.filter(person=person, action='joined_website',
                                                  detail__source='customer_profile').exists())
                if not logged:
                    Event.objects.create(action='customer_record_carried', account=account, person=person, detail={
                        'customer_number': profile.customer_number,
                        'customer_since': profile.customer_since.isoformat() if profile.customer_since else '',
                    })
        except Exception as exc:  # noqa: BLE001 - one bad row never fails the release
            stats['failed'] += 1
            print(f'  customer profile {profile.pk} not carried: {exc.__class__.__name__}: {exc}')
    print(f'  customer profiles carried to Thrift+: {dict(stats) or "none to carry"}')


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0025_staff_sign_in_qr'),
        ('accounts', '0011_account_event_merge_kinds'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(carry, migrations.RunPython.noop),
    ]
