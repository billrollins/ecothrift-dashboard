"""Named restoration parts orders - sequence, money, finish gate, alerts."""

from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import RestorationJob, RestorationPart, RestorationPartsOrder
from apps.inventory.services.restoration_parts import (
    FINISH_BLOCKED_MESSAGE,
    actual_parts_cost_for_job,
    order_parts_cost,
    parts_orders_needing_review,
)
from apps.inventory.tests.test_restoration_queue import RestorationQueueTestBase


class RestorationPartsOrdersTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        self.superuser = get_user_model().objects.create_superuser(
            email='owner@example.com',
            first_name='Owner',
            last_name='User',
            password='pw',
        )
        self.superuser.groups.add(Group.objects.get_or_create(name='Admin')[0])
        self.owner = APIClient()
        self.owner.force_authenticate(user=self.superuser)

    def _bench_job(self):
        job = self._sent_job_for_parts()
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(resp.status_code, 200, resp.data)
        job.refresh_from_db()
        return job

    def _sent_job_for_parts(self):
        order, pr, product = self._restoration_order(
            order_number=f'PO-PARTS-{RestorationJob.objects.count()}',
        )
        check_in = self._check_in_restoration(order, pr, product)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        send = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(send.status_code, 200, send.data)
        job.refresh_from_db()
        return job

    def _create_part(self, job, **kwargs):
        payload = {
            'job': job.id,
            'description': 'Hinge',
            'qty': 1,
            'unit_price': '6.00',
            'category': 'parts',
            'url': 'https://example.com/hinge',
        }
        payload.update(kwargs)
        resp = self.client.post('/api/inventory/restoration-parts/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def _create_order(self, job, parts, **kwargs):
        payload = {
            'job': job.id,
            'name': 'Amazon hinge',
            'target_grade': 'Working',
            'shipping': '0.00',
            'tax': '0.00',
            'fees': '0.00',
            'lines': [{'part_id': part['id'] if isinstance(part, dict) else part, 'qty': 1} for part in parts],
        }
        payload.update(kwargs)
        resp = self.client.post('/api/inventory/restoration-parts-orders/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_staff_can_build_and_request_but_cannot_approve(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.assertEqual(order['status'], 'draft')
        requested = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.assertEqual(requested.status_code, 200, requested.data)
        self.assertEqual(requested.data['status'], 'requested')
        job.refresh_from_db()
        self.assertEqual(job.stage, RestorationJob.STAGE_BENCH)

        blocked = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.assertEqual(blocked.status_code, 403)

    def test_superuser_sequence_and_out_of_order_refused(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')

        too_soon = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 5},
            format='json',
        )
        self.assertEqual(too_soon.status_code, 400)
        self.assertIn('purchased', too_soon.data['detail'])

        approved = self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.assertEqual(approved.status_code, 200, approved.data)
        purchased = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 5},
            format='json',
        )
        self.assertEqual(purchased.status_code, 200, purchased.data)
        self.assertEqual(purchased.data['est_shipping_days'], 5)
        received = self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        self.assertEqual(received.status_code, 200, received.data)
        self.assertEqual(received.data['status'], 'received')

        events = list(
            job.timeline_events.filter(event_type__startswith='parts.order_').values_list('event_type', flat=True)
        )
        self.assertEqual(
            events,
            [
                'parts.order_requested',
                'parts.order_approved',
                'parts.order_purchased',
                'parts.order_received',
            ],
        )

    def test_deny_requires_reason(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        missing = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/deny/',
            {'reason': ''},
            format='json',
        )
        self.assertEqual(missing.status_code, 400)
        denied = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/deny/',
            {'reason': 'Too expensive for the grade'},
            format='json',
        )
        self.assertEqual(denied.status_code, 200, denied.data)
        self.assertEqual(denied.data['status'], 'denied')

    def test_finish_blocked_while_order_is_open(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        blocked = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'notes': 'done'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400, blocked.data)
        self.assertEqual(blocked.data['detail'], FINISH_BLOCKED_MESSAGE)

        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 2},
            format='json',
        )
        still = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'notes': 'done'},
            format='json',
        )
        self.assertEqual(still.status_code, 400)
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        done = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'starting_grade': 'Parts-only'},
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data['spent_parts_cost'], '6.00')
        self.assertEqual(done.data['value_added'], '8.99')

    def test_pro_rata_freight_charges_parts_share_only(self):
        job = self._bench_job()
        hinge = self._create_part(job, description='Hinge', unit_price='6.00', category='parts')
        stand = self._create_part(job, description='Stand', unit_price='40.00', category='ffe')
        order = self._create_order(job, [hinge, stand], shipping='10.00')
        db_order = RestorationPartsOrder.objects.get(pk=order['id'])
        self.assertEqual(order_parts_cost(db_order), Decimal('7.30'))
        self.assertEqual(order['parts_cost'], '7.30')

        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 3},
            format='json',
        )
        self.assertEqual(actual_parts_cost_for_job(job), Decimal('7.30'))

    def test_cannot_delete_part_on_a_live_order(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        blocked = self.client.delete(f'/api/inventory/restoration-parts/{part["id"]}/')
        self.assertEqual(blocked.status_code, 400)

    def test_requesting_withdraws_a_requested_sibling(self):
        job = self._bench_job()
        hinge = self._create_part(job, description='Hinge')
        screen = self._create_part(job, description='Screen', unit_price='20.00')
        first = self._create_order(job, [hinge], name='Amazon hinge')
        second = self._create_order(job, [screen], name='eBay screen')
        self.client.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/request/')
        requested = self.client.post(f'/api/inventory/restoration-parts-orders/{second["id"]}/request/')
        self.assertEqual(requested.status_code, 200, requested.data)
        self.assertEqual(requested.data['status'], 'requested')
        first_row = RestorationPartsOrder.objects.get(pk=first['id'])
        self.assertEqual(first_row.status, RestorationPartsOrder.STATUS_DRAFT)

    def test_request_refused_when_sibling_is_approved(self):
        job = self._bench_job()
        hinge = self._create_part(job, description='Hinge')
        screen = self._create_part(job, description='Screen', unit_price='20.00')
        first = self._create_order(job, [hinge], name='Amazon hinge')
        second = self._create_order(job, [screen], name='eBay screen')
        self.client.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/approve/')
        blocked = self.client.post(f'/api/inventory/restoration-parts-orders/{second["id"]}/request/')
        self.assertEqual(blocked.status_code, 409, blocked.data)
        self.assertEqual(blocked.data['blocking_order']['id'], first['id'])
        self.assertEqual(RestorationPartsOrder.objects.get(pk=second['id']).status, RestorationPartsOrder.STATUS_DRAFT)

    def test_cancel_handshake_requests_the_queued_order(self):
        job = self._bench_job()
        hinge = self._create_part(job, description='Hinge')
        screen = self._create_part(job, description='Screen', unit_price='20.00')
        first = self._create_order(job, [hinge], name='Amazon hinge')
        second = self._create_order(job, [screen], name='eBay screen')
        self.client.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/approve/')
        asked = self.client.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/request-cancel/',
            {'replacement_id': second['id']},
            format='json',
        )
        self.assertEqual(asked.status_code, 200, asked.data)
        self.assertTrue(asked.data['cancel_requested'])
        self.assertEqual(asked.data['replacement_id'], second['id'])
        listing = self.owner.get('/api/inventory/restoration-parts-orders/?cancel_requested=1')
        self.assertIn(first['id'], [row['id'] for row in listing.data['results']])
        confirmed = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/resolve-cancel/',
            {'confirmed': True},
            format='json',
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data['status'], 'cancelled')
        replacement = RestorationPartsOrder.objects.get(pk=second['id'])
        self.assertEqual(replacement.status, RestorationPartsOrder.STATUS_REQUESTED)
        self.assertIsNone(replacement.queued_behind_id)

    def test_refusing_a_cancel_keeps_the_original(self):
        job = self._bench_job()
        hinge = self._create_part(job, description='Hinge')
        screen = self._create_part(job, description='Screen', unit_price='20.00')
        first = self._create_order(job, [hinge], name='Amazon hinge')
        second = self._create_order(job, [screen], name='eBay screen')
        self.client.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/approve/')
        self.client.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/request-cancel/',
            {'replacement_id': second['id']},
            format='json',
        )
        kept = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/resolve-cancel/',
            {'confirmed': False},
            format='json',
        )
        self.assertEqual(kept.status_code, 200, kept.data)
        self.assertEqual(kept.data['status'], 'approved')
        self.assertFalse(kept.data['cancel_requested'])
        replacement = RestorationPartsOrder.objects.get(pk=second['id'])
        self.assertEqual(replacement.status, RestorationPartsOrder.STATUS_DRAFT)
        self.assertIsNone(replacement.queued_behind_id)

    def test_purchased_cancel_keeps_spend_unless_refunded(self):
        job = self._bench_job()
        hinge = self._create_part(job, description='Hinge')
        first = self._create_order(job, [hinge], name='Amazon hinge')
        self.client.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{first["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/purchase/',
            {'est_shipping_days': 2},
            format='json',
        )
        self.client.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/request-cancel/',
            {},
            format='json',
        )
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{first["id"]}/resolve-cancel/',
            {'confirmed': True},
            format='json',
        )
        self.assertEqual(actual_parts_cost_for_job(job), Decimal('6.00'))

        other = self._create_order(job, [hinge], name='Second hinge')
        self.client.post(f'/api/inventory/restoration-parts-orders/{other["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{other["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{other["id"]}/purchase/',
            {'est_shipping_days': 2},
            format='json',
        )
        self.client.post(
            f'/api/inventory/restoration-parts-orders/{other["id"]}/request-cancel/',
            {},
            format='json',
        )
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{other["id"]}/resolve-cancel/',
            {'confirmed': True, 'refunded': True},
            format='json',
        )
        self.assertEqual(actual_parts_cost_for_job(job), Decimal('6.00'))

    def test_staff_cannot_resolve_a_cancel(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/request-cancel/',
            {},
            format='json',
        )
        blocked = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/resolve-cancel/',
            {'confirmed': True},
            format='json',
        )
        self.assertEqual(blocked.status_code, 403)

    def test_cancel_draft_and_requested(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        cancelled = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/cancel/')
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        self.assertEqual(cancelled.data['status'], 'cancelled')

    def test_staff_can_receive_after_purchase(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 3},
            format='json',
        )
        received = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        self.assertEqual(received.status_code, 200, received.data)
        self.assertEqual(received.data['status'], 'received')
        self.assertTrue(received.data['needs_review'])
        self.assertEqual(received.data['attention'], 'review')
        self.assertEqual(received.data['review_state'], 'needs_review')

    def test_superuser_can_cancel_an_accepted_order(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        blocked = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/cancel/')
        self.assertEqual(blocked.status_code, 400, blocked.data)
        cancelled = self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/cancel/')
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        self.assertEqual(cancelled.data['status'], 'cancelled')

    def test_receive_and_inspect_are_separate_steps(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part], target_grade='Working')
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 1},
            format='json',
        )
        received = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        self.assertEqual(received.status_code, 200, received.data)
        self.assertTrue(received.data['needs_review'])
        listing = self.owner.get('/api/inventory/restoration-parts-orders/?needs_review=1')
        self.assertIn(order['id'], [row['id'] for row in listing.data['results']])

        line_id = received.data['lines'][0]['id']
        gone = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/review/',
            {'lines': [{'id': line_id, 'verdict': 'issues', 'note': 'Blade was the wrong size'}]},
            format='json',
        )
        self.assertEqual(gone.status_code, 410)

        blocked = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/inspect/',
            {'lines': [{'id': line_id, 'verdict': 'issues', 'note': ''}]},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400, blocked.data)

        inspected = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/inspect/',
            {'lines': [{'id': line_id, 'verdict': 'issues', 'note': 'Blade was the wrong size'}]},
            format='json',
        )
        self.assertEqual(inspected.status_code, 200, inspected.data)
        self.assertEqual(inspected.data['review_state'], 'reviewed')
        self.assertFalse(inspected.data['needs_review'])
        self.assertEqual(inspected.data['lines'][0]['inspect_verdict'], 'issues')
        self.assertEqual(inspected.data['lines'][0]['inspect_note'], 'Blade was the wrong size')
        self.assertIn('wrong size', inspected.data['review_note'])

    def test_qty_counts_as_one_inspect_row(self):
        job = self._bench_job()
        part = self._create_part(job, qty=3)
        order = self._create_order(job, [part], lines=[{'part_id': part['id'], 'qty': 3}])
        self.assertEqual(order['item_count'], 1)
        self.assertEqual(len(order['lines']), 1)
        self.assertEqual(order['lines'][0]['qty'], 3)
        self.assertEqual(order['total'], '18.00')

    def test_inspect_moves_open_job_to_history(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 1},
            format='json',
        )
        received = self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        line_id = received.data['lines'][0]['id']
        inspected = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/inspect/',
            {'lines': [{'id': line_id, 'verdict': 'acceptable'}]},
            format='json',
        )
        self.assertEqual(inspected.status_code, 200, inspected.data)
        job.refresh_from_db()
        self.assertNotEqual(job.stage, RestorationJob.STAGE_DONE)
        live = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        self.assertNotIn(order['id'], [row['id'] for row in live.data['results']])
        history = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=history')
        self.assertIn(order['id'], [row['id'] for row in history.data['results']])

    def test_unreviewed_received_order_needs_review(self):
        job = self._bench_job()
        part = RestorationPart.objects.create(job=job, description='Hinge', qty=1, unit_price=Decimal('6.00'))
        order = RestorationPartsOrder.objects.create(
            job=job,
            name='Old hinge',
            target_grade='Working',
            status=RestorationPartsOrder.STATUS_RECEIVED,
            received_at=timezone.now() - timedelta(days=8),
        )
        order.lines.create(part=part, qty=1)
        ids = list(parts_orders_needing_review().values_list('id', flat=True))
        self.assertIn(order.id, ids)

    def test_create_order_requires_target_grade(self):
        job = self._bench_job()
        part = self._create_part(job)
        resp = self.client.post(
            '/api/inventory/restoration-parts-orders/',
            {
                'job': job.id,
                'name': 'Amazon hinge',
                'target_grade': '',
                'lines': [{'part_id': part['id'], 'qty': 1}],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('grade', resp.data['detail'])

    def test_request_refuses_order_without_grade(self):
        job = self._bench_job()
        part = RestorationPart.objects.create(job=job, description='Hinge', qty=1, unit_price=Decimal('6.00'))
        order = RestorationPartsOrder.objects.create(job=job, name='Amazon hinge', target_grade='')
        order.lines.create(part=part, qty=1)
        resp = self.client.post(f'/api/inventory/restoration-parts-orders/{order.id}/request/')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertEqual(resp.data['detail'], 'Say which grade this order would achieve.')

    def test_request_can_stamp_target_grade(self):
        job = self._bench_job()
        part = RestorationPart.objects.create(job=job, description='Hinge', qty=1, unit_price=Decimal('6.00'))
        order = RestorationPartsOrder.objects.create(job=job, name='Amazon hinge', target_grade='')
        order.lines.create(part=part, qty=1)
        resp = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order.id}/request/',
            {'target_grade': 'Working'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['status'], 'requested')
        self.assertEqual(resp.data['target_grade'], 'Working')

    def test_live_and_history_buckets(self):
        live_job = self._sent_job_for_parts()
        live_part = self._create_part(live_job)
        requested = self._create_order(live_job, [live_part], name='Ask')
        self.client.post(f'/api/inventory/restoration-parts-orders/{requested["id"]}/request/')

        finished_job = self._bench_job()
        hinge = self._create_part(finished_job)
        received = self._create_order(finished_job, [hinge], name='Done hinge')
        self.client.post(f'/api/inventory/restoration-parts-orders/{received["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{received["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{received["id"]}/purchase/',
            {'est_shipping_days': 1},
            format='json',
        )
        received_resp = self.owner.post(f'/api/inventory/restoration-parts-orders/{received["id"]}/receive/')
        self.assertEqual(received_resp.status_code, 200, received_resp.data)
        line_id = received_resp.data['lines'][0]['id']
        inspected = self.client.post(
            f'/api/inventory/restoration-parts-orders/{received["id"]}/inspect/',
            {'lines': [{'id': line_id, 'verdict': 'acceptable'}]},
            format='json',
        )
        self.assertEqual(inspected.status_code, 200, inspected.data)
        done = self.client.post(
            f'/api/inventory/restoration-jobs/{finished_job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'starting_grade': 'Parts-only'},
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)

        denied_job = self._sent_job_for_parts()
        denied_part = self._create_part(denied_job)
        denied = self._create_order(denied_job, [denied_part], name='No')
        self.client.post(f'/api/inventory/restoration-parts-orders/{denied["id"]}/request/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{denied["id"]}/deny/',
            {'reason': 'Too dear'},
            format='json',
        )

        live = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        live_ids = [row['id'] for row in live.data['results']]
        self.assertIn(requested['id'], live_ids)
        self.assertNotIn(received['id'], live_ids)
        self.assertNotIn(denied['id'], live_ids)

        history = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=history')
        history_ids = [row['id'] for row in history.data['results']]
        self.assertIn(received['id'], history_ids)
        self.assertIn(denied['id'], history_ids)
        self.assertNotIn(requested['id'], history_ids)

        received_row = next(row for row in history.data['results'] if row['id'] == received['id'])
        self.assertEqual(received_row['job_starting_grade'], 'Parts-only')
        self.assertEqual(received_row['job_final_grade'], 'Working')
        self.assertEqual(received_row['job_value_added'], '8.99')
        self.assertEqual(received_row['job_spent_parts_cost'], '6.00')
        self.assertEqual(received_row['requested_by_name'], f'{self.user.first_name} {self.user.last_name}')

    def test_attention_prefers_cancel_ask_over_late(self):
        job = self._bench_job()
        part = RestorationPart.objects.create(job=job, description='Hinge', qty=1, unit_price=Decimal('6.00'))
        order = RestorationPartsOrder.objects.create(
            job=job,
            name='Late hinge',
            target_grade='Working',
            status=RestorationPartsOrder.STATUS_PURCHASED,
            purchased_at=timezone.now() - timedelta(days=10),
            est_shipping_days=2,
            cancel_requested_at=timezone.now(),
            cancel_reason='Wrong part',
        )
        order.lines.create(part=part, qty=1)
        listing = self.owner.get(f'/api/inventory/restoration-parts-orders/{order.id}/')
        self.assertEqual(listing.status_code, 200, listing.data)
        self.assertEqual(listing.data['attention'], 'cancel_ask')
        self.assertGreater(listing.data['days_late'], 0)
        self.assertIsNotNone(listing.data['expected_delivery_on'])

    def test_unreviewed_received_stays_live_after_finish(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 1},
            format='json',
        )
        received = self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        self.assertEqual(received.status_code, 200, received.data)
        done = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'starting_grade': 'Parts-only'},
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)
        live = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        self.assertIn(order['id'], [row['id'] for row in live.data['results']])
        line_id = received.data['lines'][0]['id']
        inspected = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/inspect/',
            {'lines': [{'id': line_id, 'verdict': 'acceptable'}]},
            format='json',
        )
        self.assertEqual(inspected.status_code, 200, inspected.data)
        live = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        self.assertNotIn(order['id'], [row['id'] for row in live.data['results']])
        history = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=history')
        self.assertIn(order['id'], [row['id'] for row in history.data['results']])

    def test_received_on_open_job_stays_live(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'est_shipping_days': 1},
            format='json',
        )
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/receive/')
        live = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        self.assertIn(order['id'], [row['id'] for row in live.data['results']])
        history = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=history')
        self.assertNotIn(order['id'], [row['id'] for row in history.data['results']])

    def test_revise_eta_and_purchase_by_date(self):
        job = self._bench_job()
        part = self._create_part(job)
        order = self._create_order(job, [part])
        self.client.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/request/')
        self.owner.post(f'/api/inventory/restoration-parts-orders/{order["id"]}/approve/')
        due = (timezone.now().astimezone(ZoneInfo('America/Chicago')) + timedelta(days=9)).date().isoformat()
        purchased = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/purchase/',
            {'expected_delivery_on': due},
            format='json',
        )
        self.assertEqual(purchased.status_code, 200, purchased.data)
        self.assertEqual(purchased.data['expected_delivery_on'], due)

        blocked = self.client.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/eta/',
            {'expected_delivery_on': due},
            format='json',
        )
        self.assertEqual(blocked.status_code, 403)

        too_soon = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/eta/',
            {},
            format='json',
        )
        self.assertEqual(too_soon.status_code, 400)

        later = (timezone.now().astimezone(ZoneInfo('America/Chicago')) + timedelta(days=14)).date().isoformat()
        revised = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{order["id"]}/eta/',
            {'expected_delivery_on': later},
            format='json',
        )
        self.assertEqual(revised.status_code, 200, revised.data)
        self.assertEqual(revised.data['expected_delivery_on'], later)
        events = list(
            job.timeline_events.filter(event_type='parts.order_eta_revised').values_list('event_type', flat=True)
        )
        self.assertEqual(events, ['parts.order_eta_revised'])

        draft = self._create_order(job, [part], name='Still a draft')
        refused = self.owner.post(
            f'/api/inventory/restoration-parts-orders/{draft["id"]}/eta/',
            {'expected_delivery_on': later},
            format='json',
        )
        self.assertEqual(refused.status_code, 400)

    def test_live_list_query_count_is_flat(self):
        job = self._bench_job()
        for index in range(10):
            part = RestorationPart.objects.create(
                job=job,
                description=f'Hinge {index}',
                qty=1,
                unit_price=Decimal('6.00'),
            )
            order = RestorationPartsOrder.objects.create(
                job=job,
                name=f'Box {index}',
                target_grade='Working',
                status=RestorationPartsOrder.STATUS_RECEIVED,
                review_state=RestorationPartsOrder.REVIEW_NEEDS,
                received_at=timezone.now(),
            )
            order.lines.create(part=part, qty=1)
        warm = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        self.assertEqual(warm.status_code, 200, warm.data)
        with self.assertNumQueries(7):
            listing = self.owner.get('/api/inventory/restoration-parts-orders/?bucket=live')
        self.assertEqual(listing.status_code, 200)
        self.assertGreaterEqual(len(listing.data['results']), 10)
