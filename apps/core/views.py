from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsSuperAdmin, IsTeamMember
from apps.accounts.services.access import admin_or, owner_or
from .models import (
    WorkLocation, AppSetting, AppSettingHistory, S3File, PrintServerRelease,
    AiAction, AiModel, AiTier,
)
from .serializers import (
    WorkLocationSerializer, AppSettingSerializer,
    S3FileSerializer, PrintServerReleaseSerializer,
    AiActionSerializer, AiModelSerializer, AiTierSerializer,
)
from .services.ai_catalog import action_choices


class WorkLocationViewSet(viewsets.ModelViewSet):
    queryset = WorkLocation.objects.all()
    serializer_class = WorkLocationSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    search_fields = ['name']


class AppSettingViewSet(viewsets.ModelViewSet):
    queryset = AppSetting.objects.all()
    serializer_class = AppSettingSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    pagination_class = None
    lookup_field = 'key'
    # DefaultRouter uses [^/.]+ which 404s dotted keys like online_sales.hours.
    lookup_value_regex = r'[^/]+'

    # The Thrift+ switch and its settings: the owner's call alone (2026-10-07).
    SUPERUSER_PREFIXES = ('thrift_plus_',)
    # Staff purchases (payroll deduction, staff Thrift+): the owner (Admin) only, though managers edit the rest.
    # Idle sign-out hours (auth.idle_hours, house standard D16) and the pay-level ranges (hr.pay_levels): the owner's call too.
    # The register's sale names, percents and the line-sale switch too (critic review REG-21), and the Owner page
    # Scorecard targets (owner.scorecard_targets, 2026-10-21), and the register's money limits (the discount cap and the
    # drawer close note, 2026-10-22). dashboard.focus_numbers is retired (2026-10-22: Today's focus left the Dashboard;
    # nothing reads the row, and it stays the owner's so nobody edits a dead setting).
    ADMIN_ONLY = {
        'pos.staff_purchases', 'auth.idle_hours', 'hr.pay_levels', 'pos.labor_day_sale',
        'pos.store_sale_name', 'pos.store_sale_percent', 'pos.line_sale_on', 'pos.line_sale_name', 'pos.line_sale_percent',
        'owner.scorecard_targets', 'dashboard.focus_numbers',
        'pos.discount_cap_percent', 'pos.close_note_over',
        # The recovery estimate switch (inventory review phase 4, 2026-10-28): the owner turns it on.
        'inventory_recovery_estimate',
        # Who is texted on every new incident report (#183, "Report it to Bill").
        'hr.incident_alerts_to',
    }

    def _owner_only(self, key: str) -> None:
        user = self.request.user
        if key.startswith(self.SUPERUSER_PREFIXES) and not owner_or(user, 'settings:owner'):
            raise PermissionDenied('Only the Super User changes Thrift+ settings.')
        if key in self.ADMIN_ONLY and not admin_or(user, 'settings:owner'):
            raise PermissionDenied('Only the owner (Admin) changes this setting.')

    def perform_create(self, serializer):
        self._owner_only(str(serializer.validated_data.get('key') or ''))
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        self._owner_only(instance.key)
        instance.delete()

    def perform_update(self, serializer):
        instance = self.get_object()
        self._owner_only(instance.key)
        old = instance.value
        saved = serializer.save(updated_by=self.request.user)
        if old != saved.value:
            AppSettingHistory.objects.create(
                key=saved.key,
                old_value=old,
                new_value=saved.value,
                changed_by=self.request.user,
            )

    @action(detail=False, methods=['get'])
    def history(self, request):
        """Settings page (2026-10-07): ``?key=`` one setting's changes, newest first (Undo puts back ``old_value``).
        Without a key: the latest changes to any setting."""
        qs = AppSettingHistory.objects.select_related('changed_by').order_by('-changed_at', '-pk')
        key = request.query_params.get('key')
        if key:
            qs = qs.filter(key=key)
        return Response([
            {'key': h.key, 'old_value': h.old_value, 'new_value': h.new_value,
             'changed_by': h.changed_by.full_name if h.changed_by_id else '', 'changed_at': h.changed_at}
            for h in qs[:20 if key else 50]
        ])


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
@permission_classes([IsAuthenticated, IsTeamMember])
def print_server_version(request):
    """Return the latest print server release info."""
    release = PrintServerRelease.objects.filter(is_current=True).select_related('s3_file').first()
    if not release:
        return Response({'available': False})

    data = PrintServerReleaseSerializer(release).data
    data['available'] = True
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTeamMember])
def print_server_releases(request):
    """List all print server releases."""
    releases = PrintServerRelease.objects.select_related('s3_file').all()
    serializer = PrintServerReleaseSerializer(releases, many=True)
    return Response(serializer.data)


LABEL_SIZE_KEY = 'printing.label_size'
LABEL_SIZE_DEFAULT = {'w_in': 1.5, 'h_in': 1.0, 'dpi': 203}
PRICE_TAG_IN_DASH_KEY = 'printing.price_tag_in_dash'
# Settings > Printing, "Price tag design" (owner 2026-10-28): the green price tag Dash draws. Store-wide, default Classic
# until the 2.25 x 1.25 labels arrive; it only matters while price_tag_in_dash is on.
PRICE_TAG_DESIGN_KEY = 'printing.price_tag_design'
PRICE_TAG_DESIGNS = ('classic', 'perks')


def clean_label_size(raw):
    """A label size Dash can print, or None: sides 0.75 to 4 in, the printer at 203 or 300 dpi."""
    if not isinstance(raw, dict):
        return None
    try:
        w = round(float(raw.get('w_in')), 2)
        h = round(float(raw.get('h_in')), 2)
        dpi = int(raw.get('dpi', 203))
    except (TypeError, ValueError):
        return None
    if not (0.75 <= w <= 4 and 0.75 <= h <= 4) or dpi not in (203, 300):
        return None
    return {'w_in': w, 'h_in': h, 'dpi': dpi}


def _save_setting(key, value, description, user):
    """Create or change one AppSetting, keeping the change in AppSettingHistory."""
    row, created = AppSetting.objects.get_or_create(
        key=key, defaults={'value': value, 'description': description, 'updated_by': user},
    )
    if not created and row.value != value:
        AppSettingHistory.objects.create(key=row.key, old_value=row.value, new_value=value, changed_by=user)
        row.value = value
        row.updated_by = user
        row.save(update_fields=['value', 'updated_by', 'updated_at'])


def price_tag_in_dash() -> bool:
    """The safety switch (Mainline, 2026-10-28): price tags drawn in Dash only once the owner turns it on."""
    row = AppSetting.objects.filter(key=PRICE_TAG_IN_DASH_KEY).first()
    return bool(row and row.value is True)


def price_tag_design() -> str:
    """``classic`` (the side-stripe tag) or ``perks`` (Thrift+ Perks: QR link, perks box, returns strip)."""
    row = AppSetting.objects.filter(key=PRICE_TAG_DESIGN_KEY).first()
    return row.value if row and row.value in PRICE_TAG_DESIGNS else 'classic'


def _printing_payload(value) -> dict:
    return {'value': value, 'price_tag_in_dash': price_tag_in_dash(), 'price_tag_design': price_tag_design()}


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, IsTeamMember])
def label_size(request):
    """The store-wide label size (Settings > Printing, owner 2026-10-28): every tag Dash draws uses it, unless a
    station overrides it in its own browser. Anyone who prints reads it; managers and the owner change it.
    ``price_tag_in_dash`` rides along: off (the default), price tags still come from the print server's own drawing."""
    if request.method == 'PUT':
        if not IsManagerOrAdmin().has_permission(request, None):
            raise PermissionDenied('Only a manager changes the store label size.')
        value = clean_label_size(request.data)
        if value is None:
            return Response({'detail': 'Sides from 0.75 to 4 inches, printer 203 or 300 dpi.'},
                            status=status.HTTP_400_BAD_REQUEST)
        _save_setting(LABEL_SIZE_KEY, value, 'Label size every tag prints at (Settings > Printing).', request.user)
        return Response(_printing_payload(value))
    row = AppSetting.objects.filter(key=LABEL_SIZE_KEY).first()
    return Response(_printing_payload((clean_label_size(row.value) if row else None) or LABEL_SIZE_DEFAULT))


@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def price_tag_switch(request):
    """Turn the new price tag drawing on or off for the whole store (``{"on": true}``)."""
    on = request.data.get('on')
    if not isinstance(on, bool):
        return Response({'detail': 'Send {"on": true} or {"on": false}.'}, status=status.HTTP_400_BAD_REQUEST)
    _save_setting(PRICE_TAG_IN_DASH_KEY, on, 'Price tags drawn in Dash at the label size (off: the print server draws them).',
                  request.user)
    return Response({'price_tag_in_dash': on})


@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def price_tag_design_switch(request):
    """Pick the price tag design for the whole store (``{"design": "classic" | "perks"}``)."""
    design = request.data.get('design')
    if design not in PRICE_TAG_DESIGNS:
        return Response({'detail': 'Send {"design": "classic"} or {"design": "perks"}.'}, status=status.HTTP_400_BAD_REQUEST)
    _save_setting(PRICE_TAG_DESIGN_KEY, design, 'Price tag design Dash draws: classic or perks (Settings > Printing).',
                  request.user)
    return Response({'price_tag_design': design})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTeamMember])
def tag_marks(request):
    """The Thrift+ Perks tag's strip per item (rulebook A1): ``{"items": [{"sku", "price"}]}`` gives
    ``{"marks": {SKU: {"as_is": bool, "why": str}}}``, by the scanner's own rule at the price the tag prints."""
    from apps.thriftplus.services.scanner import tag_marks as marks_for

    rows = request.data.get('items')
    if not isinstance(rows, list):
        return Response({'detail': 'Send {"items": [{"sku": "ITM0000001", "price": "12.00"}]}.'},
                        status=status.HTTP_400_BAD_REQUEST)
    return Response({'marks': marks_for([r for r in rows if isinstance(r, dict)])})


def i_link(request, code: str):
    """ecothrift.us/i/<code> (any case): a 7-character code is an interview short link (texts, 2026-10-12); anything
    else is a price tag's QR (``HTTPS://ECOTHRIFT.US/I/<SKU>``, 2026-10-28), which opens the item in the Thrift+ app."""
    from django.http import HttpResponseRedirect

    from apps.hiring.interviews import SHORT_LENGTH
    from apps.hiring.public_views import short_link

    if len(code) == SHORT_LENGTH:
        return short_link(request, code)
    return HttpResponseRedirect(f'/scan?tag={code.upper()}')


def receipt_claim_link(request, token: str):
    """ECOTHRIFT.US/J/<TOKEN> (any case): a non-member receipt's QR (owner 2026-11-20, #204, rulebook B15). Opens the
    app's Join with the token; once they finish joining the app claims the trip's ThriftBucks
    (``thriftplus.services.receipt_claim``). The token is checked there, not here."""
    from django.http import HttpResponseRedirect

    return HttpResponseRedirect(f'/scan?view=join&claim={token.upper()}')


@api_view(['GET'])
@permission_classes([AllowAny])
def print_server_version_public(request):
    """Public (no auth) endpoint - returns current print server version for the /manage page."""
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
_SITEMAP_MARKETING_PATHS = ('/', '/shop', '/visit', '/blog', '/privacy', '/terms')  # /sell hidden until consignment (owner 10-15)


def _public_base_url() -> str:
    host = (getattr(settings, 'PUBLIC_SITE_CANONICAL_HOST', '') or '').strip().lower()
    return f'https://{host}' if host else 'https://ecothrift.us'


def _careers_paths() -> list[str]:
    """/careers and each open role, only while the careers page is public."""
    from apps.hiring.careers import is_public
    from apps.hiring.models import Job

    if not is_public():
        return []
    slugs = Job.objects.filter(status=Job.STATUS_OPEN).order_by('sort_order', 'slug').values_list('slug', flat=True)
    return ['/careers'] + [f'/careers/{slug}' for slug in slugs]


def sitemap_xml(request):
    """XML sitemap: marketing pages + live blog posts + every published web listing + open roles."""
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
    paths += _careers_paths()

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




class AiModelViewSet(viewsets.ModelViewSet):
    """Settings > AI model catalog. Super Admin only."""
    queryset = AiModel.objects.prefetch_related('tiers')
    serializer_class = AiModelSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        serializer.save(source=AiModel.SOURCE_MANUAL, status=AiModel.STATUS_ACTIVE)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive: the tiers on it go blank (the page asks for a new pick) and actions that named it follow their
        tier again. Nothing else changes (Dash #195)."""
        row = self.get_object()
        with transaction.atomic():
            row.status = AiModel.STATUS_ARCHIVED
            row.save(update_fields=['status', 'updated_at'])
            tiers = list(AiTier.objects.filter(model=row).values_list('label', flat=True))
            AiTier.objects.filter(model=row).update(model=None, updated_by=request.user)
            cleared = AiAction.objects.filter(model=row).update(model=None, updated_by=request.user)
        return Response({**AiModelSerializer(row).data, 'cleared_actions': cleared, 'cleared_tiers': tiers})

    @action(detail=True, methods=['post'])
    def unarchive(self, request, pk=None):
        row = self.get_object()
        row.status = AiModel.STATUS_ACTIVE
        row.save(update_fields=['status', 'updated_at'])
        return Response(AiModelSerializer(row).data)

    @action(detail=False, methods=['get', 'post'])
    def refresh(self, request):
        """POST: the Refresh button (provider lists, Artificial Analysis and the three-model price triage, all at
        once; seconds). GET: the last Refresh's summary."""
        from .services import ai_refresh

        if request.method == 'POST':
            return Response(ai_refresh.refresh(request.user))
        return Response(ai_refresh.last())

    @action(detail=True, methods=['post'], url_path='accept-price')
    def accept_price(self, request, pk=None):
        """Save the price a Refresh flagged on this model (logged with who and when)."""
        from .services import ai_refresh

        row = self.get_object()
        try:
            ai_refresh.accept_flag(row, request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AiModelSerializer(row).data)

    @action(detail=True, methods=['post'], url_path='dismiss-price')
    def dismiss_price(self, request, pk=None):
        """Keep the saved price and clear the flag."""
        from .services import ai_refresh

        row = self.get_object()
        ai_refresh.dismiss_flag(row)
        return Response(AiModelSerializer(row).data)

    def perform_update(self, serializer):
        """A price typed in by hand is logged like one saved from a Refresh, and its source becomes "typed"."""
        from .services import ai_refresh

        before = (serializer.instance.input_price, serializer.instance.output_price)
        before_image = serializer.instance.image_price
        row = serializer.save()
        if row.image_price != before_image:
            row.price_source, row.price_checked_at = 'typed', timezone.now()
            row.price_flag, row.flag_input, row.flag_output = '', None, None
            row.save(update_fields=['price_source', 'price_checked_at', 'price_flag', 'flag_input', 'flag_output'])
            ai_refresh.log_change([{
                'slug': row.slug, 'old_input': ai_refresh._text(before_image), 'old_output': None,
                'new_input': ai_refresh._text(row.image_price), 'new_output': None,
            }], self.request.user, 'typed in (per image)')
        if (row.input_price, row.output_price) != before:
            row.price_source, row.price_checked_at = 'typed', timezone.now()
            row.price_flag, row.flag_input, row.flag_output = '', None, None
            row.save(update_fields=['price_source', 'price_checked_at', 'price_flag', 'flag_input', 'flag_output'])
            ai_refresh.log_change([{
                'slug': row.slug, 'old_input': ai_refresh._text(before[0]), 'old_output': ai_refresh._text(before[1]),
                'new_input': ai_refresh._text(row.input_price), 'new_output': ai_refresh._text(row.output_price),
            }], self.request.user, 'typed in')

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Settings > AI "Test": one message to this model; the answer, the time, and the cost."""
        import time
        from decimal import Decimal

        from apps.core.services.ai_usage_log import model_prices
        from apps.core.services.llm_router import llm_complete

        row = self.get_object()
        message = str(request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Type a message.'}, status=status.HTTP_400_BAD_REQUEST)
        started = time.monotonic()
        try:
            # 25 s: the page's Try sends one request per model side by side, each inside Heroku's 30 s.
            result = llm_complete(model_id=row.slug, user=message[:4000], max_tokens=1000, timeout=25, max_retries=0,
                                  log_source='settings_ai_test', log_detail=row.slug)
        except Exception as exc:
            return Response({'detail': f'The model call failed: {str(exc)[:300]}'}, status=status.HTTP_502_BAD_GATEWAY)
        seconds = round(time.monotonic() - started, 2)
        prices = model_prices(row.slug)
        million = Decimal('1000000')
        cost_in = (Decimal(result.input_tokens) * prices[0] / million).quantize(Decimal('0.000001')) if prices else None
        cost_out = (Decimal(result.output_tokens) * prices[1] / million).quantize(Decimal('0.000001')) if prices else None
        return Response({
            'text': result.text, 'model_used': result.model_used, 'seconds': seconds,
            'input_tokens': result.input_tokens, 'output_tokens': result.output_tokens,
            'input_cost': str(cost_in) if cost_in is not None else None,
            'output_cost': str(cost_out) if cost_out is not None else None,
        })


    @action(detail=True, methods=['post'], url_path='test-image')
    def test_image(self, request, pk=None):
        """Settings > AI "Try" for an image model: one picture from the prompt, its time and its per-image cost."""
        from .services.image_router import ImageError, generate_image

        row = self.get_object()
        prompt = str(request.data.get('message') or '').strip()
        if not prompt:
            return Response({'detail': 'Type what to draw.'}, status=status.HTTP_400_BAD_REQUEST)
        if row.modality != AiModel.MODALITY_IMAGE:
            return Response({'detail': 'That is not an image model.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            out = generate_image(row.slug, prompt[:2000], timeout=27, log_source='settings_ai_test', log_detail=row.slug)
        except ImageError as exc:
            return Response({'detail': str(exc)[:300]}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'image': f"data:{out['content_type']};base64,{out['b64']}", 'model_used': out['model_used'],
                         'seconds': out['seconds'], 'cost': out['cost']})


class AiTierViewSet(viewsets.ModelViewSet):
    """Settings > AI tier map (Dash #195): Fast, Standard, Best and Image, each a model and an effort."""
    queryset = AiTier.objects.select_related('model')
    serializer_class = AiTierSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = None
    lookup_field = 'key'
    http_method_names = ['get', 'patch', 'head', 'options']

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class AiActionViewSet(viewsets.ModelViewSet):
    """Settings > AI actions: Workspace > Page > Function, each on a tier. Super Admin writes; Manager+ reads
    choices."""
    queryset = AiAction.objects.select_related('model', 'updated_by')
    serializer_class = AiActionSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = None
    lookup_field = 'purpose'
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def list(self, request, *args, **kwargs):
        from .services.ai_actions import rows

        return Response(rows())

    def _row(self, purpose):
        from .services.ai_actions import rows

        return next(r for r in rows() if r['purpose'] == purpose)

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(self._row(self.get_object().purpose))

    def perform_update(self, serializer):
        """A new tier answers the review's proposal for this action, so the proposal clears."""
        extra = {}
        if 'tier' in serializer.validated_data:
            extra = {'suggested_tier': '', 'suggested_reason': ''}
        serializer.save(updated_by=self.request.user, **extra)

    @action(detail=True, methods=['post'], url_path='dismiss-suggestion')
    def dismiss_suggestion(self, request, purpose=None):
        row = self.get_object()
        row.suggested_tier, row.suggested_reason = '', ''
        row.save(update_fields=['suggested_tier', 'suggested_reason', 'updated_at'])
        return Response(self._row(row.purpose))

    @action(detail=False, methods=['get', 'post'])
    def review(self, request):
        """POST starts the AI tier review (a thread); GET is its state. Proposals land on the actions."""
        from .services import ai_actions

        if request.method == 'POST':
            return Response(ai_actions.start_review(request.user))
        return Response(ai_actions.review_state())

    @action(
        detail=True,
        methods=['get'],
        url_path='choices',
        permission_classes=[IsAuthenticated, IsManagerOrAdmin],
    )
    def choices(self, request, purpose=None):
        return Response(action_choices(self.get_object()))


class ApprovalRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Superuser → Requests. Routine data work staged in production (``stage_request``) waits here
    for the owner: approve starts the apply in the background, reject closes it, undo reverses an
    applied one, and resume restarts a failed or stalled one from its cursor.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = None

    def get_queryset(self):
        from .models import ApprovalRequest

        qs = ApprovalRequest.objects.select_related('decided_by').all()
        if self.action != 'list':
            return qs  # a sliced queryset would make every detail action a 404
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status__in=status_filter.split(','))
        return qs[:200]

    def get_serializer_class(self):
        from .serializers import ApprovalRequestSerializer

        return ApprovalRequestSerializer

    def list(self, request, *args, **kwargs):
        from .services.approval_requests import resume_stalled

        # Opening the page restarts any apply a deploy or worker recycle cut short.
        resume_stalled()
        return super().list(request, *args, **kwargs)

    def _act(self, request, fn, *args):
        from .services.approval_requests import RequestError

        obj = self.get_object()
        try:
            with transaction.atomic():
                fn(obj, *args)
        except (RequestError, ValueError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        obj.refresh_from_db()
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        from .services import approval_requests

        return self._act(request, approval_requests.approve, request.user, str(request.data.get('note') or ''))

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        from .services import approval_requests

        return self._act(request, approval_requests.reject, request.user, str(request.data.get('note') or ''))

    @action(detail=True, methods=['post'])
    def undo(self, request, pk=None):
        from .services import approval_requests

        return self._act(request, approval_requests.undo, request.user)

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        from .services import approval_requests

        return self._act(request, approval_requests.resume)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def owner_scorecard(request):
    """Owner page: Net item sales, buying % of processing, processing % of sales, labor, Thrift+ owed."""
    from .services.owner_page import scorecard

    return Response(scorecard())


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def owner_needs_you(request):
    """Owner page: what is waiting on the owner, with counts and links."""
    from .services.owner_page import needs_you

    return Response(needs_you())


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def owner_testing(request):
    """Owner page, Testing: what the owner's linked devices see on the website, for 24 hours.

    GET: ``{state: {mobile, desktop, until}, options, live, link, hours}``. POST ``{mobile, desktop}`` ('' = Live)
    sets the picks for 24 hours from now; ``{end: true}`` ends testing at once."""
    from django.conf import settings as dj_settings

    from apps.core import middleware as mw
    from apps.core.services import site_testing

    if request.method == 'POST':
        if request.data.get('end'):
            site_testing.end(user=request.user)
        else:
            now = site_testing.state(fresh=True)
            site_testing.save(str(request.data.get('mobile', now['mobile']) or ''),
                              str(request.data.get('desktop', now['desktop']) or ''), user=request.user)
    host = (getattr(dj_settings, 'PUBLIC_SITE_CANONICAL_HOST', '') or 'ecothrift.us').strip()
    base = (getattr(dj_settings, 'ONLINE_SALES_PUBLIC_BASE_URL', '') or f'https://{host}').rstrip('/')
    site = 'the new phone site' if mw._read_switch(mw.PHONE_SETTING_KEY) else 'the old site'
    scanner = 'the new scanner' if (mw._read_switch(mw.PHONE_SETTING_KEY) and mw._read_switch(mw.PHONE_SCAN_SETTING_KEY)) \
        else 'the old scanner'
    return Response({
        'state': site_testing.state(fresh=True),
        'options': site_testing.options(),
        'live': {'mobile': f'{site}, {scanner}'.capitalize(), 'desktop': 'The desktop site'},
        'link': f'{base}/?test={site_testing.link_token()}',
        'unlink': f'{base}/?test=off',
        'hours': site_testing.HOURS,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def owner_social(request):
    """Owner page: the Social card (this week's posts and numbers, spend, what moves the needle)."""
    from apps.marketing.services.numbers import weekly_card

    return Response(weekly_card())


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def owner_ai_spend(request):
    """Owner page: AI spend for ``?range=today|week|month`` (default today), by feature and by who."""
    from .services.owner_page import ai_spend

    return Response(ai_spend(request.query_params.get('range') or 'today'))


# ── Error alerts (critic review 2026-10-21, point 8) ─────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def app_errors(request):
    """The owner's error alerts: counts and the latest server 500s and screen crashes. ``?limit=`` (default 10)."""
    from .services.app_errors import summary

    try:
        limit = max(1, min(int(request.query_params.get('limit') or 10), 100))
    except ValueError:
        limit = 10
    return Response(summary(limit=limit))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def app_errors_seen(request):
    """Mark every error seen (the open count goes to 0)."""
    from .services.app_errors import mark_seen, summary

    mark_seen()
    return Response(summary())


class _AppErrorReportThrottle(SimpleRateThrottle):
    """Per signed-in user, or per address before sign-in."""

    scope = 'app_error_report'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        ident = user.pk if user and user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([_AppErrorReportThrottle])
def app_error_report(request):
    """A screen crash from Dash's error screen. Anyone may send one (the crash can come before sign-in); throttled."""
    from .services.app_errors import record_screen_error

    record_screen_error(request, request.data if isinstance(request.data, dict) else {})
    return Response(status=status.HTTP_204_NO_CONTENT)

