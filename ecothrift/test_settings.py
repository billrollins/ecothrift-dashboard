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

# In-memory cache for tests (no django_cache_table migration in SQLite test DB).
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'ecothrift-test-cache',
    }
}
