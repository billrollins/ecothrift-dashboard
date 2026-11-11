"""Processing Command Center (Dash Update #87): the math behind each line and who sees what."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal as D

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import TimeEntry
from apps.inventory.models import Item, Product
from apps.inventory.services import processing_command_center as pcc
from apps.pos.models import DashboardDepartmentGoal
from apps.stocktake.models import BadTag

DAY = date(2026, 3, 4)  # a Wednesday; its week starts Monday 2026-03-02
MONDAY = date(2026, 3, 2)
URL = '/api/inventory/processing-command-center/'


def at(day: date, hour: int = 10, minute: int = 0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


def staff(email, role='Employee', *, superuser=False, hired=date(2025, 1, 6)):
    user = User.objects.create_user(email=email, password='x', first_name=email.split('@')[0].title(),
                                    last_name='T', is_staff=True, is_superuser=superuser)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=f'PCC-{user.pk}', hire_date=hired)
    return user


class Base(APITestCase):
    def setUp(self):
        self.product = Product.objects.create(title='Lamp')
        self.n = 0
        self.lead = staff('lead@x.com', 'Manager')
        self.ann = staff('ann@x.com')
        self.bo = staff('bo@x.com')

    def check_in(self, who, when, price):
        self.n += 1
        return Item.objects.create(sku=f'ITMPCC{self.n:04}', product=self.product, status='on_shelf',
                                   price=D(price), checked_in_by=who, checked_in_at=when)

    def clock(self, who, day, hours, shift='processing', start=8):
        return TimeEntry.objects.create(
            employee=who, date=day, clock_in=at(day, start), clock_out=at(day, start) + timedelta(hours=hours),
            shift=shift, total_hours=D(str(hours)),
        )

    def line(self, payload, user):
        return next(p for p in payload['people'] if p['user_id'] == user.id)


class TheMathTests(Base):
    def test_items_dollars_average_and_big_items(self):
        for price in ('10.00', '30.00', '60.00', '0.00'):
            self.check_in(self.ann, at(DAY), price)
        self.clock(self.ann, DAY, 4)
        day = self.line(pcc.build(self.lead, DAY), self.ann)['day']
        self.assertEqual((day['items'], day['dollars'], day['average_tag']), (4, '100.00', '25.00'))
        # Big = $25 and up: the $30 and the $60, 90 of the 100 dollars.
        self.assertEqual((day['big_items'], day['big_share']), (2, 90))
        self.assertEqual((day['hours'], day['items_per_hour'], day['dollars_per_hour']), ('4.00', '1.00', '25.00'))

    def test_exactly_25_dollars_is_a_big_item(self):
        self.check_in(self.ann, at(DAY), '25.00')
        self.check_in(self.ann, at(DAY), '24.99')
        self.assertEqual(self.line(pcc.build(self.lead, DAY), self.ann)['day']['big_items'], 1)

    def test_no_clock_entry_leaves_per_hour_blank_never_a_guess(self):
        self.check_in(self.bo, at(DAY), '40.00')
        day = self.line(pcc.build(self.lead, DAY), self.bo)['day']
        self.assertEqual((day['items'], day['dollars']), (1, '40.00'))
        self.assertIsNone(day['hours'])
        self.assertIsNone(day['items_per_hour'])
        self.assertIsNone(day['dollars_per_hour'])

    def test_only_processing_punches_count_as_hours(self):
        self.check_in(self.ann, at(DAY), '40.00')
        self.clock(self.ann, DAY, 3, shift='retail_open')
        self.assertIsNone(self.line(pcc.build(self.lead, DAY), self.ann)['day']['hours'])
        self.clock(self.ann, DAY, 2, shift='processing', start=13)
        day = self.line(pcc.build(self.lead, DAY), self.ann)['day']
        self.assertEqual((day['hours'], day['dollars_per_hour']), ('2.00', '20.00'))

    def test_the_week_is_monday_to_the_picked_day(self):
        self.check_in(self.ann, at(MONDAY), '10.00')
        self.check_in(self.ann, at(DAY), '20.00')
        self.check_in(self.ann, at(DAY + timedelta(days=1)), '500.00')   # after the picked day
        self.check_in(self.ann, at(MONDAY - timedelta(days=1)), '500.00')  # the week before
        self.clock(self.ann, MONDAY, 5)
        self.clock(self.ann, DAY, 5)
        row = self.line(pcc.build(self.lead, DAY), self.ann)
        self.assertEqual((row['day']['items'], row['day']['dollars']), (1, '20.00'))
        self.assertEqual((row['week']['items'], row['week']['dollars'], row['week']['hours']), (2, '30.00', '10.00'))
        self.assertEqual(row['week']['dollars_per_hour'], '3.00')

    def test_a_day_is_the_store_day_not_the_utc_day(self):
        self.check_in(self.ann, at(DAY, 23, 30), '10.00')        # late evening still counts for the day
        self.check_in(self.ann, at(DAY + timedelta(days=1), 0, 30), '99.00')
        self.assertEqual(self.line(pcc.build(self.lead, DAY), self.ann)['day']['dollars'], '10.00')

    def test_tag_errors_are_traced_to_the_processor_by_the_day_found(self):
        item = self.check_in(self.ann, at(MONDAY), '10.00')
        for found in (at(DAY), at(MONDAY), at(MONDAY - timedelta(days=3))):
            tag = BadTag.objects.create(item=item, reason=BadTag.REASON_PRICE_HIGH, checked_in_by=self.ann)
            BadTag.objects.filter(pk=tag.pk).update(found_at=found)
        row = self.line(pcc.build(self.lead, DAY), self.ann)
        self.assertEqual((row['day']['tag_errors'], row['week']['tag_errors']), (1, 2))

    def test_the_room_average_uses_only_people_with_clocked_hours(self):
        self.check_in(self.ann, at(DAY), '80.00')
        self.clock(self.ann, DAY, 4)
        self.check_in(self.bo, at(DAY), '1000.00')   # no clock entry: left out of the pace
        room = pcc.build(self.lead, DAY)['room']['day_average']
        self.assertEqual(room, {'items_per_hour': '0.25', 'dollars_per_hour': '20.00', 'people': 1})

    def test_the_room_average_leaves_out_people_on_the_clock_with_no_check_ins(self):
        self.check_in(self.ann, at(DAY), '80.00')
        self.clock(self.ann, DAY, 4)
        self.clock(self.bo, DAY, 8)   # receiving all day: on the page, not in the check-in pace
        payload = pcc.build(self.lead, DAY)
        self.assertEqual(payload['room']['day_average'],
                         {'items_per_hour': '0.25', 'dollars_per_hour': '20.00', 'people': 1})
        bo = self.line(payload, self.bo)['day']
        # Hours with no check-ins of their own: no pace, never a zero (a shared PC may hold their items).
        self.assertEqual((bo['items'], bo['hours'], bo['items_per_hour'], bo['dollars_per_hour']),
                         (0, '8.00', None, None))

    def test_the_week_pace_counts_only_days_with_a_punch(self):
        """The bug the first critic found: Monday's items with no punch were divided by Tuesday's hours."""
        for _ in range(40):
            self.check_in(self.ann, at(MONDAY), '10.00')          # Monday: no punch
        for _ in range(8):
            self.check_in(self.ann, at(DAY), '10.00')             # Wednesday: 8 items in 4 hours
        self.clock(self.ann, DAY, 4)
        payload = pcc.build(self.lead, DAY)
        week = self.line(payload, self.ann)['week']
        self.assertEqual((week['items'], week['dollars'], week['hours']), (48, '480.00', '4.00'))
        self.assertEqual((week['items_per_hour'], week['dollars_per_hour']), ('2.00', '20.00'))
        self.assertEqual(week['items_off_clock'], 40)
        self.assertEqual(payload['room']['week_average'],
                         {'items_per_hour': '2.00', 'dollars_per_hour': '20.00', 'people': 1})

    def test_the_week_comes_day_by_day_with_the_missing_punch_showing(self):
        self.check_in(self.ann, at(MONDAY), '10.00')
        self.check_in(self.ann, at(DAY), '30.00')
        self.clock(self.ann, DAY, 2)
        payload = pcc.build(self.lead, DAY)
        days = self.line(payload, self.ann)['days']
        self.assertEqual([d['date'] for d in days], ['2026-03-02', '2026-03-03', '2026-03-04'])
        self.assertEqual([(d['items'], d['hours'], d['items_per_hour']) for d in days],
                         [(1, None, None), (0, None, None), (1, '2.00', '0.50')])
        self.assertEqual([d['date'] for d in payload['room']['by_day']], ['2026-03-02', '2026-03-03', '2026-03-04'])

    def test_a_tag_error_alone_does_not_list_a_person(self):
        item = self.check_in(self.ann, at(MONDAY - timedelta(days=20)), '10.00')
        tag = BadTag.objects.create(item=item, reason=BadTag.REASON_PRICE_HIGH, checked_in_by=self.ann)
        BadTag.objects.filter(pk=tag.pk).update(found_at=at(DAY))
        self.assertEqual(pcc.build(self.lead, DAY)['people'], [])


class NewHireTests(Base):
    def test_first_check_in_under_30_days_ago_is_new(self):
        self.check_in(self.ann, at(DAY - timedelta(days=10)), '5.00')
        self.check_in(self.ann, at(DAY), '5.00')
        self.check_in(self.bo, at(DAY - timedelta(days=45)), '5.00')
        self.check_in(self.bo, at(DAY), '5.00')
        payload = pcc.build(self.lead, DAY)
        ann, bo = self.line(payload, self.ann), self.line(payload, self.bo)
        self.assertTrue(ann['is_new'])
        self.assertEqual(ann['first_check_in'], (DAY - timedelta(days=10)).isoformat())
        self.assertFalse(bo['is_new'])
        self.assertIsNone(bo['first_check_in'])

    def test_the_30_day_edge(self):
        self.check_in(self.ann, at(DAY - timedelta(days=29)), '5.00')   # day 30 counting the picked day: still new
        self.check_in(self.bo, at(DAY - timedelta(days=30)), '5.00')
        self.clock(self.ann, DAY, 1)
        self.clock(self.bo, DAY, 1)
        payload = pcc.build(self.lead, DAY)
        self.assertTrue(self.line(payload, self.ann)['is_new'])
        self.assertFalse(self.line(payload, self.bo)['is_new'])

    def test_before_a_first_check_in_the_hire_date_decides(self):
        rookie = staff('rookie@x.com', hired=DAY - timedelta(days=2))
        self.clock(rookie, DAY, 6)
        self.clock(self.bo, DAY, 6)   # hired long ago, no check-in ever: not new
        payload = pcc.build(self.lead, DAY)
        self.assertTrue(self.line(payload, rookie)['is_new'])
        self.assertFalse(self.line(payload, self.bo)['is_new'])


class GoalTests(Base):
    def test_the_days_share_of_the_weekly_goal(self):
        DashboardDepartmentGoal.objects.update_or_create(
            department=DashboardDepartmentGoal.PROCESSING, defaults={'value': '35000', 'schedule': {}})
        goal = pcc.build(self.lead, DAY)['goal']
        self.assertEqual((goal['week'], goal['day'], goal['work_days']), ('35000.00', '7000.00', [0, 1, 2, 3, 4]))
        weekend = pcc.build(self.lead, date(2026, 3, 1))['goal']   # a Sunday: no share
        self.assertEqual((weekend['week'], weekend['day']), ('35000.00', None))

    def test_no_goal_set_is_blank(self):
        DashboardDepartmentGoal.objects.filter(department=DashboardDepartmentGoal.PROCESSING).delete()
        self.assertEqual(pcc.build(self.lead, DAY)['goal']['week'], None)


class WhoSeesWhatTests(Base):
    def setUp(self):
        super().setUp()
        self.check_in(self.ann, at(DAY), '10.00')
        self.check_in(self.bo, at(DAY), '20.00')

    def get(self, user, **params):
        self.client.force_authenticate(user)
        return self.client.get(URL, {'date': DAY.isoformat(), **params})

    def test_a_lead_sees_everyone(self):
        body = self.get(self.lead).json()
        self.assertTrue(body['can_see_everyone'])
        self.assertEqual({p['user_id'] for p in body['people']}, {self.ann.id, self.bo.id})

    def test_my_numbers_is_only_my_line_even_for_a_lead(self):
        self.check_in(self.lead, at(DAY), '70.00')
        body = self.get(self.lead, mine='1').json()
        self.assertFalse(body['can_see_everyone'])
        self.assertEqual([p['user_id'] for p in body['people']], [self.lead.id])
        self.assertEqual(body['people'][0]['day']['dollars'], '70.00')

    def test_a_processor_sees_only_their_own_line_and_the_room(self):
        body = self.get(self.ann).json()
        self.assertFalse(body['can_see_everyone'])
        self.assertEqual([p['user_id'] for p in body['people']], [self.ann.id])
        self.assertEqual(body['people'][0]['day']['dollars'], '10.00')
        self.assertIn('week_dollars', body['room'])

    def test_a_processor_with_nothing_yet_still_gets_their_line(self):
        idle = staff('idle@x.com')
        body = self.get(idle).json()
        self.assertEqual([p['user_id'] for p in body['people']], [idle.id])
        self.assertEqual(body['people'][0]['day']['items'], 0)

    def test_no_pay_data_anywhere(self):
        text = self.get(self.lead).content.decode().lower()
        for word in ('pay_rate', 'wage', 'total_pay', 'salary'):
            self.assertNotIn(word, text)

    def test_customers_and_strangers_are_refused(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(URL).status_code, 401)
        customer = User.objects.create_user(email='cust@x.com', password='x', first_name='Cust', last_name='T')
        customer.groups.add(Group.objects.get_or_create(name='Customer')[0])
        self.client.force_authenticate(customer)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_a_bad_date_is_refused_and_a_future_day_becomes_today(self):
        self.assertEqual(self.get(self.lead, date='tomorrow').status_code, 400)
        body = self.get(self.lead, date='2099-01-01').json()
        self.assertEqual(body['date'], timezone.localdate().isoformat())


class TheWholeRoomTests(Base):
    """Round 2 critic: the room pace left out people on the clock with no check-ins, so a shared sign-in doubled it."""

    def test_the_whole_room_is_every_check_in_over_every_processing_hour(self):
        for _ in range(20):
            self.check_in(self.ann, at(DAY), '10.00')
        self.clock(self.ann, DAY, 4)
        self.clock(self.bo, DAY, 4)          # on the clock, items under Ann's sign-in
        room = pcc.build(self.lead, DAY)['room']
        self.assertEqual(room['day_whole'], {'items': 20, 'hours': '8.00', 'items_per_hour': '2.50', 'dollars_per_hour': '25.00',
                                             'items_off_clock': 0})
        self.assertEqual(room['day_average']['items_per_hour'], '5.00')     # Ann's own line, unchanged
        self.assertEqual(room['shared_sign_in'], {'day': True, 'week': True})

    def test_no_shared_sign_in_when_everyone_on_the_clock_checked_in(self):
        self.check_in(self.ann, at(DAY), '10.00')
        self.clock(self.ann, DAY, 4)
        self.assertEqual(pcc.build(self.lead, DAY)['room']['shared_sign_in'], {'day': False, 'week': False})

    def test_the_processor_is_told_about_a_shared_sign_in_too(self):
        self.check_in(self.ann, at(DAY), '10.00')
        self.clock(self.ann, DAY, 4)
        self.clock(self.bo, DAY, 4)
        self.assertTrue(pcc.build(self.ann, DAY, mine=True)['room']['shared_sign_in']['day'])

    def test_the_owner_is_marked(self):
        owner = staff('owner@x.com', 'Admin', superuser=True)
        self.check_in(owner, at(DAY), '10.00')
        payload = pcc.build(self.lead, DAY)
        self.assertTrue(self.line(payload, owner)['is_owner'])
        self.check_in(self.ann, at(DAY), '10.00')
        self.assertFalse(self.line(pcc.build(self.lead, DAY), self.ann)['is_owner'])

    def test_the_whole_room_week_counts_pace_only_on_days_with_punches(self):
        """The +1 critic: a no-punch Monday's items must not lift the week's room pace."""
        for _ in range(40):
            self.check_in(self.ann, at(MONDAY), '10.00')          # Monday: nobody on the clock
        for _ in range(8):
            self.check_in(self.ann, at(DAY), '10.00')
        self.clock(self.ann, DAY, 4)
        self.clock(self.bo, DAY, 4)
        week = pcc.build(self.lead, DAY)['room']['week_whole']
        self.assertEqual(week, {'items': 48, 'hours': '8.00', 'items_per_hour': '1.00', 'dollars_per_hour': '10.00',
                                'items_off_clock': 40})

    def test_tag_errors_say_how_many_are_already_fixed(self):
        from apps.stocktake.models import Issue

        item = self.check_in(self.ann, at(DAY), '10.00')
        open_tag = BadTag.objects.create(item=item, reason=BadTag.REASON_PRICE_HIGH, checked_in_by=self.ann)
        fixed_tag = BadTag.objects.create(item=item, reason=BadTag.REASON_PRICE_LOW, checked_in_by=self.ann)
        issue = Issue.objects.create(item=item, kind=Issue.KIND_CHOICES[0][0], fixed_at=at(DAY, 12))
        BadTag.objects.filter(pk=fixed_tag.pk).update(found_at=at(DAY), issue=issue)
        BadTag.objects.filter(pk=open_tag.pk).update(found_at=at(DAY))
        day = self.line(pcc.build(self.lead, DAY), self.ann)['day']
        self.assertEqual((day['tag_errors'], day['tag_errors_fixed']), (2, 1))
