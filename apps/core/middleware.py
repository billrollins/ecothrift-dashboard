"""Host-based routing: public storefront vs. staff dashboard.

`ecothrift.us`, `www.ecothrift.us`, and `dash.ecothrift.us` all resolve to the
same Heroku app. The staff dashboard SPA must only answer on the dashboard host;
the public hostnames get the public site (a holding page for now - Phase 0 of the
``public_website`` initiative). A single canonical public host is enforced with a
301 redirect from the other (e.g. ``www`` -> apex).

Activated only when ``settings.PUBLIC_SITE_HOSTS`` is non-empty, so local dev and
the dashboard host are unaffected.
"""
from __future__ import annotations

import re
import time
from decimal import Decimal

from django.conf import settings
from django.http import HttpResponse, HttpResponsePermanentRedirect
from django.template.loader import render_to_string

# Paths that must keep working on a public host (shared API, assets, admin, media).
_PASSTHROUGH_PREFIXES = ('/api/', '/static/', '/assets/', '/media/', '/db-admin/')

# Exact paths served by Django views on the public host (SEO endpoints).
_PASSTHROUGH_PATHS = ('/robots.txt', '/sitemap.xml')

# Public landing template (Django-rendered; replaced by the public SPA in a later phase).
_HOLDING_TEMPLATE = 'public/holding.html'
_HOLD_SHELL_MARKER = '<!--PUBLIC_SHELL-->'
_HOLD_PATH_RE = re.compile(r'^/hold/(?P<token>[\w-]+)/?$')

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
        return '/'
    if path == '/pages':
        return '/'
    if path.startswith('/pages/'):
        slug = path[len('/pages/'):].strip('/').lower()
        if slug in ('visit', 'visit-us', 'location', 'hours', 'contact', 'contact-us'):
            return '/visit'
        if slug in ('sell', 'sell-with-us', 'consign', 'consignment'):
            return '/sell'
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

    def __call__(self, request):
        if self.public_hosts:
            try:
                host = request.get_host().split(':')[0].lower()
            except Exception:  # pragma: no cover - get_host validates against ALLOWED_HOSTS
                host = ''
            if host in self.public_hosts:
                response = self._handle_public(request, host)
                if response is not None:
                    return response
        return self.get_response(request)

    def _handle_public(self, request, host):
        path = request.path

        # Keep the shared API, assets, admin, and SEO endpoints working on the public host.
        if path.startswith(_PASSTHROUGH_PREFIXES) or path in _PASSTHROUGH_PATHS:
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

        # Public site: serve the built SPA index.html if present, else the holding page.
        return self._public_page_response(path)

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
