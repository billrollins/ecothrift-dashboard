from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import SimpleTestCase


def _lot(pk, title, units, retail, basis='current bid', landed=0.2):
    return {
        'id': pk, 'seller': 'Target', 'title': title, 'short_title': title, 'units': units, 'retail': retail,
        'price': 100.0, 'price_basis': basis, 'bids': 0, 'ends': '2026-11-14T19:00:00+00:00', 'landed_pct': landed,
        'bid_up_to': 500.0, 'manifest': 'none', 'url': 'https://example.test/%d' % pk,
    }


FAKE = {
    'last_listed_at': '2026-11-13T17:20:00+00:00',
    'lots': [
        _lot(1, '4 Pallets of Baby Essentials, 91 Units', 91, 6445.0),
        _lot(2, '6 Pallets of Diapers and Baby Essentials, 600 Units', 600, 14000.0),
        _lot(3, '2 Pallets of LEGO Sets, 136 Units', 136, 18142.0, landed=0.6),
    ],
}


class FindLotsTests(SimpleTestCase):
    def run_cmd(self, *args):
        out = StringIO()
        with mock.patch('apps.buying.services.live_lots.build', return_value=FAKE), \
                mock.patch('apps.buying.management.commands.find_lots.Auction.objects') as objs:
            objs.filter.return_value.values_list.return_value = []
            call_command('find_lots', *args, stdout=out)
        return out.getvalue()

    def test_keyword_and_per_unit_filter(self):
        out = self.run_cmd('--q', 'baby', '--min-per-unit', '40')
        self.assertIn('1 match', out)
        self.assertIn('$71/unit', out)
        self.assertNotIn('Diapers', out)

    def test_max_landed_filter(self):
        out = self.run_cmd('--max-landed', '0.30')
        self.assertIn('2 match', out)
        self.assertNotIn('LEGO', out)
