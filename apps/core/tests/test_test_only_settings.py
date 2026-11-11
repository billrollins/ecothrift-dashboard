"""The fast password hasher is for tests only: a normal process (the web server, a command) keeps Django's real one."""
import json
import os
import subprocess
import sys

from django.conf import settings
from django.conf import global_settings
from django.test import SimpleTestCase


def _settings_in_a_fresh_process(module: str, extra_env: dict | None = None) -> dict:
    """Load the settings the way gunicorn or a management command does: no pytest in argv, no pytest env."""
    env = {k: v for k, v in os.environ.items() if not k.startswith('PYTEST_')}
    env.update({'DJANGO_SETTINGS_MODULE': module, **(extra_env or {})})
    code = ('import json, django; from django.conf import settings; django.setup(); '
            'print(json.dumps({"hashers": settings.PASSWORD_HASHERS, "tests": settings.RUNNING_TESTS}))')
    out = subprocess.run([sys.executable, '-c', code], cwd=settings.BASE_DIR, env=env,
                         capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-600:]
    return json.loads(out.stdout.strip().splitlines()[-1])


class TestOnlySettingsTests(SimpleTestCase):
    def test_tests_use_the_fast_hasher(self):
        self.assertTrue(settings.RUNNING_TESTS)
        self.assertEqual(settings.PASSWORD_HASHERS, ['django.contrib.auth.hashers.MD5PasswordHasher'])

    def test_a_normal_process_keeps_the_real_hasher(self):
        got = _settings_in_a_fresh_process('ecothrift.settings')
        self.assertFalse(got['tests'])
        self.assertEqual(got['hashers'], global_settings.PASSWORD_HASHERS)
        self.assertIn('PBKDF2PasswordHasher', got['hashers'][0])

    def test_production_settings_keep_the_real_hasher(self):
        got = _settings_in_a_fresh_process(
            'ecothrift.settings_production',
            {'DATABASE_URL': 'postgres://u:p@localhost:5432/not_used'},
        )
        self.assertFalse(got['tests'])
        self.assertEqual(got['hashers'], global_settings.PASSWORD_HASHERS)
