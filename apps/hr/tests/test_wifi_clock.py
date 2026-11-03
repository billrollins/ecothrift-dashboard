"""Wi-Fi time clock pilot (D23): helper filter, endpoints, shadow logic, emails and answers, setup request."""
import importlib.util
import json
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.core import mail
from django.test import Client
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import ApprovalRequest
from apps.core.services import approval_requests
from apps.hr import wifi_clock as wc
from apps.hr.models import TimeEntry, WifiClockDevice, WifiPilotEvent, WifiPilotShift, WifiPresence

TZ = ZoneInfo('America/Chicago')
MAC = 'a4:50:46:12:34:56'
OTHER = 'de:ad:be:ef:00:01'
TOKEN = 'x' * 40

_spec = importlib.util.spec_from_file_location(
    'wifi_helper', Path(__file__).resolve().parents[3] / 'scripts' / 'wifi_clock' / 'helper.py')
helper = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(helper)


def at(hh, mm, day=4):
    """2026-11-04 is a Wednesday."""
    return datetime(2026, 11, day, hh, mm, tzinfo=TZ)


def _staff(email, *, mac='', role='Manager', superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(email=email, first_name='Bill', last_name='R', password='pw', is_staff=True,
                                    is_superuser=superuser)
    user.groups.add(group)
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   hire_date=timezone.localdate(), wifi_mac=mac)
    return user


class HelperFilterTests(APITestCase):
    def test_only_registered_phones_leave_the_pc(self):
        neighbours = [(OTHER.replace(':', '-').upper(), 'Reachable'), ('11-22-33-44-55-66', 'Reachable'),
                      (MAC.replace(':', '-').upper(), 'Reachable'), ('ff-ff-ff-ff-ff-ff', 'Permanent')]
        seen = helper.filter_seen(neighbours, {7: MAC})
        self.assertEqual(seen, {7: True})
        body = json.dumps({'seen': {str(k): v for k, v in seen.items()}})
        for raw, _ in neighbours:
            self.assertNotIn(helper.normalize_mac(raw), body)
            self.assertNotIn(raw.lower(), body.lower())

    def test_stale_entry_is_not_seen(self):
        self.assertEqual(helper.filter_seen([(MAC, 'Stale'), (MAC, 'Probe')], {7: MAC}), {7: False})
        self.assertEqual(helper.filter_seen([], {7: MAC, 8: OTHER}), {7: False, 8: False})


class MacTests(APITestCase):
    def test_normalize_and_randomized(self):
        self.assertEqual(wc.normalize_mac('A4-50-46-12-34-56'), MAC)
        self.assertEqual(wc.normalize_mac('a450.4612.3456'), MAC)
        self.assertEqual(wc.normalize_mac('nope'), '')
        self.assertFalse(wc.is_randomized(MAC))
        self.assertTrue(wc.is_randomized('da:a1:19:00:00:01'))
        self.assertEqual(wc.masked(MAC), '••:••:••:••:34:56')


class EndpointTests(APITestCase):
    def setUp(self):
        self.bill = _staff('bill@example.com', mac=MAC, superuser=True)
        self.nobody = _staff('other@example.com')  # no phone: never listed
        WifiClockDevice.objects.create(name='Bench', token_hash=wc.hash_device_token(TOKEN))

    def test_phones_needs_the_device_token(self):
        self.assertEqual(self.client.get('/api/hr/wifi-clock/phones/').status_code, 403)
        self.assertEqual(self.client.get('/api/hr/wifi-clock/phones/', HTTP_X_DEVICE_TOKEN='y' * 40).status_code, 403)
        res = self.client.get('/api/hr/wifi-clock/phones/', HTTP_X_DEVICE_TOKEN=TOKEN)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['phones'], [{'id': self.bill.pk, 'mac': MAC}])

    def test_heartbeat_ignores_anything_but_registered_ids(self):
        res = self.client.post('/api/hr/wifi-clock/heartbeat/', {
            'seen': {str(self.bill.pk): True, str(self.nobody.pk): True, '99999': True, OTHER: True},
            'devices': [OTHER],
        }, format='json', HTTP_X_DEVICE_TOKEN=TOKEN)
        self.assertEqual(res.json(), {'ok': True, 'processed': 1})
        self.assertEqual(list(WifiPresence.objects.values_list('employee_id', flat=True)), [self.bill.pk])
        for row in WifiPilotEvent.objects.all():
            self.assertNotIn(OTHER, json.dumps(row.meta))
        self.assertIsNotNone(WifiClockDevice.objects.get().last_heartbeat_at)

    def test_heartbeat_rejects_bad_token(self):
        res = self.client.post('/api/hr/wifi-clock/heartbeat/', {'seen': {}}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_contractor_role_is_never_listed(self):
        _staff('booth@example.com', mac=OTHER, role='Consignee')
        res = self.client.get('/api/hr/wifi-clock/phones/', HTTP_X_DEVICE_TOKEN=TOKEN)
        self.assertEqual([row['id'] for row in res.json()['phones']], [self.bill.pk])


class ShadowLogicTests(APITestCase):
    def setUp(self):
        self.bill = _staff('bill@example.com', mac=MAC, superuser=True)
        for day in range(4):  # Mon-Thu 9-5
            WifiPilotShift.objects.create(employee=self.bill, weekday=day, start=time(9), end=time(17),
                                          punch_code='office')

    def run_minutes(self, start, end, seen):
        moment = start
        while moment <= end:
            wc.observe(self.bill, seen, now=moment)
            moment += timedelta(minutes=1)

    def kinds(self):
        return list(WifiPilotEvent.objects.order_by('at', 'id').values_list('kind', flat=True))

    def test_arrive_in_window_would_clock_in_and_emails_no_time_entry(self):
        wc.observe(self.bill, True, now=at(8, 58))
        ev = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_CLOCK_IN)
        self.assertEqual(ev.at, at(8, 58))
        self.assertEqual(ev.arrived_at, at(8, 58))
        self.assertEqual(ev.shift_start, at(9, 0))
        self.assertEqual(mail.outbox[0].subject, 'Would have clocked you in at 8:58')
        self.assertIn('starts at 9:00', mail.outbox[0].body)
        self.assertIsNotNone(ev.emailed_at)
        self.assertFalse(TimeEntry.objects.exists())

    def test_early_arrival_logs_both_times(self):
        self.run_minutes(at(7, 30), at(8, 1), True)
        ev = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_CLOCK_IN)
        self.assertEqual(ev.arrived_at, at(7, 30))
        self.assertEqual(ev.at, at(8, 0))
        self.assertEqual(ev.shift_start, at(9, 0))
        self.assertEqual(WifiPilotEvent.objects.filter(kind=WifiPilotEvent.KIND_CLOCK_IN).count(), 1)

    def test_not_scheduled_does_nothing(self):
        wc.observe(self.bill, True, now=at(9, 0, day=6))  # Friday
        self.assertEqual(self.kinds(), ['arrive'])
        self.assertEqual(mail.outbox, [])

    def test_manual_punch_is_noted(self):
        TimeEntry.objects.create(employee=self.bill, clock_in=at(8, 50), shift='office')
        wc.observe(self.bill, True, now=at(8, 58))
        ev = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_CLOCK_IN)
        self.assertIn('manual_punch_at', ev.meta)
        self.assertEqual(TimeEntry.objects.count(), 1)

    def test_short_miss_is_a_blip_not_a_leave(self):
        self.run_minutes(at(9, 0), at(10, 0), True)
        self.run_minutes(at(10, 1), at(10, 5), False)
        wc.observe(self.bill, True, now=at(10, 6))
        self.assertNotIn('leave', self.kinds())
        blip = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_BLIP)
        self.assertEqual(blip.meta['minutes'], 6)

    def test_mid_shift_gap_asks_was_this_a_break(self):
        self.run_minutes(at(9, 0), at(12, 10), True)
        self.run_minutes(at(12, 11), at(12, 24), False)
        self.assertNotIn('leave', self.kinds())  # 14 minutes unseen: not gone yet
        wc.observe(self.bill, False, now=at(12, 25))
        leave = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_LEAVE)
        self.assertEqual(leave.at, at(12, 10))
        self.assertEqual(len(mail.outbox), 1)  # only the clock-in so far: never a silent clock-out
        self.run_minutes(at(12, 26), at(12, 44), False)
        wc.observe(self.bill, True, now=at(12, 45))
        q = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_BREAK)
        self.assertEqual((q.gap_start, q.gap_end), (at(12, 10), at(12, 45)))
        self.assertEqual(mail.outbox[-1].subject, 'You were off the Wi-Fi 12:10–12:45. Was this a break?')
        html = mail.outbox[-1].alternatives[0][0]
        self.assertIn('>Yes<', html)
        self.assertIn('>No<', html)
        self.assertNotIn('reason', mail.outbox[-1].body.lower())

        link = wc.answer_link(q, 'no')
        path = link.split('ecothrift.us', 1)[-1]
        client = Client()
        res = client.get(path)  # a mail scanner opening the link records nothing
        self.assertEqual(res.status_code, 200)
        q.refresh_from_db()
        self.assertEqual(q.answer, '')
        res = client.post(path)
        self.assertContains(res, 'Saved')
        q.refresh_from_db()
        self.assertEqual(q.answer, 'no')
        client.post(wc.answer_link(q, 'yes').split('ecothrift.us', 1)[-1])
        q.refresh_from_db()
        self.assertEqual(q.answer, 'yes')
        self.assertEqual(q.meta['earlier_answers'][0]['answer'], 'no')
        self.assertFalse(TimeEntry.objects.exists())

    def test_leaving_near_the_end_would_clock_out(self):
        self.run_minutes(at(9, 0), at(16, 40), True)
        self.run_minutes(at(16, 41), at(16, 56), False)
        ev = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_CLOCK_OUT)
        self.assertEqual(ev.at, at(16, 40))
        self.assertEqual(mail.outbox[-1].subject, 'Would have clocked you out at 4:40')
        self.assertFalse(TimeEntry.objects.exists())

    def test_staying_late_clocks_out_at_last_seen(self):
        self.run_minutes(at(9, 0), at(17, 20), True)
        self.run_minutes(at(17, 21), at(17, 36), False)
        self.assertEqual(WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_CLOCK_OUT).at, at(17, 20))

    def test_left_early_and_not_back_asks_at_shift_end(self):
        self.run_minutes(at(9, 0), at(14, 10), True)
        self.run_minutes(at(14, 11), at(16, 59), False)
        self.assertFalse(WifiPilotEvent.objects.filter(kind=WifiPilotEvent.KIND_LEFT).exists())
        wc.observe(self.bill, False, now=at(17, 0))
        ev = WifiPilotEvent.objects.get(kind=WifiPilotEvent.KIND_LEFT)
        self.assertEqual(ev.at, at(14, 10))
        self.assertEqual(mail.outbox[-1].subject, 'You left at 2:10. Clock out at 2:10?')
        wc.observe(self.bill, False, now=at(17, 5))
        self.assertEqual(WifiPilotEvent.objects.filter(kind=WifiPilotEvent.KIND_LEFT).count(), 1)

    def test_bad_answer_token(self):
        self.assertEqual(Client().get('/api/hr/wifi-clock/answer/junk/').status_code, 400)

    def test_helper_quiet_is_logged(self):
        device = WifiClockDevice.objects.create(name='Bench', token_hash='a' * 64, last_heartbeat_at=at(9, 0))
        wc.heartbeat(device, {str(self.bill.pk): True}, now=at(9, 30))
        self.assertTrue(WifiPilotEvent.objects.filter(kind=WifiPilotEvent.KIND_HELPER_GAP).exists())


class SetupRequestTests(APITestCase):
    def test_stage_and_apply_masks_the_address(self):
        bill = _staff('bill@example.com', superuser=True)
        self.client.force_authenticate(bill)
        res = self.client.post('/api/hr/wifi-clock/stage-setup/', {
            'user': 'bill@example.com', 'mac': MAC.upper(), 'device': 'Bench', 'token_sha256': 'b' * 64,
            'shifts': [{'weekdays': [0, 1, 2, 3], 'start': '09:00', 'end': '17:00', 'punch_code': 'office'}],
        }, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertNotIn(MAC, json.dumps(res.json()))
        row = ApprovalRequest.objects.get(pk=res.json()['id'])
        self.assertNotIn(MAC, json.dumps(row.preview))
        approval_requests.approve(row, bill, start=False)
        approval_requests.run(row.pk)
        bill.employee.refresh_from_db()
        self.assertEqual(bill.employee.wifi_mac, MAC)
        self.assertEqual(WifiClockDevice.objects.get(name='Bench').token_hash, 'b' * 64)
        self.assertEqual(WifiPilotShift.objects.filter(employee=bill).count(), 4)
        row.refresh_from_db()
        self.assertNotIn(MAC, json.dumps(row.params))

    def test_stage_needs_owner(self):
        res = self.client.post('/api/hr/wifi-clock/stage-setup/', {}, format='json')
        self.assertIn(res.status_code, (401, 403))
