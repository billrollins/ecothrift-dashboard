"""read_memo: a read-only request reads a setting once (Dashboard speed, 2026-10-22)."""

from django.test import TestCase

from apps.core.models import AppSetting
from apps.core.services.read_memo import read_memo
from apps.routines.settings import retail_qa_settings
from apps.webstore.services.hours import is_open_day


class ReadMemoTests(TestCase):
    def test_outside_every_call_reads_inside_one_does(self):
        with self.assertNumQueries(2):
            retail_qa_settings()
            retail_qa_settings()
        with read_memo(), self.assertNumQueries(1):
            retail_qa_settings()
            retail_qa_settings()

    def test_callers_get_their_own_copy(self):
        with read_memo():
            first = retail_qa_settings()
            first['weight_spot'] = 'changed'
            self.assertNotEqual(retail_qa_settings()['weight_spot'], 'changed')

    def test_a_change_after_the_block_is_seen(self):
        with read_memo():
            before = retail_qa_settings()['weight_spot']
        AppSetting.objects.update_or_create(key='retail_qa.weight_spot', defaults={'value': before + 5})
        self.assertNotEqual(before, retail_qa_settings()['weight_spot'])

    def test_store_hours_are_read_once_for_a_week_of_days(self):
        from datetime import date, timedelta

        monday = date(2026, 10, 19)
        with read_memo(), self.assertNumQueries(2):  # the hours row and the overrides, once each
            for offset in range(7):
                is_open_day(monday + timedelta(days=offset))
