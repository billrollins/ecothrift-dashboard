"""Closed days in the 3-day return window (owner 2026-10-20): the window stays 3 calendar days (W2), and the member
hears it at the sale."""
from datetime import date

from django.test import TestCase

from apps.core.models import AppSetting
from apps.thriftplus.services import returns
from apps.webstore.models import StoreHoursOverride

FRI = date(2026, 10, 16)
TUE = date(2026, 10, 20)


class ClosedNoteTests(TestCase):
    def setUp(self):
        returns._NOTE_CACHE.clear()
        AppSetting.objects.update_or_create(key='online_sales.hours', defaults={'value': {'closed_weekdays': [0, 6]}})

    def test_a_friday_sale_before_a_closed_sunday_and_monday(self):
        self.assertEqual(returns.closed_note(FRI),
                         "Heads up: we're closed Sun Oct 18 and Mon Oct 19. Returns for today's items end Sat Oct 17.")

    def test_every_day_open_says_nothing(self):
        self.assertEqual(returns.closed_note(TUE), '')

    def test_open_seven_days(self):
        AppSetting.objects.filter(key='online_sales.hours').update(value={'closed_weekdays': []})
        self.assertEqual(returns.closed_note(FRI), '')

    def test_a_holiday_closure_in_the_window(self):
        AppSetting.objects.filter(key='online_sales.hours').update(value={'closed_weekdays': []})
        StoreHoursOverride.objects.create(label='Thanksgiving', date_start=date(2026, 11, 26), date_end=date(2026, 11, 26),
                                          closed=True)
        self.assertEqual(returns.closed_note(date(2026, 11, 24)),
                         "Heads up: we're closed Thu Nov 26. Returns for today's items end Fri Nov 27.")

    def test_closed_all_three_days(self):
        AppSetting.objects.filter(key='online_sales.hours').update(value={'closed_weekdays': []})
        StoreHoursOverride.objects.create(label='Remodel', date_start=date(2026, 12, 1), date_end=date(2026, 12, 3), closed=True)
        self.assertEqual(returns.closed_note(date(2026, 11, 30)),
                         "Heads up: we're closed Tue Dec 1, Wed Dec 2 and Thu Dec 3. Returns for today's items end today only.")
