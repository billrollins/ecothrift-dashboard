"""
Production settings for ecothrift — Heroku deployment.
Imports from base settings and overrides where needed.
"""
from .settings import *  # noqa: F401, F403
import dj_database_url

DEBUG = False

# Database — use Heroku DATABASE_URL
DATABASES['default'] = dj_database_url.config(  # noqa: F405
    conn_max_age=600,
    ssl_require=True,
)

# Security
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# CORS
CORS_ALLOWED_ORIGINS = [
    'https://dash.ecothrift.us',
]

# Hosts
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='dash.ecothrift.us', cast=Csv())  # noqa: F405
