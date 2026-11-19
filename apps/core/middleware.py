"""Host-based routing: public storefront vs. staff dashboard.

`ecothrift.us`, `www.ecothrift.us`, and `dash.ecothrift.us` all resolve to the
same Heroku app. The staff dashboard SPA must only answer on the dashboard host;
the public hostnames get the public site (a holding page for now - Phase 0 of the
``public_website`` initiative). A single canonical public host is enforced with a
301 redirect from the other (e.g. ``www`` -> apex).

Activated only when ``settings.PUBLIC_SITE_HOSTS`` is non-empty, so local dev and
the dashboard host are unaffected - except the Thrift+ Member pages, which the
dashboard host (``settings.STAFF_DASHBOARD_HOST``) sends to the public host
(owner 2026-10-16: the member app installs from ecothrift.us only).
"""
from __future__ import annotations

import re
import time
from decimal import Decimal

from django.conf import settings
from django.http import HttpResponse, HttpResponsePermanentRedirect, HttpResponseRedirect
from django.template.loader import render_to_string

# Paths that must keep working on a public host (shared API, assets, admin, media).
_PASSTHROUGH_PREFIXES = ('/api/', '/static/', '/assets/', '/media/', '/db-admin/')

# Exact paths served by Django views on the public host (SEO endpoints, and the text opt-in screenshot that Twilio's
# toll-free review was given as ecothrift.us/sms-opt-in.png, 2026-10-20).
_PASSTHROUGH_PATHS = ('/robots.txt', '/sitemap.xml', '/sms-opt-in.png')

# The interview short link in texts (ecothrift.us/i/<code>) and the price tag's QR (ECOTHRIFT.US/I/<SKU>, capitals):
# a Django redirect, on any public host.
_SHORT_LINK_PREFIXES = ('/i/', '/I/')

# Dashboard SPA routes that customers open on the public host: the Thrift+ scanner
# (www.ecothrift.us/scan). They pass through to the dashboard app, which serves them publicly.
# ecothrift.us/qr (owner 2026-10-14): straight to the Member QR in the scanner (a redirect in ecothrift/urls.py);
# /card is the old address, kept quietly. On the dash host these same paths go to ecothrift.us (owner 2026-10-16).
_DASHBOARD_SPA_PATHS = ('/scan', '/qr', '/card', '/join')  # /join: owner 2026-10-15 (J8)

# Public landing template (Django-rendered; replaced by the public SPA in a later phase).
_HOLDING_TEMPLATE = 'public/holding.html'
_HOLD_SHELL_MARKER = '<!--PUBLIC_SHELL-->'
_HOLD_PATH_RE = re.compile(r'^/hold/(?P<token>[\w-]+)/?$')

# ── The phone site (owner 2026-11-19; workspace/app-mockups/real-build/PLAN.md "The switch and the preview") ──────
# A second, lean public entry (frontend-public/phone.html). It answers when the visitor is on a phone AND the switch is
# on AND the path is one it owns; the cookie lets the owner preview it in production before the switch is on.
# Keep OWNED_PATH_RE in step with frontend-public/dev-tools/phoneDev.ts.
OWNED_PATH_RE = re.compile(
    r'^/(?:store(?:/item/[\w-]+)?|categories|thriftplus(?:/[\w-]+)?|about|questions|careers(?:/[\w-]+)?|menu|visit'
    r'|terms|privacy|blog(?:/[\w-]+)?|account(?:/[\w-]+)*|verify|sell|order/[\w-]+)?/?$')
PHONE_SETTING_KEY = 'storefront.phone_site'  # AppSetting: "off" (default) | "on"
PHONE_SETTING_SECONDS = 30
# The second switch (PLAN-SCANNER.md section 5): the Thrift+ scanner at /scan in the phone site, rolled back on its own.
# /scan (and /scan/) answers with the phone index only for a visitor who gets the phone site AND with this switch on;
# the eco_site cookie previews or refuses it regardless of both. Everything else of the member app is unchanged: /qr,
# /card, /join (302s in ecothrift/urls.py), /i/... (apps/core/views.py), the dash-host 302, the manifest and icons.
PHONE_SCAN_SETTING_KEY = 'storefront.phone_scan'  # AppSetting: "off" (default) | "on"
SCAN_PATHS = ('/scan', '/scan/')
SITE_COOKIE = 'eco_site'                     # "phone" | "classic"
SITE_COOKIE_SECONDS = 30 * 24 * 3600
SITE_CHOICES = ('phone', 'classic')
# The preview is the owner's alone (2026-11-19: "i want access and no normal visitors to see it"): ?site=phone works only
# with a signed key (?k=, minted by `manage.py phone_preview_link`), and the cookie holds that key, so neither the address
# nor the cookie can be made up. ?site=classic needs no key: it only ever gives the current site.
PREVIEW_SALT = 'storefront.phone-preview'
PREVIEW_LINK_SECONDS = 7 * 24 * 3600         # a minted link can be opened for a week; the cookie then lasts 30 days


def preview_token() -> str:
    from django.core import signing

    return signing.TimestampSigner(salt=PREVIEW_SALT).sign('phone')


def _token_ok(value: str, max_age: int) -> bool:
    from django.core import signing

    if not value:
        return False
    try:
        return signing.TimestampSigner(salt=PREVIEW_SALT).unsign(value, max_age=max_age) == 'phone'
    except signing.BadSignature:  # also an expired one
        return False


def cookie_choice(request) -> str | None:
    """'phone' (a valid signed key), 'classic', or None when the cookie is absent, made up or too old."""
    value = request.COOKIES.get(SITE_COOKIE) or ''
    if value == 'classic':
        return 'classic'
    return 'phone' if _token_ok(value, SITE_COOKIE_SECONDS + PREVIEW_LINK_SECONDS) else None
_BOOT_MARKER = '<!--ECO_BOOT-->'
_phone_setting_cache: tuple[bool, float] | None = None
_phone_scan_cache: tuple[bool, float] | None = None
_boot_cache: tuple[str, str] | None = None   # (etag, the <script> tag), so a warm page re-escapes nothing


def _read_switch(key: str) -> bool:
    """An on/off AppSetting: "on" (or true, or {"value": "on"}) is on; missing, anything else or any error is off."""
    try:
        from apps.core.models import AppSetting

        row = AppSetting.objects.filter(key=key).values_list('value', flat=True).first()
        value = row.get('value', row.get('mode')) if isinstance(row, dict) else row
        return value is True or str(value or '').strip().lower() == 'on'
    except Exception:
        return False


def phone_site_on() -> bool:
    """AppSetting ``storefront.phone_site`` is "on", read at most every 30 seconds per worker (off on any error)."""
    global _phone_setting_cache
    now = time.monotonic()
    if _phone_setting_cache is not None and now < _phone_setting_cache[1]:
        return _phone_setting_cache[0]
    on = _read_switch(PHONE_SETTING_KEY)
    _phone_setting_cache = (on, now + PHONE_SETTING_SECONDS)
    return on


def phone_scan_on() -> bool:
    """AppSetting ``storefront.phone_scan`` is "on", read at most every 30 seconds per worker (off on any error)."""
    global _phone_scan_cache
    now = time.monotonic()
    if _phone_scan_cache is not None and now < _phone_scan_cache[1]:
        return _phone_scan_cache[0]
    on = _read_switch(PHONE_SCAN_SETTING_KEY)
    _phone_scan_cache = (on, now + PHONE_SETTING_SECONDS)
    return on


def is_phone(request) -> bool:
    """A phone: the User-Agent says ``Mobi``, and ``Sec-CH-UA-Mobile`` (when the browser sends it) says ``?1``."""
    if 'Mobi' not in request.META.get('HTTP_USER_AGENT', ''):
        return False
    hint = request.META.get('HTTP_SEC_CH_UA_MOBILE')
    return hint is None or hint.strip() == '?1'


def boot_script(scan: bool = False) -> str:
    """The home feed as ``<script id="eco-boot" type="application/json">``, or '' when there is no snapshot yet.

    Reads the storefront's snapshot holder without building one (a cold worker stamps nothing and the page fetches
    home.json); a stale copy still stamps, and starts the holder's background refresh. Never fails the page.
    ``<`` is written ``\\u003c`` so nothing in the JSON can close the script tag.

    ``scan``: /scan would give this visitor the phone scanner, so the stamp carries ``"scan": true`` (its first key)
    and the shell links to /scan as a route (frontend-public/src/phone/scan/switch.ts); without it, a full page load.
    """
    global _boot_cache
    try:
        from apps.storefront.services.holder import holder

        if holder.peek() is None:
            return ''
        home = holder.get().home
        if _boot_cache is not None and _boot_cache[0] == home.etag:
            tag = _boot_cache[1]
        else:
            body = home.raw.decode('utf-8').replace('<', '\\u003c')
            tag = f'{_STAMP_OPEN}{body}</script>'
            _boot_cache = (home.etag, tag)
        return _with_scan(tag) if scan else tag
    except Exception:
        return ''


_STAMP_OPEN = '<script id="eco-boot" type="application/json">'


def _with_scan(tag: str) -> str:
    """The stamp with ``"scan":true`` as the feed's first key (the feed is one JSON object; an empty one stays valid)."""
    body = tag[len(_STAMP_OPEN):]
    if not tag.startswith(_STAMP_OPEN) or not body.startswith('{'):
        return tag
    rest = body[1:]
    joiner = '' if rest.lstrip().startswith('}') else ','
    return f'{_STAMP_OPEN}{{"scan":true{joiner}{rest}'


# Homepage featured shell - avoid a DB hit on every public request.
_HOME_SHELL_TTL_SECONDS = 60
_home_shell_cache: tuple[str, float] | None = None

# Keep in sync with FEATURED_MIN / FEATURED_SHOWN in frontend-public HomePage.tsx.
HOME_FEATURED_MIN = 1
# SPA pages through these; the shell stamps the first one for first paint.
HOME_FEATURED_SHOWN = 8


def rewrite_legacy_path(path: str) -> str | None:
    """Map old Shopify URLs to their new homes for SEO continuity.

    Returns the new path (for a 301) or ``None`` when the path is already native.
    """
    if path == '/products':
        return '/shop'
    if path.startswith('/products/'):  # Shopify product handle → our slug route
        return '/shop/' + path[len('/products/'):]
    if path == '/collections':
        return '/shop'
    if path.startswith('/collections/'):
        from apps.webstore.shop_categories import LEGACY_COLLECTION_SLUGS, SHOP_CATEGORY_SLUGS

        handle = path[len('/collections/'):].strip('/').split('/')[0].lower()
        if not handle:
            return '/shop'
        mapped = LEGACY_COLLECTION_SLUGS.get(handle, handle)
        if mapped is None:
            return '/shop'
        if mapped in SHOP_CATEGORY_SLUGS:
            return f'/shop?category={mapped}'
        return '/shop'
    if path == '/blogs' or path.startswith('/blogs/'):
        # Known Shopify article handles → their new post slugs (SEO continuity);
        # anything else under /blogs/ falls back to the blog list.
        legacy_blog_articles = {
            'what-we-have-accomplished-so-far': 'navigating-growth',
            'what-we-are-working-on-now': 'turns-two',
            'our-vision-for-the-future': 'our-vision',
        }
        handle = path.rstrip('/').rsplit('/', 1)[-1].lower()
        slug = legacy_blog_articles.get(handle)
        return f'/blog/{slug}' if slug else '/blog'
    if path == '/cart':
        return '/shop'
    if path == '/account' or path.startswith('/account/'):
        # The site's own account pages (/account, /account/sign-in, /history, /messages) load as they are (owner
        # 2026-10-15); only Shopify's old account addresses move.
        sub = path[len('/account'):].strip('/').split('/')[0].lower()
        if sub in ('login', 'register'):
            return '/account/sign-in'
        if sub in ('addresses', 'orders', 'activate', 'reset', 'logout'):
            return '/account'
        return None
    if path == '/pages':
        return '/'
    if path.startswith('/pages/'):
        slug = path[len('/pages/'):].strip('/').lower()
        if slug in ('visit', 'visit-us', 'location', 'hours', 'contact', 'contact-us'):
            return '/visit'
        if slug in ('sell', 'sell-with-us', 'consign', 'consignment'):
            return '/'  # the Sell page is hidden until consignment starts (owner 2026-10-15)
        if slug in ('blog', 'news', 'blogs'):
            return '/blog'
        return '/'
    return None


class PublicSiteMiddleware:
    """Serve the public site on public hostnames; leave other hosts untouched."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.public_hosts = {
            h.strip().lower()
            for h in getattr(settings, 'PUBLIC_SITE_HOSTS', []) or []
            if h and h.strip()
        }
        self.canonical_host = (
            getattr(settings, 'PUBLIC_SITE_CANONICAL_HOST', '') or ''
        ).strip().lower()
        # Built public SPA index.html (None in local dev → holding page is served).
        self.index_path = getattr(settings, 'PUBLIC_SITE_INDEX', None)
        self._index_html = None
        # The phone site's built phone.html (None when that build is absent: the current site answers everything).
        self.phone_index_path = getattr(settings, 'PUBLIC_SITE_PHONE_INDEX', None)
        self._phone_html = None
        # The staff dashboard host (dash.ecothrift.us). Local hosts never match, so local dev keeps /scan.
        self.dash_host = (getattr(settings, 'STAFF_DASHBOARD_HOST', '') or '').strip().lower().split(':')[0]

    def __call__(self, request):
        if self.public_hosts or self.dash_host:
            try:
                host = request.get_host().split(':')[0].lower()
            except Exception:  # pragma: no cover - get_host validates against ALLOWED_HOSTS
                host = ''
            if self.public_hosts and host in self.public_hosts:
                response = self._handle_public(request, host)
                if response is not None:
                    return response
            elif host and host == self.dash_host:
                response = self._member_app_off_dash(request)
                if response is not None:
                    return response
        return self.get_response(request)

    def _member_app_off_dash(self, request):
        """
        Owner 2026-10-16: two home-screen apps, Thrift+ Member (ecothrift.us) and Thrift+ Staff (dash.ecothrift.us/staff).
        The member pages on the dash host (/scan, /qr, /card, /join) go to the same address on ecothrift.us (302, the
        query kept), so the member app is only ever installed from ecothrift.us and its scope never covers the staff app.
        """
        path = request.path
        if not any(path == p or path.startswith(p + '/') for p in _DASHBOARD_SPA_PATHS):
            return None
        target_host = self.canonical_host or 'ecothrift.us'
        if target_host == self.dash_host:
            return None
        target = f'https://{target_host}{path}'
        query = request.META.get('QUERY_STRING', '')
        if query:
            target = f'{target}?{query}'
        return HttpResponseRedirect(target)

    def _handle_public(self, request, host):
        path = request.path

        # Keep the shared API, assets, admin, and SEO endpoints working on the public host.
        if path.startswith((*_PASSTHROUGH_PREFIXES, *_SHORT_LINK_PREFIXES)) or path in _PASSTHROUGH_PATHS:
            return None
        if path in SCAN_PATHS:
            # The scanner (PLAN-SCANNER.md section 5): ?site= works here too (ecothrift.us/scan?site=classic is one
            # phone's way back); the phone scanner when the switches (or the cookie) say so; else today's pass-through.
            site = request.GET.get('site')
            if site in SITE_CHOICES:
                return self._site_choice_redirect(request, site)
            if self._wants_phone_scan(request):
                response = self._phone_page_response(request)
                if response is not None:
                    return response
            return None
        if any(path == p or path.startswith(p + '/') for p in _DASHBOARD_SPA_PATHS):
            return None

        # Resolve canonical host + any legacy Shopify-URL rewrite into a single 301
        # (avoids chained redirects, e.g. www + /products/x → apex /shop/x in one hop).
        target_host = self.canonical_host or host
        new_path = rewrite_legacy_path(path) or path
        if host != target_host or new_path != path:
            scheme = 'https' if request.is_secure() else request.scheme
            target = f'{scheme}://{target_host}{new_path}'
            query = request.META.get('QUERY_STRING', '')
            if query:
                target = f'{target}?{query}'
            return HttpResponsePermanentRedirect(target)

        # The phone site's preview switch: ?site=phone|classic sets the cookie and comes back without it.
        site = request.GET.get('site')
        if site in SITE_CHOICES:
            return self._site_choice_redirect(request, site)

        if self._wants_phone(request, path):
            response = self._phone_page_response(request)
            if response is not None:
                return response

        # Public site: serve the built SPA index.html if present, else the holding page.
        return self._public_page_response(path)

    # ── The phone site ────────────────────────────────────────────────────────

    def _site_choice_redirect(self, request, site: str):
        query = request.GET.copy()
        query.pop('site', None)
        key = (query.pop('k', None) or [''])[-1]
        target = request.path + (f'?{query.urlencode()}' if query else '')
        response = HttpResponseRedirect(target)
        value = 'classic' if site == 'classic' else (key if _token_ok(key, PREVIEW_LINK_SECONDS) else '')
        if value:  # a bare or made-up ?site=phone changes nothing
            response.set_cookie(SITE_COOKIE, value, max_age=SITE_COOKIE_SECONDS, samesite='Lax',
                                secure=request.is_secure(), httponly=True)
        response['Cache-Control'] = 'no-store'
        return response

    def _wants_phone(self, request, path: str) -> bool:
        """The cookie decides when set; else a phone gets the phone site when the switch is on. Owned paths only.
        The switch is read only for a phone with no cookie, so a desktop request never costs a query."""
        if not self.phone_index_path or not OWNED_PATH_RE.match(path):
            return False
        choice = cookie_choice(request)
        if choice:
            return choice == 'phone'
        return is_phone(request) and phone_site_on()

    def _wants_phone_scan(self, request) -> bool:
        """/scan is the phone scanner: the cookie decides when set; else a phone with BOTH switches on. The switches are
        read only for a phone with no cookie (a desktop never costs a query)."""
        if not self.phone_index_path:
            return False
        choice = cookie_choice(request)
        if choice:
            return choice == 'phone'
        return is_phone(request) and phone_site_on() and phone_scan_on()

    def _phone_page_response(self, request):
        if self._phone_html is None:
            try:
                with open(self.phone_index_path, encoding='utf-8') as fh:
                    self._phone_html = fh.read()
            except OSError:
                self._phone_html = ''
        if not self._phone_html:
            return None
        html = self._phone_html
        if _BOOT_MARKER in html:
            html = html.replace(_BOOT_MARKER, boot_script(scan=self._wants_phone_scan(request)), 1)
        response = HttpResponse(html)
        # The HTML names the hashed files of this release: always ask again, so a deploy is seen on the next visit.
        response['Cache-Control'] = 'no-cache'
        response['Vary'] = 'User-Agent, Sec-CH-UA-Mobile, Cookie'
        return response

    def _shell_html(self, path: str) -> str:
        if path == '/':
            return self._home_shell_html()
        return self._hold_shell_html(path)

    def _hold_shell_html(self, path: str) -> str:
        """Stamp rail/headline/deadline/code into the SPA shell for /hold/*."""
        match = _HOLD_PATH_RE.match(path or '')
        if not match:
            return ''
        token = match.group('token')
        try:
            from apps.webstore.models import Reservation
            from apps.webstore.services.hold_status import customer_view

            reservation = (
                Reservation.objects
                .select_related('listing')
                .prefetch_related('events')
                .filter(status_token=token)
                .first()
            )
            if reservation is None:
                return ''
            view = customer_view(reservation)
            return render_to_string('public/hold_shell.html', {
                'show_rail': view.get('stage', 0) > 0,
                'stages': view.get('stages') or [],
                'headline': view.get('headline') or '',
                'customer_status': view.get('customer_status') or '',
                'expires_label': view.get('expires_label') or '',
                'expires_secondary': view.get('expires_secondary') or '',
                'pickup_code': view.get('pickup_code') or '',
                'next_step': view.get('next_step') or '',
            })
        except Exception:
            return ''

    def _home_shell_html(self) -> str:
        """Stamp hero + arrivals into the SPA shell for `/`."""
        global _home_shell_cache
        now = time.monotonic()
        if _home_shell_cache is not None:
            html, expires_at = _home_shell_cache
            if now < expires_at:
                return html
        try:
            html = self._build_home_shell_html()
        except Exception:
            html = ''
        _home_shell_cache = (html, now + _HOME_SHELL_TTL_SECONDS)
        return html

    def _build_home_shell_html(self) -> str:
        from django.db.models import Exists, F, OuterRef

        from apps.webstore.models import WebListing, WebListingImage
        from apps.webstore.services.feature import online_sales_enabled

        online = online_sales_enabled()

        def _intro_only() -> str:
            return render_to_string('public/home_shell.html', {
                'show_featured': False,
                'online_enabled': online,
                'items': [],
            })

        if not online:
            return _intro_only()

        has_image = Exists(
            WebListingImage.objects.filter(listing_id=OuterRef('pk')),
        )
        # Mirrors the client fetch: sort=featured, available only, photos required.
        listings = list(
            WebListing.objects
            .filter(status='published', on_hand__gt=F('reserved'))
            .annotate(has_image=has_image)
            .filter(has_image=True)
            .prefetch_related('images')
            .order_by('-featured', '-created_at')[:HOME_FEATURED_SHOWN]
        )

        items = []
        for listing in listings:
            images = list(listing.images.all()[:1])
            if not images:
                continue
            image = images[0]
            items.append({
                'slug': listing.slug,
                'title': listing.title,
                'image_url': f'/api/webstore/images/{image.id}/',
                'price_label': _format_money(listing.price),
            })

        if len(items) < HOME_FEATURED_MIN:
            return _intro_only()

        return render_to_string('public/home_shell.html', {
            'show_featured': True,
            'online_enabled': True,
            'items': items,
        })

    def _public_page_response(self, path: str = '/'):
        if self.index_path:
            if self._index_html is None:
                try:
                    with open(self.index_path, encoding='utf-8') as fh:
                        self._index_html = fh.read()
                except OSError:
                    self._index_html = ''
            if self._index_html:
                html = self._index_html
                if _HOLD_SHELL_MARKER in html:
                    shell = self._shell_html(path)
                    html = html.replace(_HOLD_SHELL_MARKER, shell, 1)
                return HttpResponse(html)
        # No public build (e.g. local dev): fall back to the holding page.
        return HttpResponse(render_to_string(_HOLDING_TEMPLATE))


def _format_money(value) -> str:
    try:
        amount = Decimal(value)
    except Exception:
        return '$0'
    quantized = amount.quantize(Decimal('0.01'))
    if quantized == quantized.to_integral():
        return f'${int(quantized)}'
    return f'${quantized:.2f}'


class AIUsageActorMiddleware:
    """Start and end every request with no AI user, so a reused worker thread never charges the last person.

    The JWT check sets the user once it knows them (``ai_usage_log.set_request_user``); AI calls made while
    serving the request are then recorded against that login on the Owner page's AI spend.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from apps.core.services.ai_usage_log import clear_request_user

        clear_request_user()
        try:
            return self.get_response(request)
        finally:
            clear_request_user()
