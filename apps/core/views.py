from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from .models import WorkLocation, AppSetting, S3File, PrintServerRelease
from .serializers import (
    WorkLocationSerializer, AppSettingSerializer,
    S3FileSerializer, PrintServerReleaseSerializer,
)


class WorkLocationViewSet(viewsets.ModelViewSet):
    queryset = WorkLocation.objects.all()
    serializer_class = WorkLocationSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    search_fields = ['name']


class AppSettingViewSet(viewsets.ModelViewSet):
    queryset = AppSetting.objects.all()
    serializer_class = AppSettingSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    lookup_field = 'key'

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class S3FileViewSet(viewsets.ModelViewSet):
    queryset = S3File.objects.all()
    serializer_class = S3FileSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def app_version(request):
    """Return the application version from repo root `.version` (single line, e.g. v2.0.0)."""
    version_path = Path(settings.BASE_DIR) / '.version'
    try:
        raw = version_path.read_text(encoding='utf-8').strip()
        if raw.lower().startswith('v'):
            raw = raw[1:].strip()
        version = raw if raw else 'unknown'
    except (FileNotFoundError, OSError):
        version = 'unknown'
    return Response(
        {
            'version': version,
            'build_date': None,
            'description': '',
        }
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def print_server_version(request):
    """Return the latest print server release info."""
    release = PrintServerRelease.objects.filter(is_current=True).select_related('s3_file').first()
    if not release:
        return Response({'available': False})

    data = PrintServerReleaseSerializer(release).data
    data['available'] = True
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def print_server_releases(request):
    """List all print server releases."""
    releases = PrintServerRelease.objects.select_related('s3_file').all()
    serializer = PrintServerReleaseSerializer(releases, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def print_server_version_public(request):
    """Public (no auth) endpoint — returns current print server version for the /manage page."""
    release = PrintServerRelease.objects.filter(is_current=True).select_related('s3_file').first()
    if not release:
        return Response({'available': False})
    data = PrintServerReleaseSerializer(release).data
    data['available'] = True
    # Flat download_url so the print server /manage page can access it directly
    data['download_url'] = release.s3_file.url if release.s3_file else None
    return Response(data)


_DEV_LOG_AREAS = (
    'LOG_ADD_ITEM',
    'LOG_ADD_ITEM_FORM',
    'LOG_ADD_ITEM_AI',
)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def dev_log_config(request):
    """Resolved targets per area from `.ai/debug/log.config` (DEBUG only)."""
    if not settings.DEBUG:
        return Response({'enabled': False, 'areas': {}})
    from apps.core.log_config import resolve

    return Response({
        'enabled': True,
        'areas': {k: list(resolve(k)) for k in _DEV_LOG_AREAS},
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def dev_log_line(request):
    """Append one line to `.ai/debug/debug.log` when `area` resolves with `file` target (DEBUG only)."""
    if not settings.DEBUG:
        return Response({'ok': False}, status=status.HTTP_404_NOT_FOUND)
    from apps.core.log_config import resolve

    area = (request.data.get('area') or '').strip()
    message = (request.data.get('message') or '').strip()
    if area not in _DEV_LOG_AREAS:
        return Response({'ok': False, 'detail': 'unknown area'}, status=status.HTTP_400_BAD_REQUEST)
    if 'file' not in resolve(area):
        return Response({'ok': False, 'detail': 'file target not enabled for area'}, status=status.HTTP_400_BAD_REQUEST)
    if not message:
        return Response({'ok': False, 'detail': 'message required'}, status=status.HTTP_400_BAD_REQUEST)

    log_path = Path(settings.BASE_DIR) / '.ai' / 'debug' / 'debug.log'
    log_path.parent.mkdir(parents=True, exist_ok=True)
    ts = timezone.now().isoformat()
    line = f'[{ts}] {area} client: {message}\n'
    with log_path.open('a', encoding='utf-8') as fh:
        fh.write(line)
    return Response({'ok': True})


# ── Public storefront SEO (served on the public host; see PublicSiteMiddleware) ──

# Static marketing routes for the public site. Blog post URLs are pulled from the
# database (BlogPost.objects.live()) in sitemap_xml below.
_SITEMAP_MARKETING_PATHS = ('/', '/shop', '/visit', '/sell', '/blog')


def _public_base_url() -> str:
    host = (getattr(settings, 'PUBLIC_SITE_CANONICAL_HOST', '') or '').strip().lower()
    return f'https://{host}' if host else 'https://ecothrift.us'


def sitemap_xml(request):
    """XML sitemap: marketing pages + live blog posts + every published web listing."""
    from apps.blog.models import BlogPost
    from apps.webstore.models import WebListing

    base = _public_base_url()
    paths = list(_SITEMAP_MARKETING_PATHS)
    paths += [
        f'/blog/{slug}'
        for slug in BlogPost.objects.live().order_by('slug').values_list('slug', flat=True)
    ]
    paths += [
        f'/shop/{slug}'
        for slug in WebListing.objects.filter(status='published')
        .order_by('slug')
        .values_list('slug', flat=True)
    ]

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    lines += [f'  <url><loc>{escape(base + p)}</loc></url>' for p in paths]
    lines.append('</urlset>')
    return HttpResponse('\n'.join(lines), content_type='application/xml')


def robots_txt(request):
    """robots.txt: index public pages, keep checkout/order/API/admin out, link the sitemap."""
    base = _public_base_url()
    body = '\n'.join([
        'User-agent: *',
        'Allow: /',
        'Disallow: /checkout',
        'Disallow: /order/',
        'Disallow: /api/',
        'Disallow: /db-admin/',
        '',
        f'Sitemap: {base}/sitemap.xml',
        '',
    ])
    return HttpResponse(body, content_type='text/plain')


