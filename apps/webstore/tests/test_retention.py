"""Retention tiers: archive by age or by hand, purge only abandoned holds."""
from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.webstore.models import (
    Conversation,
    HoldConfirmation,
    Message,
    Reservation,
    WebListing,
)
from apps.webstore.services import retention
from apps.webstore.services.conversations import (
    open_for_reservation,
    post_message,
    resolve_conversation,
)
from apps.webstore.services.reservations import (
    complete_reservation,
    record_event,
    release_reservation,
)
from apps.webstore.tests.helpers import make_verified_hold


def _listing(slug='retention-lamp', on_hand=5):
    return WebListing.objects.create(
        title='Retention Lamp',
        slug=slug,
        price=Decimal('20.00'),
        on_hand=on_hand,
        reserved=0,
        status='published',
        return_policy='final_sale',
    )


def _manager(email='retention-mgr@example.com'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email, first_name='R', last_name='M', password='x',
    )
    user.groups.add(group)
    return user


def _age(reservation, days):
    """Push updated_at back past a retention window (auto_now blocks assignment)."""
    stamp = timezone.now() - timedelta(days=days)
    Reservation.objects.filter(pk=reservation.pk).update(updated_at=stamp)
    reservation.refresh_from_db()
    return reservation


@override_settings(ONLINE_SALES_ENABLED=True)
class ArchiveByHandTests(TestCase):
    def setUp(self):
        self.mgr = _manager()
        self.listing = _listing()

    def _hold(self, email='ada@example.com'):
        return make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email=email,
        )

    def test_active_hold_cannot_be_archived(self):
        hold = self._hold()
        with self.assertRaises(ValidationError):
            retention.archive_reservation(hold, user=self.mgr)
        hold.refresh_from_db()
        self.assertIsNone(hold.archived_at)

    def test_released_hold_archives_and_keeps_status_and_stock(self):
        hold = self._hold()
        release_reservation(hold, 'cancelled', user=self.mgr, reason='Damaged')
        hold.refresh_from_db()
        self.listing.refresh_from_db()
        reserved_before = self.listing.reserved

        archived = retention.archive_reservation(hold, user=self.mgr)
        self.listing.refresh_from_db()

        self.assertIsNotNone(archived.archived_at)
        self.assertEqual(archived.archived_by, self.mgr)
        self.assertEqual(archived.status, 'cancelled')
        self.assertEqual(self.listing.reserved, reserved_before)

    def test_completed_hold_can_be_archived(self):
        hold = self._hold()
        complete_reservation(hold, user=self.mgr)
        hold.refresh_from_db()
        archived = retention.archive_reservation(hold, user=self.mgr)
        self.assertIsNotNone(archived.archived_at)

    def test_archive_is_idempotent_and_reversible(self):
        hold = self._hold()
        release_reservation(hold, 'expired', user=self.mgr, reason='No-show')
        hold.refresh_from_db()
        first = retention.archive_reservation(hold, user=self.mgr)
        again = retention.archive_reservation(first, user=self.mgr)
        self.assertEqual(first.archived_at, again.archived_at)

        restored = retention.unarchive_reservation(again)
        self.assertIsNone(restored.archived_at)
        self.assertIsNone(restored.archived_by)

    def test_unresolved_thread_cannot_be_archived(self):
        hold = self._hold()
        conv = open_for_reservation(hold)
        with self.assertRaises(ValidationError):
            retention.archive_conversation(conv, user=self.mgr)

    def test_resolved_thread_archives(self):
        hold = self._hold()
        conv = open_for_reservation(hold)
        resolve_conversation(conv)
        conv.refresh_from_db()
        archived = retention.archive_conversation(conv, user=self.mgr)
        self.assertIsNotNone(archived.archived_at)
        self.assertEqual(archived.state, 'resolved')


@override_settings(ONLINE_SALES_ENABLED=True)
class ArchiveByAgeTests(TestCase):
    def setUp(self):
        self.mgr = _manager()
        self.listing = _listing(on_hand=10)

    def _released(self, *, days, email='ada@example.com', status='expired'):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email=email,
        )
        release_reservation(hold, status, user=self.mgr, reason='Expired')
        return _age(hold, days)

    def test_only_holds_past_the_window_are_selected(self):
        old = self._released(days=45, email='old@example.com')
        fresh = self._released(days=3, email='fresh@example.com')
        due = list(retention.stale_released_holds())
        self.assertIn(old, due)
        self.assertNotIn(fresh, due)

    def test_completed_sales_are_never_archived_by_age(self):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email='paid@example.com',
        )
        complete_reservation(hold, user=self.mgr)
        _age(hold, 400)
        self.assertNotIn(hold, list(retention.stale_released_holds()))

    def test_archive_stale_is_idempotent(self):
        self._released(days=45, email='old@example.com')
        first = retention.archive_stale()
        second = retention.archive_stale()
        self.assertEqual(first['holds_archived'], 1)
        self.assertEqual(second['holds_archived'], 0)

    def test_stale_resolved_threads_selected_by_last_message(self):
        hold = self._released(days=1, email='thread@example.com')
        conv = open_for_reservation(hold)
        post_message(conv, author_kind='customer', body='Still available?')
        resolve_conversation(conv)
        Conversation.objects.filter(pk=conv.pk).update(
            last_message_at=timezone.now() - timedelta(days=60),
        )
        due = list(retention.stale_resolved_threads())
        self.assertEqual([c.pk for c in due], [conv.pk])

    def test_open_threads_are_never_archived_by_age(self):
        hold = self._released(days=1, email='open@example.com')
        conv = open_for_reservation(hold)
        Conversation.objects.filter(pk=conv.pk).update(
            state='needs_reply', last_message_at=timezone.now() - timedelta(days=200),
        )
        self.assertEqual(list(retention.stale_resolved_threads()), [])


@override_settings(ONLINE_SALES_ENABLED=True)
class PurgeAbandonedTests(TestCase):
    def setUp(self):
        self.mgr = _manager()
        self.listing = _listing(on_hand=10)

    def _abandoned(self, *, days=45, email='ghost@example.com'):
        """An unverified hold that expired without the customer confirming."""
        hold = Reservation.objects.create(
            listing=self.listing,
            pickup_code=f'A{Reservation.objects.count():04d}',
            customer_name='Ghost',
            email=email,
            quantity=1,
            status='pending_verification',
            unit_price_snapshot=self.listing.price,
        )
        release_reservation(hold, 'expired', user=None, reason='Never confirmed')
        return _age(hold, days)

    def test_never_verified_hold_is_purge_eligible(self):
        hold = self._abandoned()
        self.assertIn(hold, list(retention.abandoned_holds()))

    def test_recent_abandoned_hold_is_left_alone(self):
        hold = self._abandoned(days=5)
        self.assertNotIn(hold, list(retention.abandoned_holds()))

    def test_verified_hold_is_never_purged(self):
        hold = self._abandoned(email='verified@example.com')
        record_event(hold, 'verified', to_status='requested')
        self.assertNotIn(hold, list(retention.abandoned_holds()))

    def test_confirmed_email_blocks_purge(self):
        hold = self._abandoned(email='confirmed@example.com')
        HoldConfirmation.objects.create(
            reservation=hold,
            email=hold.email,
            code_hash='x' * 64,
            token_hash='y' * 64,
            expires_at=timezone.now() - timedelta(days=40),
            confirmed_at=timezone.now() - timedelta(days=40),
        )
        self.assertNotIn(hold, list(retention.abandoned_holds()))

    def test_customer_message_blocks_purge(self):
        hold = self._abandoned(email='wrote@example.com')
        conv = open_for_reservation(hold)
        post_message(conv, author_kind='customer', body='Can I still get it?')
        self.assertNotIn(hold, list(retention.abandoned_holds()))

    def test_completed_sale_is_never_purge_eligible(self):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email='paid@example.com',
        )
        complete_reservation(hold, user=self.mgr)
        _age(hold, 900)
        self.assertNotIn(hold, list(retention.abandoned_holds()))

    def test_purge_deletes_hold_and_its_system_only_thread(self):
        hold = self._abandoned()
        conv = open_for_reservation(hold)
        self.assertTrue(Message.objects.filter(conversation=conv).exists())

        counts = retention.purge_abandoned()

        self.assertEqual(counts['holds_purged'], 1)
        self.assertEqual(counts['threads_purged'], 1)
        self.assertFalse(Reservation.objects.filter(pk=hold.pk).exists())
        self.assertFalse(Conversation.objects.filter(pk=conv.pk).exists())

    def test_purge_leaves_stock_consistent(self):
        hold = self._abandoned()
        self.listing.refresh_from_db()
        reserved_before = self.listing.reserved
        retention.purge_abandoned()
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.reserved, reserved_before)


@override_settings(ONLINE_SALES_ENABLED=True)
class ArchiveApiTests(TestCase):
    def setUp(self):
        self.mgr = _manager('api-mgr@example.com')
        self.client = APIClient()
        self.client.force_authenticate(self.mgr)
        self.listing = _listing(on_hand=5)

    def _released_hold(self, email='ada@example.com'):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email=email,
        )
        release_reservation(hold, 'cancelled', user=self.mgr, reason='Damaged')
        hold.refresh_from_db()
        return hold

    def test_archive_endpoint_hides_row_from_default_list(self):
        hold = self._released_hold()
        r = self.client.post(f'/api/webstore/reservations/{hold.id}/archive/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(r.json()['archived_at'])

        listed = self.client.get(
            '/api/webstore/reservations/', {'status__in': 'cancelled', 'archived': '0'},
        )
        ids = [row['id'] for row in listed.json()['results']]
        self.assertNotIn(hold.id, ids)

        archived = self.client.get(
            '/api/webstore/reservations/', {'status__in': 'cancelled', 'archived': '1'},
        )
        self.assertIn(hold.id, [row['id'] for row in archived.json()['results']])

    def test_unfiltered_list_still_returns_archived_rows(self):
        hold = self._released_hold()
        self.client.post(f'/api/webstore/reservations/{hold.id}/archive/')
        listed = self.client.get('/api/webstore/reservations/')
        self.assertIn(hold.id, [row['id'] for row in listed.json()['results']])

    def test_archiving_an_active_hold_is_rejected(self):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email='live@example.com',
        )
        r = self.client.post(f'/api/webstore/reservations/{hold.id}/archive/')
        self.assertEqual(r.status_code, 400)

    def test_customer_still_sees_an_archived_hold(self):
        hold = self._released_hold(email='mine@example.com')
        self.client.post(f'/api/webstore/reservations/{hold.id}/archive/')

        customer_group, _ = Group.objects.get_or_create(name='Customer')
        customer = User.objects.create_user(
            email='mine@example.com', first_name='M', last_name='I', password='x',
        )
        customer.groups.add(customer_group)
        portal = APIClient()
        portal.force_authenticate(customer)
        r = portal.get('/api/webstore/my/holds/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(hold.status_token, [row['status_token'] for row in r.json()])

    def test_windows_are_settings_overridable(self):
        with override_settings(ONLINE_SALES_ARCHIVE_RELEASED_DAYS=7):
            self.assertEqual(retention.released_hold_archive_days(), 7)

    def test_unread_count_rides_along_on_hold_rows(self):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Ada', email='chat@example.com',
        )
        conv = open_for_reservation(hold)
        post_message(conv, author_kind='customer', body='Running late')
        r = self.client.get('/api/webstore/reservations/', {'search': 'chat@example.com'})
        row = next(x for x in r.json()['results'] if x['id'] == hold.id)
        self.assertEqual(row['unread'], 1)

    def test_timeline_rides_along_on_hold_rows(self):
        hold = make_verified_hold(
            listing=self.listing, quantity=1, customer_name='Bo', email='timeline@example.com',
        )
        r = self.client.get('/api/webstore/reservations/', {'search': 'timeline@example.com'})
        row = next(x for x in r.json()['results'] if x['id'] == hold.id)
        self.assertTrue(row['timeline'])
        requested = next(step for step in row['timeline'] if step['kind'] == 'requested')
        self.assertEqual(requested['label'], 'Hold requested')
        self.assertEqual(requested['actor_name'], 'Customer')
        self.assertTrue(requested['created_at'])
        self.assertIn('note', requested)


@override_settings(ONLINE_SALES_ENABLED=True)
class ArchiveCommandTests(TestCase):
    def setUp(self):
        self.mgr = _manager('cmd-mgr@example.com')
        self.listing = _listing(on_hand=10)

    def _abandoned(self, *, days=45, email='ghost@example.com'):
        hold = Reservation.objects.create(
            listing=self.listing,
            pickup_code=f'C{Reservation.objects.count():04d}',
            customer_name='Ghost',
            email=email,
            quantity=1,
            status='pending_verification',
            unit_price_snapshot=self.listing.price,
        )
        release_reservation(hold, 'expired', user=None, reason='Never confirmed')
        return _age(hold, days)

    def _run(self, *args):
        out = StringIO()
        call_command('archive_online_sales', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_writes_nothing(self):
        hold = self._abandoned()
        output = self._run('--dry-run')

        hold.refresh_from_db()
        self.assertIsNone(hold.archived_at)
        self.assertIn('Dry run', output)
        self.assertIn('purge-eligible', output)

    def test_dry_run_reports_purge_count_without_the_flag(self):
        self._abandoned()
        output = self._run('--dry-run')
        self.assertIn('use --purge to delete', output)

    def test_default_run_archives_but_never_deletes(self):
        hold = self._abandoned()
        output = self._run()

        hold.refresh_from_db()
        self.assertIsNotNone(hold.archived_at)
        self.assertTrue(Reservation.objects.filter(pk=hold.pk).exists())
        self.assertIn('Re-run with --purge', output)

    def test_purge_flag_deletes_abandoned_holds(self):
        hold = self._abandoned()
        self._run('--purge')
        self.assertFalse(Reservation.objects.filter(pk=hold.pk).exists())
