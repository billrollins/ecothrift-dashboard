"""
Django settings for ecothrift project — development.
"""
import os
import sys
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
# development = manifest API dev timelogs under workspace/b-manifest-api/
ENVIRONMENT = config('ENVIRONMENT', default='production')
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

# Public storefront hostnames (served by apps.core.middleware.PublicSiteMiddleware).
# Hosts listed here get the public site instead of the staff dashboard SPA. Empty by
# default so local dev and the dashboard host are unaffected; production sets these.
PUBLIC_SITE_HOSTS = config('PUBLIC_SITE_HOSTS', default='', cast=Csv())
# Canonical public host; other public hosts 301-redirect to it (e.g. www → apex).
PUBLIC_SITE_CANONICAL_HOST = config('PUBLIC_SITE_CANONICAL_HOST', default='ecothrift.us')

# ── Web store (public storefront commerce) ────────────────────────────────────
# Payment processor is NOT Stripe (owner decision). The order flow runs end-to-end
# with a no-op "manual" provider (placed → staff arrange payment) until a real
# processor (likely Helcim) is wired — then just set this to its key + add creds.
WEBSTORE_PAYMENT_PROVIDER = config('WEBSTORE_PAYMENT_PROVIDER', default='manual')
WEBSTORE_SALES_TAX_RATE = config('WEBSTORE_SALES_TAX_RATE', default='0.07')  # Omaha, NE ≈ 7%
WEBSTORE_SHIP_FLAT = config('WEBSTORE_SHIP_FLAT', default='9.95')
# Optional staff address that receives a copy of each new web order.
WEBSTORE_ORDER_NOTIFY_EMAIL = config('WEBSTORE_ORDER_NOTIFY_EMAIL', default='')

# Email — console backend by default so local dev prints messages (and order
# confirmations never block checkout). Set EMAIL_BACKEND + SMTP/provider creds to send.
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='Eco-Thrift <sales.ecothrift@outlook.com>')

# ── Application definition ────────────────────────────────────────────────────
INSTALLED_APPS = [
    # Django built-ins
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.postgres',
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
    'apps.webstore',
    'apps.blog',
    'apps.floorplan',
    'apps.labels',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    # Host-based routing: public storefront on public hosts; dashboard on the dash host.
    'apps.core.middleware.PublicSiteMiddleware',
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

# Test DB is created empty; force search_path=public (always present) so django_migrations
# can be created. Covers both ``manage.py test`` and ``pytest`` entry points.
# Dev/prod keep search_path=ecothrift on default above.
_RUNNING_TESTS = (
    (len(sys.argv) >= 2 and sys.argv[1] == 'test')
    or bool(os.environ.get('PYTEST_CURRENT_TEST'))
    or any('pytest' in (arg or '').lower() for arg in sys.argv[:1])
)
if _RUNNING_TESTS:
    DATABASES['default']['OPTIONS'] = {'options': '-c search_path=public'}

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
    if _RUNNING_TESTS:
        DATABASES['production']['OPTIONS'] = {'options': '-c search_path=public'}

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
    'DEFAULT_THROTTLE_RATES': {
        'labels_propose_structure': '30/hour',
        'labels_generate_background': '10/hour',
    },
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

# Public storefront build (separate Vite app in frontend-public/, served on the
# public hosts). Its assets are collected under STATIC_ROOT/site and served by
# WhiteNoise at /static/site/* — the public build sets Vite base to match.
_frontend_public_dist = BASE_DIR / 'frontend-public' / 'dist'
if _frontend_public_dist.exists():
    STATICFILES_DIRS.append(('site', _frontend_public_dist))
# index.html served on the public hosts by PublicSiteMiddleware (falls back to the
# holding page when the public build is absent, e.g. local dev).
PUBLIC_SITE_INDEX = (
    str(_frontend_public_dist / 'index.html')
    if (_frontend_public_dist / 'index.html').exists()
    else None
)

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

# ── AI / LLM — keys and models (single source: .env / Heroku config vars) ───
def _normalize_anthropic_model_id(model_id: str) -> str:
    """Map invalid ids (e.g. claude-haiku-4-6 does not exist; Haiku 4.x is claude-haiku-4-5)."""
    mid = (model_id or '').strip()
    if mid.lower().startswith('grok') or mid.lower().startswith('gemini'):
        return mid
    if mid == 'claude-haiku-4-6':
        return 'claude-haiku-4-5'
    return mid


def _ai_model_setting(env_key: str, default: str) -> str:
    """Read ``AI_MODEL_*`` from .env; fall back to *default* when unset or blank."""
    raw = config(env_key, default='').strip()
    return _normalize_anthropic_model_id(raw or default)


# --- API keys ---
ANTHROPIC_API_KEY = config('ANTHROPIC_API_KEY', default='').strip()
XAI_API_KEY = (
    config('XAI_API_KEY', default='').strip()
    or config('GROK_API_KEY', default='').strip()
)
XAI_API_BASE = config('XAI_API_BASE', default='https://api.x.ai/v1').strip()
GOOGLE_API_KEY = (
    config('GOOGLE_API_KEY', default='').strip()
    or config('GEMINI_API_KEY', default='').strip()
)
GEMINI_API_KEY = GOOGLE_API_KEY  # alias
# Maps Platform key for POS delivery driving distance (Distance Matrix). Do not reuse Gemini-only keys.
GOOGLE_MAPS_API_KEY = config('GOOGLE_MAPS_API_KEY', default='').strip()

# --- Provider routing (llm_router: auto | anthropic | xai | google) ---
# auto: grok-* → xAI, gemini-* → Google, otherwise Anthropic. All AI call sites
# route through apps/core/services/llm_router.py.
AI_PROVIDER = config('AI_PROVIDER', default='auto').strip().lower()

# --- Base defaults (fallback when a purpose-specific knob is unset) ---
AI_MODEL = _normalize_anthropic_model_id(config('AI_MODEL', default='claude-sonnet-4-6'))
AI_MODEL_FAST = _normalize_anthropic_model_id(config('AI_MODEL_FAST', default='claude-haiku-4-5'))

# --- Purpose-specific models (see .env.example for which feature each drives) ---
AI_MODEL_INVENTORY_CLEANUP = _ai_model_setting('AI_MODEL_INVENTORY_CLEANUP', 'gemini-2.5-flash')
AI_MODEL_PREPROCESSING_SUGGEST = _ai_model_setting('AI_MODEL_PREPROCESSING_SUGGEST', AI_MODEL)
AI_MODEL_SUGGEST_ITEM = _ai_model_setting('AI_MODEL_SUGGEST_ITEM', AI_MODEL_FAST)
AI_MODEL_SUGGEST_PRODUCT = _ai_model_setting('AI_MODEL_SUGGEST_PRODUCT', AI_MODEL_SUGGEST_ITEM)
AI_MODEL_SUGGEST_FINALIZATION = _ai_model_setting('AI_MODEL_SUGGEST_FINALIZATION', AI_MODEL)
AI_MODEL_AI_CHAT = _ai_model_setting('AI_MODEL_AI_CHAT', AI_MODEL)
AI_MODEL_LABEL_STRUCTURE = _ai_model_setting('AI_MODEL_LABEL_STRUCTURE', AI_MODEL_AI_CHAT)
AI_MODEL_LABEL_IMAGE = _ai_model_setting('AI_MODEL_LABEL_IMAGE', 'grok-imagine-image-quality')
AI_MODEL_MANIFEST_TEMPLATE = _ai_model_setting('AI_MODEL_MANIFEST_TEMPLATE', AI_MODEL)
AI_MODEL_CATEGORY_AI = _ai_model_setting('AI_MODEL_CATEGORY_AI', AI_MODEL)
AI_MODEL_KEY_MAPPING = _ai_model_setting('AI_MODEL_KEY_MAPPING', AI_MODEL)
AI_MODEL_TITLE_CATEGORY_ESTIMATE = _ai_model_setting('AI_MODEL_TITLE_CATEGORY_ESTIMATE', AI_MODEL_FAST)
AI_MODEL_INVENTORY_CLASSIFY = _ai_model_setting('AI_MODEL_INVENTORY_CLASSIFY', AI_MODEL_FAST)
# Reserved — match-products endpoint is deprecated (410).
AI_MODEL_MATCH_PRODUCTS = _ai_model_setting('AI_MODEL_MATCH_PRODUCTS', AI_MODEL)

# Backward compatibility alias used by buying category AI.
BUYING_CATEGORY_AI_MODEL = AI_MODEL_CATEGORY_AI

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
    'gemini-3.1-flash-lite': {
        'input': Decimal('0.25'),
        'output': Decimal('1.50'),
        'cache_write': Decimal('0.00'),
        'cache_read': Decimal('0.00'),
    },
}

# ── Buying / B-Stock (search POST is unauthenticated; other calls need JWT) ─
BSTOCK_AUTH_TOKEN = config('BSTOCK_AUTH_TOKEN', default='')
BUYING_REQUEST_DELAY_SECONDS = config(
    'BUYING_REQUEST_DELAY_SECONDS', default=0.0, cast=float
)
# When True, start fetching the next auction's manifest while post-processing the current one.
MANIFEST_PULL_PREFETCH = config('MANIFEST_PULL_PREFETCH', default=True, cast=bool)
BSTOCK_MAX_RETRIES = config('BSTOCK_MAX_RETRIES', default=3, cast=int)
BSTOCK_SEARCH_MAX_PAGES = config('BSTOCK_SEARCH_MAX_PAGES', default=5000, cast=int)
BUYING_SWEEP_MAX_WORKERS = config('BUYING_SWEEP_MAX_WORKERS', default=8, cast=int)
# SOCKS5 for all outbound B-Stock HTTP in apps.buying.services.scraper (optional; requires PySocks).
BUYING_SOCKS5_PROXY_ENABLED = config(
    'BUYING_SOCKS5_PROXY_ENABLED', default=False, cast=bool
)
BUYING_SOCKS5_PROXY_HOST = config('BUYING_SOCKS5_PROXY_HOST', default='')
BUYING_SOCKS5_PROXY_PORT = config('BUYING_SOCKS5_PROXY_PORT', default='')
BUYING_SOCKS5_PROXY_USER = config('BUYING_SOCKS5_PROXY_USER', default='')
BUYING_SOCKS5_PROXY_PASSWORD = config('BUYING_SOCKS5_PROXY_PASSWORD', default='')
# Optional: resolved IP of the proxy host (nslookup proxy-nl.privateinternetaccess.com). Overrides hostname in proxy URL.
BUYING_SOCKS5_PROXY_IP = config('BUYING_SOCKS5_PROXY_IP', default='')
# True = socks5:// (local DNS). False = socks5h:// (remote DNS at proxy). PIA needs True (socks5h → 0x04).
BUYING_SOCKS5_LOCAL_DNS = config('BUYING_SOCKS5_LOCAL_DNS', default=True, cast=bool)
# Dev: log each B-Stock request SOCKS endpoint (redacted) + periodic egress IP via same proxy
BUYING_SOCKS5_DEV_AUDIT = config('BUYING_SOCKS5_DEV_AUDIT', default=False, cast=bool)
BUYING_SOCKS5_EGRESS_PROBE_SECONDS = config(
    'BUYING_SOCKS5_EGRESS_PROBE_SECONDS', default=45.0, cast=float
)

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
