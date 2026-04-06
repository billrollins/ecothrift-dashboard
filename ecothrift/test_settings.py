"""SQLite settings for `manage.py test` when PostgreSQL test DB / schema is unavailable locally."""
import os

os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from ecothrift.settings import *  # noqa: E402, F403, F401

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    },
}
