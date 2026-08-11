"""The TARS decision contract shared with the browser must match this server.

The browser previously derived its own effective labor rate ($18 x 1.1) and kept
a hand-copied test/stop-out catalog. Those agreed with the server only by
coincidence, so changing one side silently showed the technician a number the
server would never save. Both sides now read
`frontend/src/pages/restoration/tars/tarsDecisionContract.json`; this test fails
if the server drifts away from it, and `tarsDecisionContract.test.ts` fails if
the browser does.
"""

import json

from django.conf import settings
from django.test import SimpleTestCase

from apps.inventory.services.tars_decision_work import (
    CATALOG_VERSION,
    EFFECTIVE_LABOR_RATE,
    MANDATORY_STOP_OUT_CATALOG,
    MINIMUM_HANDLING_MINUTES,
    SCHEMA_VERSION,
    decision_catalog,
)

CONTRACT_PATH = (
    settings.BASE_DIR
    / 'frontend'
    / 'src'
    / 'pages'
    / 'restoration'
    / 'tars'
    / 'tarsDecisionContract.json'
)

DRIFT_HINT = (
    'The shared TARS decision contract no longer matches this server. Update '
    f'{CONTRACT_PATH.name} and re-run the frontend contract test, or revert the '
    'server change.'
)


class TarsDecisionContractTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.contract = json.loads(CONTRACT_PATH.read_text(encoding='utf-8'))

    def test_versions_match(self):
        self.assertEqual(self.contract['schemaVersion'], SCHEMA_VERSION, DRIFT_HINT)
        self.assertEqual(self.contract['catalogVersion'], CATALOG_VERSION, DRIFT_HINT)

    def test_labor_rate_matches(self):
        self.assertEqual(
            self.contract['effectiveLaborRate'],
            float(EFFECTIVE_LABOR_RATE),
            DRIFT_HINT,
        )

    def test_minimum_handling_minutes_match(self):
        expected = {key: float(value) for key, value in MINIMUM_HANDLING_MINUTES.items()}
        self.assertEqual(self.contract['minimumHandlingMinutes'], expected, DRIFT_HINT)

    def test_test_ids_match(self):
        served = sorted(entry['id'] for entry in decision_catalog()['tests'])
        self.assertEqual(sorted(self.contract['testIds']), served, DRIFT_HINT)

    def test_stop_out_blocking_rules_match(self):
        expected = sorted(
            (
                {
                    'id': stop_id,
                    'blocksAllSelections': bool(config.get('blocksAllSelections', False)),
                    'blockedActions': sorted(config.get('blockedActions', ())),
                    'blockedSaleStates': sorted(config.get('blockedSaleStates', ())),
                }
                for stop_id, config in MANDATORY_STOP_OUT_CATALOG.items()
            ),
            key=lambda entry: entry['id'],
        )
        actual = sorted(
            (
                {
                    'id': entry['id'],
                    'blocksAllSelections': bool(entry.get('blocksAllSelections', False)),
                    'blockedActions': sorted(entry.get('blockedActions', ())),
                    'blockedSaleStates': sorted(entry.get('blockedSaleStates', ())),
                }
                for entry in self.contract['stopOuts']
            ),
            key=lambda entry: entry['id'],
        )
        self.assertEqual(actual, expected, DRIFT_HINT)
