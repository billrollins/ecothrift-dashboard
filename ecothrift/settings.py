"""
Django settings for ecothrift project — development.
"""
import os
from decimal import Decimal
from pathlib import Path
from datetime import timedelta
from decouple import Config, Csv, RepositoryEnv, RepositoryEmpty

BASE_DIR = Path(__file__).resolve().parent.parent

# Load `.env` from project root when it exists (local dev); fall back to
# environment variables only (Heroku / production where .env is absent).
_env_path = BASE_DIR / '.env'
if _env_path.is_file():
    config = Config(RepositoryEnv(str(_env_path)))
else:
    config = Config(RepositoryEmpty())

# ── Security ──────────────────────────────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

# ── Application definition ────────────────────────────────────────────────────
INSTALLED_APPS = [
    # Django built-ins
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_filters',
    'corsheaders',
    'storages',
    # Project apps
    'apps.accounts',
    'apps.core',
    'apps.hr',
    'apps.inventory',
    'apps.pos',
    'apps.consignment',
    'apps.ai',
    'apps.buying',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ecothrift.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'frontend' / 'dist'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ecothrift.wsgi.application'

# ── Database ──────────────────────────────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DATABASE_NAME', default='ecothrift_v3'),
        'USER': config('DATABASE_USER', default='postgres'),
        'PASSWORD': config('DATABASE_PASSWORD', default='password'),
        'HOST': config('DATABASE_HOST', default='localhost'),
        'PORT': config('DATABASE_PORT', default='5432'),
        'OPTIONS': {
            'options': '-c search_path=ecothrift',
        },
    }
    }

# ── Cache (database backend; release runs createcachetable) ─────────────────────
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'django_cache_table',
    }
}

# Optional second DB for management commands run locally against production (set PROD_DATABASE_*).
_prod_name = config('PROD_DATABASE_NAME', default='')
if _prod_name:
    DATABASES['production'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': _prod_name,
        'USER': config('PROD_DATABASE_USER', default=config('DATABASE_USER', default='postgres')),
        'PASSWORD': config(
            'PROD_DATABASE_PASSWORD',
            default=config('DATABASE_PASSWORD', default='password'),
        ),
        'HOST': config('PROD_DATABASE_HOST', default=config('DATABASE_HOST', default='localhost')),
        'PORT': config('PROD_DATABASE_PORT', default=config('DATABASE_PORT', default='5432')),
        'OPTIONS': {
            'options': '-c search_path=ecothrift',
        },
    }

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'ecothrift.pagination.ConfigurablePageSizePagination',
    'PAGE_SIZE': 50,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# ── SimpleJWT ─────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    # Allow the local print server management page to call public endpoints
    'http://127.0.0.1:8888',
    'http://localhost:8888',
]
# Bookmarklet on bstock.com POSTs JWT to local runserver (api/buying/token/)
if DEBUG:
    CORS_ALLOWED_ORIGINS = list(CORS_ALLOWED_ORIGINS) + [
        'https://bstock.com',
        'https://www.bstock.com',
    ]
CORS_ALLOW_CREDENTIALS = True

# ── Internationalization ──────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Chicago'
USE_I18N = True
USE_TZ = True

# ── Static files ──────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

_frontend_dist = BASE_DIR / 'frontend' / 'dist'
STATICFILES_DIRS = []
if (_frontend_dist / 'assets').exists():
    STATICFILES_DIRS.append(_frontend_dist / 'assets')
if _frontend_dist.exists():
    STATICFILES_DIRS.append(_frontend_dist)

STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Serve Vite build output at root paths (e.g. /assets/*) via WhiteNoise so the
# SPA's script/link tags (which use base="/") resolve to real files.
WHITENOISE_ROOT = _frontend_dist if _frontend_dist.exists() else None

# ── S3 Storage ────────────────────────────────────────────────────────────────
USE_S3 = config('USE_S3', default=False, cast=bool)

if USE_S3:
    STORAGES['default'] = {
        'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
    }
    AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='us-east-2')
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True
else:
    MEDIA_URL = '/media/'
    MEDIA_ROOT = BASE_DIR / 'media'

# ── AI / Anthropic ───────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = config('ANTHROPIC_API_KEY', default='')
# Default model for most AI calls (buying, chat proxy, inventory cleanup, etc.).
AI_MODEL = config('AI_MODEL', default='claude-sonnet-4-6')
# Reserved for cheaper high-volume paths (optional; not required for all features).
AI_MODEL_FAST = config('AI_MODEL_FAST', default='claude-haiku-4-5')
# Backward compatibility: single knob — same as AI_MODEL.
BUYING_CATEGORY_AI_MODEL = AI_MODEL

# USD per 1M tokens (update when Anthropic changes pricing; restart required).
AI_PRICING = {
    'claude-sonnet-4-6': {
        'input': Decimal('3.00'),
        'output': Decimal('15.00'),
        'cache_write': Decimal('3.75'),
        'cache_read': Decimal('0.30'),
    },
    'claude-opus-4-6': {
        'input': Decimal('5.00'),
        'output': Decimal('25.00'),
        'cache_write': Decimal('6.25'),
        'cache_read': Decimal('0.50'),
    },
    'claude-haiku-4-5': {
        'input': Decimal('1.00'),
        'output': Decimal('5.00'),
        'cache_write': Decimal('1.25'),
        'cache_read': Decimal('0.10'),
    },
}

# ── Buying / B-Stock (search POST is unauthenticated; other calls need JWT) ─
BSTOCK_AUTH_TOKEN = config('BSTOCK_AUTH_TOKEN', default='')
BUYING_REQUEST_DELAY_SECONDS = config(
    'BUYING_REQUEST_DELAY_SECONDS', default=0.0, cast=float
)
BSTOCK_MAX_RETRIES = config('BSTOCK_MAX_RETRIES', default=3, cast=int)
BSTOCK_SEARCH_MAX_PAGES = config('BSTOCK_SEARCH_MAX_PAGES', default=5000, cast=int)
BUYING_SWEEP_MAX_WORKERS = config('BUYING_SWEEP_MAX_WORKERS', default=8, cast=int)
# SOCKS5 for B-Stock search POST only (optional; requires PySocks). See .env.example.
BUYING_SOCKS5_PROXY_ENABLED = config(
    'BUYING_SOCKS5_PROXY_ENABLED', default=False, cast=bool
)
BUYING_SOCKS5_PROXY_HOST = config('BUYING_SOCKS5_PROXY_HOST', default='')
BUYING_SOCKS5_PROXY_PORT = config('BUYING_SOCKS5_PROXY_PORT', default='')
BUYING_SOCKS5_PROXY_USER = config('BUYING_SOCKS5_PROXY_USER', default='')
BUYING_SOCKS5_PROXY_PASSWORD = config('BUYING_SOCKS5_PROXY_PASSWORD', default='')

# B-Stock outbound HTTP audit log (apps.buying.services.scraper → logger buying.scraper)
_LOGS_DIR = BASE_DIR / 'logs'
_LOGS_DIR.mkdir(parents=True, exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'bstock_api': {
            'format': '%(asctime)s | %(message)s',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'bstock_console': {
            'class': 'logging.StreamHandler',
            'formatter': 'bstock_api',
        },
        'bstock_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(_LOGS_DIR / 'bstock_api.log'),
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'bstock_api',
        },
    },
    'loggers': {
        'buying.scraper': {
            'handlers': ['bstock_console', 'bstock_file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ── Default primary key ──────────────────────────────────────────────────────
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
