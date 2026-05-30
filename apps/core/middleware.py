"""Host-based routing: public storefront vs. staff dashboard.

`ecothrift.us`, `www.ecothrift.us`, and `dash.ecothrift.us` all resolve to the
same Heroku app. The staff dashboard SPA must only answer on the dashboard host;
the public hostnames get the public site (a holding page for now — Phase 0 of the
``public_website`` initiative). A single canonical public host is enforced with a
301 redirect from the other (e.g. ``www`` -> apex).

Activated only when ``settings.PUBLIC_SITE_HOSTS`` is non-empty, so local dev and
the dashboard host are unaffected.
"""
from __future__ import annotations

from django.conf import settings
from django.http import HttpResponse, HttpResponsePermanentRedirect
from django.template.loader import render_to_string

# Paths that must keep working on a public host (shared API, assets, admin, media).
_PASSTHROUGH_PREFIXES = ('/api/', '/static/', '/assets/', '/media/', '/db-admin/')

# Exact paths served by Django views on the public host (SEO endpoints).
_PASSTHROUGH_PATHS = ('/robots.txt', '/sitemap.xml')

# Public landing template (Django-rendered; replaced by the public SPA in a later phase).
_HOLDING_TEMPLATE = 'public/holding.html'


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
        return '/blog'
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
        return self._public_page_response()

    def _public_page_response(self):
        if self.index_path:
            if self._index_html is None:
                try:
                    with open(self.index_path, encoding='utf-8') as fh:
                        self._index_html = fh.read()
                except OSError:
                    self._index_html = ''
            if self._index_html:
                return HttpResponse(self._index_html)
        # No public build (e.g. local dev): fall back to the holding page.
        return HttpResponse(render_to_string(_HOLDING_TEMPLATE))
