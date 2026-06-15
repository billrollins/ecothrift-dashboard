import csv
import hashlib
import io
import json
import re
import time
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.db.models import (
    Avg,
    Case,
    CharField,
    Count,
    DecimalField,
    F,
    Max,
    Prefetch,
    Q,
    Subquery,
    OuterRef,
    Sum,
    Value,
    When,
    FloatField,
    IntegerField,
    DateTimeField,
    ExpressionWrapper,
)
from django.db.models.functions import Extract, Cast, Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter, SearchFilter

from ecothrift.pagination import ItemListPagination

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.canonical_categories import canonical_category_name

from apps.core.ai_config import ai_model
from apps.core.logging import get_logger
from apps.core.models import AppSetting, S3File
from apps.core.services.ai_usage_log import log_ai_usage
from .constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES
from .formula_engine import evaluate_formula, FormulaError

logger = get_logger(__name__, 'LOG_INVENTORY')
suggest_logger = get_logger(__name__, 'LOG_ADD_ITEM_AI')
cleanup_logger = get_logger(__name__, 'LOG_INVENTORY_AI_CLEANUP')
match_logger = get_logger(__name__, 'LOG_INVENTORY_AI_MATCH')
finalization_logger = get_logger(__name__, 'LOG_INVENTORY_AI_FINALIZATION')


def _validation_error_response_detail(exc):
    detail = getattr(exc, 'detail', None)
    if detail is not None:
        return detail
    if hasattr(exc, 'message_dict'):
        out = {}
        for key, value in exc.message_dict.items():
            if isinstance(value, list) and len(value) == 1:
                out[key] = value[0]
            else:
                out[key] = value
        return out
    if hasattr(exc, 'messages'):
        return exc.messages
    return str(exc)

from .models import (
    Vendor, Category, PurchaseOrder, CSVTemplate, ManifestRow,
    Product, VendorProductRef, BatchGroup, Item, ProcessingBatch,
    ItemHistory, ItemScanHistory,
    PreprocessingRow,
    ProcessingRow,
    Receiving, ReceivingAttachment, ReceivingPallet,
    Dispute,
)
from .preprocessing_summary import (
    completed_step_from_preprocess_status,
    manifest_status_counts_aggregate,
    preprocessing_status_counts_aggregate,
    summarize_preprocessing_rows_aggregate,
)
from apps.inventory.product_identity import identifier_value, merge_identifiers, product_upc
from .layer_helpers import (
    TRIPLE_LAYER_SPECS,
    bulk_clear_preprocess_ai_and_final_layers,
    effective_preprocessing_notes,
    effective_preprocessing_title,
    effective_preprocessing_triple,
    effective_taxonomy_category_for_row,
    snapshot_finalize_from_ai_and_standard,
    preprocessing_row_has_final,
)
from .serializers import (
    VendorSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderListSerializer,
    PreprocessingQueueOrderSerializer,
    PurchaseOrderDetailSerializer,
    PurchaseOrderDetailSurfaceSerializer,
    CategorySerializer, CSVTemplateSerializer, ManifestRowSerializer, ManualReviewRowSerializer,
    PreprocessingReviewRowMinimalSerializer,
    PreprocessingReviewRowSerializer,
    VendorProductRefSerializer, BatchGroupSerializer,
    ProductSerializer, ItemSerializer, ItemPublicSerializer,
    ProcessingBatchSerializer, ItemHistorySerializer,
    ReceivingAttachmentSerializer,
    ReceivingDetailSerializer,
    OrderForReceivingListSerializer,
    ReceivingDraftPatchSerializer,
    DisputeSerializer,
    DisputeCreateSerializer,
    DisputePatchSerializer,
)
from apps.inventory.services.receiving import (
    get_or_create_receiving,
    patch_receiving_draft,
    validate_complete,
)
from apps.inventory.services.manifest_meta import compute_category_count
from .cleanup_condition import normalize_cleanup_condition
from .cleanup_csv_validate import validate_cleanup_row_values
from .prompts import (
    CONDITION_VALUES,
    FEW_SHOT_ADD_ITEM,
    FEW_SHOT_SUGGEST_PRODUCT,
    LISTING_STANDARDS,
    OUTPUT_SCHEMA_HINT,
    PRODUCT_CATALOG_STANDARDS,
    PRODUCT_OUTPUT_SCHEMA_HINT,
)
from .services.ai_cleanup import (
    AiCleanupBatchError,
    apply_cleanup_values_to_staging_row,
    complete_ai_cleanup,
    run_ai_cleanup_batch,
    snapshot_final_for_rows,
    uncleaned_staging_row_ids,
)
from .services.ai_listing_context import retrieve_listing_examples_for_prompt
from apps.inventory.manifest_standard_fields import (
    AI_LOCKED_FIELDS,
    IDENTIFIER_LOOKUP_ORDER,
    OPTIONAL_FLAT_TARGETS,
    all_source_alias_candidates,
    coerce_mapping_target,
    default_formula_mapping_targets_in_order,
    first_identifier_hit,
    manifest_field_metadata_payload,
    prune_empty_bucket_values,
    slugify_formula_search_tags,
    validate_mapping_target,
)


def manifest_standard_flat_columns():
    """Pinned flat field metadata for API responses (see GET manifest-fields)."""
    return manifest_field_metadata_payload()['flat']


MANIFEST_FUNCTION_OPTIONS = (
    {'id': 'trim', 'label': 'Trim'},
    {'id': 'title_case', 'label': 'Title Case'},
    {'id': 'upper', 'label': 'Uppercase'},
    {'id': 'lower', 'label': 'Lowercase'},
    {'id': 'remove_special_chars', 'label': 'Remove Special Characters'},
    {'id': 'replace', 'label': 'Replace Text'},
)


def header_signature(headers):
    return hashlib.md5(','.join(h.strip().lower() for h in headers).encode()).hexdigest()


def _manifest_csv_delimiter(order, content: str) -> str:
    preview = order.manifest_preview or {}
    stored = preview.get('delimiter')
    if stored in ('\t', ','):
        return stored
    head = content[:8192]
    nl = head.find('\n')
    line1 = head[:nl] if nl >= 0 else head
    return '\t' if line1.count('\t') > line1.count(',') else ','


def parse_manifest_file(order):
    if not order.manifest:
        return [], []
    with default_storage.open(order.manifest.key, 'rb') as manifest_file:
        content = manifest_file.read().decode('utf-8-sig', errors='ignore')
    delim = _manifest_csv_delimiter(order, content)
    reader = csv.reader(io.StringIO(content), delimiter=delim)
    headers = next(reader, [])
    rows = []
    for i, row in enumerate(reader, start=1):
        if not any((cell or '').strip() for cell in row):
            continue
        raw = {}
        for idx, header in enumerate(headers):
            raw[header] = row[idx].strip() if idx < len(row) else ''
        rows.append({'row_number': i, 'raw': raw})
    return headers, rows


def raw_rows_from_manifest_preview(order):
    """Bounded raw rows for preview-only paths (no S3). Uses PO manifest_preview sample + manifest_headers."""
    preview = order.manifest_preview or {}
    headers = list(order.manifest_headers or preview.get('headers') or [])
    sample_rows = preview.get('rows') or []
    out = []
    for item in sample_rows:
        if not isinstance(item, dict):
            continue
        rn = item.get('row_number')
        raw = item.get('raw')
        if raw is None:
            raw = {}
        if rn is None:
            continue
        out.append({
            'row_number': int(rn),
            'raw': raw if isinstance(raw, dict) else {},
        })
    return headers, out


def ensure_preprocessing_raw_rows(order):
    """Bulk-create raw PreprocessingRow from S3 manifest when none exist (single full-file parse)."""
    if not order.manifest_id:
        return
    if PreprocessingRow.objects.filter(purchase_order=order).exists():
        return

    headers, rows_data = parse_manifest_file(order)
    if not rows_data:
        return

    sig = header_signature(headers)
    order.manifest_headers = list(headers)
    order.manifest_signature = sig
    order.manifest_row_count = len(rows_data)
    order.save(
        update_fields=[
            'manifest_headers',
            'manifest_signature',
            'manifest_row_count',
            'updated_at',
        ],
    )
    PreprocessingRow.objects.bulk_create(
        [
            PreprocessingRow(
                purchase_order=order,
                row_number=r['row_number'],
                raw_row=r['raw'],
            )
            for r in rows_data
        ],
        batch_size=500,
    )


def _preprocessing_staging_active(order):
    """True when staging rows exist and PO is not preprocess-finalized."""
    return (
        PreprocessingRow.objects.filter(purchase_order=order).exists()
        and not order.finalized_at
    )


def default_column_mappings(headers):
    normalized_headers = [(h, h.strip().lower()) for h in headers]
    mappings = []
    candidates = all_source_alias_candidates()
    for target in default_formula_mapping_targets_in_order():
        source = ''
        for alias in candidates.get(target, ()):
            match = next(
                (header for header, lowered in normalized_headers if lowered == alias),
                None,
            )
            if match:
                source = match
                break
        mappings.append({
            'target': target,
            'source': source,
            'transforms': [],
        })
    return mappings


def matching_templates_payload_for_vendor_signature(vendor, sig):
    """Template picker options for a header signature (no S3 / CSV parse)."""
    if vendor is None or not sig:
        return []
    usage_sq = (
        PurchaseOrder.objects.filter(template_id=OuterRef('pk'))
        .values('template_id')
        .annotate(n=Count('id'))
        .values('n')
    )
    last_sq = (
        PurchaseOrder.objects.filter(template_id=OuterRef('pk'))
        .order_by('-updated_at')
        .values('updated_at')[:1]
    )
    qs = (
        CSVTemplate.objects.filter(vendor=vendor, header_signature=sig)
        .annotate(
            use_count=Coalesce(Subquery(usage_sq, output_field=IntegerField()), Value(0)),
            last_used_at=Subquery(last_sq, output_field=DateTimeField()),
        )
        .order_by('-is_default', '-id')[:25]
    )
    return [
        {
            'id': tpl.id,
            'name': tpl.name,
            'created_at': tpl.created_at.isoformat() if getattr(tpl, 'created_at', None) else None,
            'is_default': tpl.is_default,
            'use_count': tpl.use_count,
            'last_used_at': tpl.last_used_at.isoformat() if tpl.last_used_at else None,
        }
        for tpl in qs
    ]


def normalize_standard_mappings(mappings):
    """Normalize mixed mapping payloads to {target, source, transforms[]} or {target, formula}."""
    normalized = []
    for mapping in mappings or []:
        if not isinstance(mapping, dict):
            continue
        raw_target = mapping.get('target') or mapping.get('standard_column') or mapping.get('standardColumn')
        if not raw_target:
            continue
        target = coerce_mapping_target(str(raw_target).strip())
        if validate_mapping_target(target) is not None:
            continue

        formula = mapping.get('formula', '').strip() if mapping.get('formula') else ''
        if formula:
            normalized.append({'target': target, 'formula': formula})
            continue

        source = mapping.get('source') or mapping.get('source_header') or mapping.get('sourceHeader')

        raw_transforms = (
            mapping.get('transforms')
            if mapping.get('transforms') is not None
            else mapping.get('functions')
        )
        if raw_transforms is None and mapping.get('transform'):
            raw_transforms = [{'type': mapping.get('transform')}]

        transforms = []
        for transform in raw_transforms or []:
            if isinstance(transform, str):
                transform_type = transform
                transform_data = {'type': transform_type}
            elif isinstance(transform, dict):
                transform_type = transform.get('type') or transform.get('id')
                if not transform_type:
                    continue
                transform_data = {'type': transform_type}
                if transform_type == 'replace':
                    transform_data['from'] = str(
                        transform.get('from', transform.get('value_from', '')),
                    )
                    transform_data['to'] = str(
                        transform.get('to', transform.get('value_to', '')),
                    )
            else:
                continue
            transforms.append(transform_data)

        normalized.append({
            'target': target,
            'source': str(source or ''),
            'transforms': transforms,
        })
    return normalized


def effective_manifest_row_price(row):
    if row.final_price is not None:
        return row.final_price
    if row.proposed_price is not None:
        return row.proposed_price
    return None


TERMINAL_ITEM_STATUSES = ('sold', 'scrapped', 'lost')


def effective_preprocessing_row_price(row):
    """Effective unit price for a staging PreprocessingRow (mirrors ManifestRow semantics)."""
    if row.final_price is not None:
        return row.final_price
    if row.proposed_price is not None:
        return row.proposed_price
    return None


def _safe_attachment_filename_stem(name: str, fallback: str = 'download') -> str:
    base = str(name or '').strip() or fallback
    base = re.sub(r'[^\w.\-]+', '_', base, flags=re.ASCII)
    return base[:120] or fallback


def _unit_base_cost_and_ideal_price(order, retail_value):
    """Per-unit acquisition cost and 2× ideal unit price (aligned with preprocessing-status totals)."""
    base_cost = order.compute_item_cost(retail_value)
    if base_cost is None:
        return None, None
    ideal_price = (base_cost * Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return base_cost, ideal_price


PREPROCESSING_REVIEW_EDITABLE_FIELDS = (
    'title',
    'brand',
    'model',
    'category',
    'condition',
    'search_tags',
    'notes',
    'pricing_notes',
)

# DB columns touched by manual Final Review edits (used for ai_status pruning).
_PREPROCESSING_REVIEW_AI_STATUS_CLEAR_FIELDS = frozenset({
    'final_title',
    'final_brand',
    'final_model',
    'final_category',
    'final_condition',
    'final_notes',
    'final_search_tags',
    'final_specifications',
    'final_identifiers',
    'final_taxonomy',
    'final_tracking',
    'proposed_price',
    'final_price',
})


def _prune_ai_status_for_manual_edit(status: dict, edited_aliases: set[str]) -> dict:
    """Drop ai_status issues tied to edited logical fields; reset state when no issues remain."""
    if not edited_aliases:
        return status or {}
    tokens = {a.lower() for a in edited_aliases if a}
    if not tokens:
        return status or {}
    out = dict(status or {})
    issues = out.get('issues')
    if not isinstance(issues, list):
        return out
    has_field_hints = any(
        isinstance(i, dict) and (i.get('field') or i.get('path')) for i in issues
    )
    if not has_field_hints:
        return {}
    filtered = []
    for issue in issues:
        if not isinstance(issue, dict):
            filtered.append(issue)
            continue
        fld = str(issue.get('field') or issue.get('path') or '').lower()
        if fld and any(t in fld or fld.endswith(t) for t in tokens):
            continue
        filtered.append(issue)
    out['issues'] = filtered
    if not out['issues']:
        out['state'] = 'clean'
    return out


def _logical_aliases_from_final_update_fields(update_fields: list[str]) -> set[str]:
    alias_by_final = {
        'final_title': 'title',
        'final_brand': 'brand',
        'final_model': 'model',
        'final_category': 'category',
        'final_condition': 'condition',
        'final_notes': 'notes',
        'final_search_tags': 'search_tags',
        'final_specifications': 'specifications',
        'final_identifiers': 'identifiers',
        'final_taxonomy': 'taxonomy',
        'final_tracking': 'tracking',
        'final_price': 'price',
        'proposed_price': 'price',
    }
    out = set()
    for f in update_fields:
        if f in alias_by_final:
            out.add(alias_by_final[f])
    return out


def _preprocessing_review_update_clears_ai_status(update_fields):
    return bool(_PREPROCESSING_REVIEW_AI_STATUS_CLEAR_FIELDS.intersection(update_fields))


def _normalize_cleanup_ai_status_value(raw):
    """Normalize cleanup CSV / JSON ai_status to a JSON-serializable dict.

    Empty, whitespace-only, malformed JSON, or non-dict payloads become {} (clean-equivalent).
    """
    if raw is None:
        return {}
    if isinstance(raw, dict):
        if not raw:
            return {}
        out = {}
        st = raw.get('state')
        if isinstance(st, str) and st.strip():
            out['state'] = st.strip()
        issues = raw.get('issues')
        if isinstance(issues, list):
            out['issues'] = issues[:50]
        elif issues is not None:
            out['issues'] = []
        else:
            out['issues'] = []
        for k, v in raw.items():
            if k in ('state', 'issues'):
                continue
            if isinstance(v, (str, int, float, bool)) or v is None:
                out[k] = v
            elif isinstance(v, dict) and len(v) < 20:
                out[k] = v
        return out
    s = str(raw).strip()
    if not s:
        return {}
    try:
        loaded = json.loads(s)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    if isinstance(loaded, dict):
        return _normalize_cleanup_ai_status_value(loaded)
    return {}


def _parse_page_params(query_params):
    try:
        page = int(query_params.get('page', 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(query_params.get('page_size', 50))
    except (TypeError, ValueError):
        page_size = 50
    # 500 cap supports the review sweep loops (fields=minimal); default stays 50.
    return max(1, page), max(10, min(page_size, 500))


def build_preprocessing_review_queryset(order, query_params):
    rows_qs = (
        PreprocessingRow.objects.filter(purchase_order=order)
        .select_related('purchase_order', 'manifest_row', 'final_matched_product')
        .order_by('row_number')
    )
    search_term = str(query_params.get('search') or '').strip().lower()
    if search_term:
        st = search_term
        rows_qs = rows_qs.filter(
            Q(manifest_row__title__icontains=st)
            | Q(manifest_row__category__icontains=st)
            | Q(standard_brand__icontains=st)
            | Q(manifest_row__brand__icontains=st)
            | Q(ai_brand__icontains=st)
            | Q(final_brand__icontains=st)
            | Q(standard_model__icontains=st)
            | Q(manifest_row__model__icontains=st)
            | Q(ai_model__icontains=st)
            | Q(final_model__icontains=st)
            | Q(standard_condition__icontains=st)
            | Q(manifest_row__condition__icontains=st)
            | Q(ai_condition__icontains=st)
            | Q(final_condition__icontains=st)
            | Q(standard_notes__icontains=st)
            | Q(manifest_row__notes__icontains=st)
            | Q(ai_notes__icontains=st)
            | Q(final_notes__icontains=st)
            | Q(ai_title__icontains=st)
            | Q(final_title__icontains=st)
            | Q(ai_category__icontains=st)
            | Q(final_category__icontains=st)
        )
    if str(query_params.get('missing_price') or '').lower() in ('1', 'true', 'yes'):
        rows_qs = rows_qs.filter(final_price__isnull=True, proposed_price__isnull=True)
    return rows_qs


def build_preprocessing_review_serializer_context(order):
    """Peer row_numbers sharing the same decided product (for same-product badges)."""
    from collections import defaultdict

    by_product = defaultdict(list)
    for row_id, product_id, row_number in (
        PreprocessingRow.objects.filter(
            purchase_order=order,
            final_matched_product_id__isnull=False,
        ).values_list('id', 'final_matched_product_id', 'row_number')
    ):
        by_product[product_id].append((row_id, row_number))

    peers_by_row_id = {}
    for entries in by_product.values():
        if len(entries) < 2:
            continue
        for row_id, _row_number in entries:
            others = sorted(rn for rid, rn in entries if rid != row_id)[:10]
            peers_by_row_id[row_id] = others
    return {'same_product_peers_by_row_id': peers_by_row_id}


def summarize_preprocessing_rows(order, rows_qs):
    """Aggregate-only summary (no per-row Python iteration)."""
    return summarize_preprocessing_rows_aggregate(order, rows_qs)


def update_preprocessing_review_rows(order, rows_payload):
    rows_by_id = {
        row.id: row
        for row in PreprocessingRow.objects.filter(purchase_order=order)
    }
    product_ids_to_validate: set[int] = set()
    for row_data in rows_payload:
        if not isinstance(row_data, dict):
            continue
        effective = row_data
        patch = row_data.get('patch')
        if isinstance(patch, dict):
            effective = {**patch, 'id': row_data.get('id')}
        if 'final_matched_product' not in effective:
            continue
        raw_pid = effective.get('final_matched_product')
        if raw_pid in (None, ''):
            continue
        try:
            product_ids_to_validate.add(int(raw_pid))
        except (TypeError, ValueError):
            pass
    valid_product_ids = (
        set(Product.objects.filter(pk__in=product_ids_to_validate).values_list('pk', flat=True))
        if product_ids_to_validate
        else set()
    )
    changed_rows = []
    changed_ids = []
    for row_data in rows_payload:
        if not isinstance(row_data, dict) or not row_data.get('id'):
            continue
        try:
            row_id = int(row_data['id'])
        except (TypeError, ValueError):
            continue
        row = rows_by_id.get(row_id)
        if not row:
            continue
        patch = row_data.get('patch')
        if isinstance(patch, dict):
            row_data = {**patch, 'id': row_id}
        update_fields = []
        edited_aliases: set[str] = set()

        # Accept explicit final_* keys from coordinated clients.
        for fk in (
            'final_title',
            'final_brand',
            'final_model',
            'final_category',
            'final_condition',
            'final_notes',
        ):
            if fk not in row_data:
                continue
            val = row_data.get(fk)
            if fk == 'final_title':
                row.final_title = str(val or '')[:300]
                edited_aliases.add('title')
            elif fk in ('final_brand', 'final_model'):
                setattr(row, fk, str(val or '')[:200])
                edited_aliases.add('brand' if fk == 'final_brand' else 'model')
            elif fk == 'final_category':
                row.final_category = str(val or '').strip()[:200]
                edited_aliases.add('category')
            elif fk == 'final_condition':
                raw_c = str(val or '').strip()
                norm_c = normalize_cleanup_condition(raw_c) or raw_c
                row.final_condition = norm_c
                edited_aliases.add('condition')
            elif fk == 'final_notes':
                row.final_notes = str(val or '')
                edited_aliases.add('notes')
            update_fields.append(fk)

        skip_legacy_title = 'final_title' in update_fields
        skip_legacy_category = 'final_category' in update_fields
        skip_legacy_brand = 'final_brand' in update_fields
        skip_legacy_model = 'final_model' in update_fields
        skip_legacy_condition = 'final_condition' in update_fields
        skip_legacy_notes = 'final_notes' in update_fields

        for field in PREPROCESSING_REVIEW_EDITABLE_FIELDS:
            if field not in row_data:
                continue
            if field == 'title' and skip_legacy_title:
                continue
            if field == 'category' and skip_legacy_category:
                continue
            if field == 'brand' and skip_legacy_brand:
                continue
            if field == 'model' and skip_legacy_model:
                continue
            if field == 'condition' and skip_legacy_condition:
                continue
            if field == 'notes' and skip_legacy_notes:
                continue
            if field not in row_data:
                continue
            if field == 'search_tags':
                st = row_data.get('search_tags')
                if isinstance(st, list):
                    row.final_search_tags = [str(x).strip() for x in st if str(x).strip()]
                else:
                    row.final_search_tags = slugify_formula_search_tags(str(st or ''))
                update_fields.append('final_search_tags')
                edited_aliases.add('search_tags')
                continue
            if field == 'title':
                row.final_title = str(row_data.get(field) or '')[:300]
                update_fields.append('final_title')
                edited_aliases.add('title')
            elif field == 'category':
                row.final_category = str(row_data.get(field) or '').strip()[:200]
                update_fields.append('final_category')
                edited_aliases.add('category')
            elif field == 'brand':
                row.final_brand = str(row_data.get(field) or '')[:200]
                update_fields.append('final_brand')
                edited_aliases.add('brand')
            elif field == 'model':
                row.final_model = str(row_data.get(field) or '')[:200]
                update_fields.append('final_model')
                edited_aliases.add('model')
            elif field == 'condition':
                raw_c = str(row_data.get(field) or '').strip()
                norm_c = normalize_cleanup_condition(raw_c) or raw_c
                row.final_condition = norm_c
                update_fields.append('final_condition')
                edited_aliases.add('condition')
            elif field == 'notes':
                row.final_notes = str(row_data.get(field) or '')
                update_fields.append('final_notes')
                edited_aliases.add('notes')
            else:
                setattr(row, field, str(row_data.get(field) or ''))
                update_fields.append(field)
        if 'specifications' in row_data and isinstance(row_data.get('specifications'), dict):
            row.final_specifications = row_data['specifications']
            update_fields.append('final_specifications')
            edited_aliases.add('specifications')
        if 'final_matched_product' in row_data:
            raw_pid = row_data.get('final_matched_product')
            if raw_pid in (None, ''):
                row.final_matched_product = None
                # Explicit ``match_source: ''`` = REMOVE the match (back to undecided —
                # auto-matching may pick it up again). Default null = staff "new product".
                if 'match_source' in row_data and row_data.get('match_source') == '':
                    row.match_source = ''
                else:
                    row.match_source = 'staff'
                update_fields.extend(['final_matched_product', 'match_source'])
            else:
                try:
                    pid = int(raw_pid)
                except (TypeError, ValueError):
                    pid = None
                if pid is not None:
                    if pid not in valid_product_ids:
                        raise ValidationError({
                            'detail': f'Row {row.row_number}: product {pid} not found.',
                        })
                    row.final_matched_product_id = pid
                    row.match_source = 'staff'
                    update_fields.extend(['final_matched_product', 'match_source'])
        if 'batch_flag' in row_data:
            row.batch_flag = bool(row_data.get('batch_flag'))
            update_fields.append('batch_flag')
        price_field = 'final_price' if 'final_price' in row_data else None
        if price_field:
            row.final_price = parse_decimal(row_data.get(price_field))
            row.pricing_stage = 'final' if row.final_price is not None else 'unpriced'
            update_fields.extend(['final_price', 'pricing_stage'])
            edited_aliases.add('price')
        elif 'proposed_price' in row_data:
            row.proposed_price = parse_decimal(row_data.get('proposed_price'))
            if row.final_price is None:
                row.pricing_stage = 'draft' if row.proposed_price is not None else 'unpriced'
                update_fields.append('pricing_stage')
            update_fields.append('proposed_price')
            edited_aliases.add('price')
        if update_fields:
            uf = list(dict.fromkeys(update_fields))
            logical = edited_aliases or _logical_aliases_from_final_update_fields(uf)
            if _preprocessing_review_update_clears_ai_status(uf):
                row.ai_status = _prune_ai_status_for_manual_edit(row.ai_status or {}, logical)
                uf.append('ai_status')
            row.save(update_fields=list(dict.fromkeys(uf)))
            changed_rows.append(row)
            changed_ids.append(row.id)
    if changed_rows:
        now = timezone.now()
        with transaction.atomic():
            order_w = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
            order_w.preprocess_status = 'reviewing'
            uf_po = ['preprocess_status', 'updated_at']
            if order_w.review_saved_at is None:
                order_w.review_saved_at = now
                uf_po.insert(1, 'review_saved_at')
            order_w.save(update_fields=uf_po)
    return changed_rows, changed_ids


def _clean_match_value(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).lower()


def _row_listing_title(row):
    if isinstance(row, PreprocessingRow):
        t = effective_preprocessing_title(row).strip()
        if t:
            return t[:300]
        return 'Untitled Item'
    return (
        getattr(row, 'title', '')
        or 'Untitled Item'
    )[:300]


def _row_listing_brand(row):
    if isinstance(row, PreprocessingRow):
        b = effective_preprocessing_triple(row, 'brand')
        return str(b or '')[:200]
    return str(getattr(row, 'brand', '') or '')[:200]


def _row_listing_model(row):
    if isinstance(row, PreprocessingRow):
        m = effective_preprocessing_triple(row, 'model')
        return str(m or '')[:200]
    return str(getattr(row, 'model', '') or '')[:200]


def _row_listing_category(row):
    return effective_taxonomy_category_for_row(row)


def _cleanup_csv_json_cell(val):
    """Single CSV cell for dict/list payloads (empty aggregates → blank cell)."""
    if val is None:
        return ''
    if isinstance(val, dict) and len(val) == 0:
        return ''
    if isinstance(val, list) and len(val) == 0:
        return ''
    if isinstance(val, (dict, list)):
        return json.dumps(val, ensure_ascii=False, separators=(',', ':'))
    return str(val)


def _cleanup_strip_record(row: dict) -> dict:
    out = {}
    for k, v in (row or {}).items():
        if k is None:
            continue
        key = str(k).strip()
        if not key:
            continue
        if isinstance(v, str):
            out[key] = v.strip()
        elif v is None:
            out[key] = ''
        else:
            out[key] = v
    return out


def _cleanup_apply_header_aliases(norm: dict) -> dict:
    """Groove-style aliases (unprefixed wire) merged into canonical upload keys."""
    n = dict(norm)
    if n.get('title') and not n.get('ai_title'):
        n['ai_title'] = n['title']
    if n.get('brand') and not n.get('ai_brand'):
        n['ai_brand'] = n['brand']
    if n.get('model') and not n.get('ai_model'):
        n['ai_model'] = n['model']
    return n


NARROW_AI_CLEANUP_KEYS = frozenset({
    'row_id', 'ai_title', 'ai_brand', 'ai_model', 'category', 'condition', 'proposed_price',
})
WIDE_JSON_CLEANUP_KEYS = frozenset({
    'identifiers_json', 'taxonomy_json', 'specifications_json', 'tracking_json', 'search_tags_json',
})

_CLEANUP_STAGING_WIDE_SIGNAL_KEYS = WIDE_JSON_CLEANUP_KEYS.union({'title', 'notes'})


def _cleanup_norm_has_non_empty(norm: dict, keys: frozenset | set) -> bool:
    for k in keys:
        if k not in norm:
            continue
        v = norm.get(k)
        if v is None:
            continue
        if isinstance(v, str) and not str(v).strip():
            continue
        return True
    return False


def _cleanup_export_sku(row, use_staging):
    """Prefer identifiers sub-keys, then canonical Item SKU when not staging."""
    if use_staging:
        blob = getattr(row, 'standard_identifiers', None) or {}
    else:
        blob = getattr(row, 'identifiers', None) or {}
    if isinstance(blob, dict):
        for k in ('sku', 'item_number', 'vendor_item_number', 'tcin', 'asin'):
            v = blob.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()[:500]
    if use_staging:
        return ''
    first_item = row.items.exclude(status__in=TERMINAL_ITEM_STATUSES).order_by('id').first()
    return str(first_item.sku).strip()[:500] if first_item and first_item.sku else ''


def _cleanup_export_upc(row):
    if hasattr(row, 'raw_row'):
        blob = getattr(row, 'standard_identifiers', None) or {}
    else:
        blob = getattr(row, 'identifiers', None) or {}
    if not isinstance(blob, dict):
        return ''
    return str(blob.get('upc') or blob.get('ean') or blob.get('gtin') or '')[:128]


def _row_identifiers_blob(row):
    if hasattr(row, 'raw_row'):
        return getattr(row, 'standard_identifiers', {}) or {}
    return row.identifiers or {}

def _vendor_lookup_from_manifest_identifiers(row) -> str:
    return first_identifier_hit(_row_identifiers_blob(row), IDENTIFIER_LOOKUP_ORDER)


def _row_listing_condition(row):
    condition = (row.condition or '').strip()
    valid = {choice[0] for choice in Item.CONDITION_CHOICES}
    return condition if condition in valid else 'unknown'


def _row_price(row):
    return effective_manifest_row_price(row) or Decimal('0.00')


def _cache_resolved_manifest_product(order, row, cache, product):
    """Reuse Product lookups across rows in a single ``ensure_manifest_products_and_items`` pass."""
    if cache is None:
        return
    ids = row.identifiers or {}
    upc_val = identifier_value(ids, 'upc')
    if upc_val:
        cache['upc'][upc_val] = product
    lookup_key = first_identifier_hit(ids, IDENTIFIER_LOOKUP_ORDER)
    if lookup_key:
        cache['vk'][(order.vendor_id, lookup_key)] = product
    title = _row_listing_title(row)
    brand = _row_listing_brand(row)
    model = _row_listing_model(row)
    category = _row_listing_category(row)
    cache['exact'][(title.lower(), brand.lower(), model.lower(), category.lower())] = product


def _find_or_create_manifest_product(order, row, cache=None):
    """Deterministic reuse only; otherwise create a new Product for this row."""
    ids = row.identifiers or {}
    upc_val = identifier_value(ids, 'upc')
    if cache is not None and upc_val and upc_val in cache['upc']:
        return cache['upc'][upc_val], False

    lookup_key = first_identifier_hit(ids, IDENTIFIER_LOOKUP_ORDER)
    if cache is not None and lookup_key:
        ck = (order.vendor_id, lookup_key)
        if ck in cache['vk']:
            return cache['vk'][ck], False

    title = _row_listing_title(row)
    brand = _row_listing_brand(row)
    model = _row_listing_model(row)
    category = _row_listing_category(row)
    exact_key = (title.lower(), brand.lower(), model.lower(), category.lower())
    if cache is not None and exact_key in cache['exact']:
        return cache['exact'][exact_key], False

    if upc_val:
        product = Product.objects.filter(identifiers__upc=upc_val).first()
        if product:
            _cache_resolved_manifest_product(order, row, cache, product)
            return product, False

    if lookup_key:
        ref = VendorProductRef.objects.filter(
            vendor=order.vendor,
            vendor_item_number=lookup_key,
        ).select_related('product').first()
        if ref:
            ref.times_seen += 1
            if row.unit_retail is not None:
                ref.last_unit_cost = row.unit_retail
            ref.save(update_fields=['times_seen', 'last_unit_cost', 'updated_at'])
            _cache_resolved_manifest_product(order, row, cache, ref.product)
            return ref.product, False

    category_obj, _ = Category.objects.get_or_create(name=canonical_category_name(category))

    exact_product = Product.objects.filter(
        title__iexact=title,
        brand__iexact=brand,
        model__iexact=model,
        category=category_obj,
    ).first()
    if exact_product:
        _cache_resolved_manifest_product(order, row, cache, exact_product)
        return exact_product, False

    if row.matched_product_id:
        prod = row.matched_product
        _cache_resolved_manifest_product(order, row, cache, prod)
        return prod, False

    product = Product.objects.create(
        title=title or (f'Generic identifier {upc_val}' if upc_val else 'Generic Product'),
        brand=brand or 'Generic',
        model=model,
        category=category_obj,
        specifications=row.specifications or {},
        identifiers=merge_identifiers(ids, {'upc': upc_val} if upc_val else {}),
        tags=row.search_tags or [],
    )
    if lookup_key:
        VendorProductRef.objects.get_or_create(
            vendor=order.vendor,
            vendor_item_number=lookup_key,
            defaults={
                'product': product,
                'vendor_description': (row.title or '')[:500],
                'last_unit_cost': row.unit_retail,
            },
        )
    _cache_resolved_manifest_product(order, row, cache, product)
    return product, True


def _sync_manifest_items_for_row(order, row, product):
    quantity = row.quantity if row.quantity and row.quantity > 0 else 1
    desired_price = _row_price(row)
    row_cost = row.unit_retail if row.unit_retail is not None else None
    item_cost = order.compute_item_cost(row_cost)
    existing_items = list(
        row.items.exclude(status__in=TERMINAL_ITEM_STATUSES).order_by('id')
    )
    created = 0
    updated = 0
    deleted = 0

    for idx, item in enumerate(existing_items[:quantity]):
        changed_fields = []
        updates = {
            'product': product,
            'purchase_order': order,
            'manifest_row': row,
            'price': desired_price,
            'retail': row_cost,
            'cost': item_cost,
            'source': 'purchased',
            'condition': _row_listing_condition(row),
            'specifications': row.specifications or {},
        }
        for field, value in updates.items():
            if getattr(item, field) != value:
                setattr(item, field, value)
                changed_fields.append(field)
        if changed_fields:
            item.save(
                update_fields=list(dict.fromkeys(changed_fields + ['updated_at'])),
                defer_po_cost_recompute=True,
            )
            updated += 1

    if len(existing_items) > quantity:
        extra_ids = [item.id for item in existing_items[quantity:]]
        deleted = len(extra_ids)
        Item.objects.filter(id__in=extra_ids).delete()

    for _ in range(max(0, quantity - len(existing_items))):
        new_item = Item(
            product=product,
            purchase_order=order,
            manifest_row=row,
            price=desired_price,
            retail=row_cost,
            cost=item_cost,
            source='purchased',
            status='intake',
            condition=_row_listing_condition(row),
            specifications=row.specifications or {},
        )
        new_item.save(defer_po_cost_recompute=True)
        created += 1

    return created, updated, deleted


def ensure_manifest_products_and_items(order, user=None):
    """Create/reuse Product rows and maintain one intake Item per manifest unit."""
    rows = list(
        ManifestRow.objects.filter(purchase_order=order)
        .select_related('matched_product')
        .prefetch_related('items')
        .order_by('row_number')
    )
    products_created = 0
    items_created = 0
    items_updated = 0
    items_deleted = 0
    rows_linked = 0
    cache = {'upc': {}, 'vk': {}, 'exact': {}}
    processing_rows_to_update: list[ProcessingRow] = []
    touched_product_ids = []

    with transaction.atomic():
        pr_by_mr_id = {
            pr.manifest_row_id: pr
            for pr in ProcessingRow.objects.filter(
                purchase_order=order,
                manifest_row_id__isnull=False,
            ).select_related('matched_product')
        }
        for row in rows:
            pr = pr_by_mr_id.get(row.id)
            if pr is not None and pr.matched_product_id:
                product = pr.matched_product
                created_product = False
            else:
                product, created_product = _find_or_create_manifest_product(order, row, cache=cache)
            if created_product:
                products_created += 1
            touched_product_ids.append(product.id)

            if pr is not None and pr.matched_product_id != product.id:
                pr.matched_product_id = product.id
                processing_rows_to_update.append(pr)
                rows_linked += 1

            created, updated, deleted = _sync_manifest_items_for_row(order, row, product)
            items_created += created
            items_updated += updated
            items_deleted += deleted

        if processing_rows_to_update:
            ProcessingRow.objects.bulk_update(processing_rows_to_update, ['matched_product_id', 'updated_at'])

        order.recompute_item_costs()

        item_count = order.items.count()
        if order.item_count != item_count:
            order.item_count = item_count
            order.save(update_fields=['item_count', 'updated_at'])

    return {
        'rows': len(rows),
        'rows_linked': rows_linked,
        'products_created': products_created,
        'items_created': items_created,
        'items_updated': items_updated,
        'items_deleted': items_deleted,
        'item_count': order.items.count(),
    }


def sync_manifest_row_outputs_to_items(order, rows):
    """Propagate reviewed/AI row fields to linked Products and non-terminal Items."""
    rows_updated = 0
    items_updated = 0
    products_updated = 0
    pr_by_mr_id = {
        pr.manifest_row_id: pr
        for pr in ProcessingRow.objects.filter(
            purchase_order=order,
            manifest_row_id__isnull=False,
        ).select_related('matched_product')
    }
    for row in rows:
        row_items = list(
            row.items.exclude(status__in=TERMINAL_ITEM_STATUSES).select_related('product'),
        )
        distinct_pids = {i.product_id for i in row_items if i.product_id is not None}
        product = row.matched_product
        if not product:
            pr = pr_by_mr_id.get(row.id)
            if pr is not None and pr.matched_product_id:
                product = pr.matched_product
        if not product and row_items:
            product = row_items[0].product
        # Mixed-product rows (P4 split): row-level listing data is ambiguous across
        # products — do not overwrite any single Product's identity fields.
        if len(distinct_pids) >= 2:
            product = None
        if product:
            category_obj, _ = Category.objects.get_or_create(
                name=canonical_category_name(_row_listing_category(row) or MIXED_LOTS_UNCATEGORIZED),
            )
            product_updates = {
                'title': _row_listing_title(row),
                'brand': _row_listing_brand(row) or 'Generic',
                'model': _row_listing_model(row),
                'category': category_obj,
                'specifications': row.specifications or {},
                'identifiers': merge_identifiers(product.identifiers, row.identifiers),
                'tags': row.search_tags or product.tags or [],
            }
            changed = []
            for field, value in product_updates.items():
                if getattr(product, field) != value:
                    setattr(product, field, value)
                    changed.append(field)
            if changed:
                product.save(update_fields=list(dict.fromkeys(changed + ['updated_at'])))
                products_updated += 1

        for item in row_items:
            # No item product re-point here: P6 removed all manifest match writers,
            # so a decided-product change cannot arrive via this surface. Re-points
            # go through explicit check-in product modes or batch remap (P4).
            item_updates = {
                'condition': _row_listing_condition(row),
                'price': _row_price(row),
                'retail': row.unit_retail,
                'cost': order.compute_item_cost(row.unit_retail),
                'specifications': row.specifications or {},
            }
            changed = []
            for field, value in item_updates.items():
                if getattr(item, field) != value:
                    setattr(item, field, value)
                    changed.append(field)
            if changed:
                item.save(update_fields=list(dict.fromkeys(changed + ['updated_at'])))
                items_updated += 1
        rows_updated += 1

    return {
        'rows_updated': rows_updated,
        'items_updated': items_updated,
        'products_updated': products_updated,
    }


INVENTORY_CLEANUP_MODEL_OPTIONS = (
    {'id': 'gemini-3.1-flash-lite', 'name': 'Gemini 3.1 Flash Lite'},
    {'id': 'claude-haiku-4-5', 'name': 'Claude Haiku 4.5'},
)


def _inventory_cleanup_model_settings():
    # Resolve env-configured default at call time (not module import) so settings
    # overrides — and .env edits between server restarts in tests — take effect.
    configured_cleanup_model = ai_model('INVENTORY_CLEANUP')
    models = [dict(m) for m in INVENTORY_CLEANUP_MODEL_OPTIONS]
    allowed_ids = {m['id'] for m in models}
    default_model = (
        configured_cleanup_model
        if configured_cleanup_model in allowed_ids
        else models[0]['id']
    )
    return models, default_model


def _save_inventory_cleanup_model_settings(models, default_model, user=None):
    AppSetting.objects.update_or_create(
        key='ai_models_inventory_cleanup',
        defaults={
            'value': models,
            'description': 'Models available in Inventory Preprocessing AI Cleanup.',
            'updated_by': user,
        },
    )
    AppSetting.objects.update_or_create(
        key='ai_default_inventory_cleanup_model',
        defaults={
            'value': default_model,
            'description': 'Default model for Inventory Preprocessing AI Cleanup.',
            'updated_by': user,
        },
    )


def parse_ai_cleanup_suggestions(content_text):
    """Parse bulk cleanup JSON array for tests and runtime."""
    if not (content_text or '').strip():
        raise ValueError('empty AI response')
    stripped = content_text.strip()
    if stripped.startswith('```'):
        stripped = re.sub(r'^```(?:json)?\s*', '', stripped, flags=re.IGNORECASE)
        stripped = re.sub(r'\s*```$', '', stripped)
    start = stripped.find('[')
    end = stripped.rfind(']')
    if start < 0 or end <= start:
        raise ValueError('AI response did not contain a JSON array')
    parsed = json.loads(stripped[start:end + 1])
    if not isinstance(parsed, list):
        raise ValueError('AI response was not a JSON array')
    return [item for item in parsed if isinstance(item, dict)]


def parse_id_list(raw_values):
    ids = []
    for value in raw_values or []:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return ids


def _build_check_in_queue_from_manifest(order, user):
    """
    Create Item and BatchGroup records from manifest rows.
    Returns (items_created, batch_groups_created) or (None, None) if preconditions fail.
    """
    if order.status not in ['delivered', 'processing', 'complete']:
        return None, None
    if order.items.exists():
        return None, None
    rows = ManifestRow.objects.filter(
        purchase_order=order,
    ).select_related('matched_product')
    if not rows.exists():
        return None, None

    batch = ProcessingBatch.objects.create(
        purchase_order=order,
        status='in_progress',
        total_rows=rows.count(),
        started_at=timezone.now(),
        created_by=user,
    )

    items_created = 0
    batch_groups_created = 0
    histories = []

    pr_by_mr_id = {
        pr.manifest_row_id: pr
        for pr in ProcessingRow.objects.filter(
            purchase_order=order,
            manifest_row_id__isnull=False,
        ).select_related('matched_product')
    }

    for row in rows:
        pr = pr_by_mr_id.get(row.id)
        if pr is not None and pr.matched_product_id:
            product = pr.matched_product
        elif row.matched_product_id:
            product = row.matched_product
        else:
            product = Product.objects.create(
                title=(row.title or f'Review raw manifest row {row.row_number}')[:300],
                brand=row.brand or 'Generic',
                model=row.model or '',
                category=_row_listing_category(row) or MIXED_LOTS_UNCATEGORIZED,
                identifiers=merge_identifiers(row.identifiers),
            )

        if pr is not None and pr.matched_product_id != product.id:
            pr.matched_product_id = product.id
            pr.save(update_fields=['matched_product_id', 'updated_at'])

        quantity = row.quantity if row.quantity and row.quantity > 0 else 1
        row_cost = row.unit_retail if row.unit_retail is not None else None
        row_price = effective_manifest_row_price(row)

        for _ in range(quantity):
            item_price = row_price if row_price is not None else Decimal('0.00')
            item_cost = order.compute_item_cost(row_cost)
            item = Item.objects.create(
                sku=Item.generate_sku(),
                product=product,
                purchase_order=order,
                manifest_row=row,
                price=item_price,
                retail=row_cost,
                cost=item_cost,
                source='purchased',
                status='intake',
                condition=row.condition or 'unknown',
                specifications=row.specifications or {},
            )
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='created',
                    new_value=f'po={order.order_number},row={row.row_number}',
                    note=f'Created from manifest row {row.row_number}',
                    created_by=user,
                ),
            )
            items_created += 1

    if histories:
        ItemHistory.objects.bulk_create(histories, batch_size=1000)

    batch.processed_count = rows.count()
    batch.items_created = items_created
    batch.status = 'complete'
    batch.completed_at = timezone.now()
    batch.save()

    order.status = 'processing'
    order.item_count = items_created
    order.save(update_fields=['status', 'item_count', 'updated_at'])

    return items_created, batch_groups_created


def _finalize_purchase_order_deliver(order, user, delivered_date, *, build_check_in_queue=True):
    """Set delivered status; optionally enqueue legacy check-in items for legacy POs only."""
    order.status = 'delivered'
    order.delivered_date = delivered_date
    order.save(update_fields=['status', 'delivered_date', 'updated_at'])

    extras: dict = {}
    legacy = bool(getattr(order, 'uses_legacy_processing', False))
    if (
        build_check_in_queue
        and legacy
        and order.manifest_rows.exists()
        and not order.items.exists()
    ):
        items_created, batch_groups_created = _build_check_in_queue_from_manifest(
            order, user,
        )
        order.refresh_from_db()
        extras['items_created'] = items_created
        extras['batch_groups_created'] = batch_groups_created
    return extras


def _receiving_detail_queryset():
    return Receiving.objects.select_related(
        'purchase_order',
        'created_by',
    ).prefetch_related(
        Prefetch(
            'attachments',
            queryset=ReceivingAttachment.objects.select_related('s3_file'),
        ),
        'pallets',
    )


def row_matches_search(raw_dict, search_term):
    if not search_term:
        return True
    needle = str(search_term).strip().lower()
    if not needle:
        return True
    for value in (raw_dict or {}).values():
        if needle in str(value or '').lower():
            return True
    return False


def normalized_row_matches_search(row, search_term):
    if not search_term:
        return True
    needle = str(search_term).strip().lower()
    if not needle:
        return True
    hay_raw = ''
    for key, value in (row or {}).items():
        if key == 'row_number':
            continue
        if isinstance(value, (dict, list)):
            hay_raw += ' ' + json.dumps(value, sort_keys=True).lower()
        else:
            hay_raw += ' ' + str(value or '').lower()
    return needle in hay_raw


def apply_transform(value, transform):
    text = '' if value is None else str(value)
    if not transform:
        return text
    if isinstance(transform, str):
        transform_type = transform
        transform_args = {}
    else:
        transform_type = transform.get('type')
        transform_args = transform

    if transform_type == 'trim':
        return text.strip()
    if transform_type == 'title_case':
        return text.title()
    if transform_type == 'upper':
        return text.upper()
    if transform_type == 'lower':
        return text.lower()
    if transform_type == 'remove_special_chars':
        return re.sub(r'[^A-Za-z0-9\s\-_./]', '', text)
    if transform_type == 'replace':
        from_val = str(transform_args.get('from', ''))
        to_val = str(transform_args.get('to', ''))
        return text.replace(from_val, to_val)
    return text


def apply_transforms(value, transforms):
    current = '' if value is None else str(value)
    for transform in transforms or []:
        current = apply_transform(current, transform)
    return current


def parse_int(value, default=1):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        out = int(value)
        return out if out > 0 else default
    cleaned = re.sub(r'[^0-9-]', '', str(value))
    if not cleaned:
        return default
    try:
        out = int(cleaned)
    except ValueError:
        return default
    return out if out > 0 else default


def parse_decimal(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    cleaned = re.sub(r'[^0-9.\-]', '', str(value))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _suggest_item_format_money_field(val) -> str | None:
    pd = parse_decimal(val)
    if pd is not None and pd >= 0 and pd <= Decimal('999999.99'):
        q = pd.quantize(Decimal('0.01'))
        fs = format(q, 'f')
        if '.' in fs:
            fs = fs.rstrip('0').rstrip('.')
        return fs or '0'
    return None


def _suggest_item_parse_suggestions_from_text(
    content_text: str,
    fields: list,
    allowed: set,
) -> tuple[dict | None, dict | None]:
    """Parse Add Item AI JSON; returns (suggestions_dict, full_parsed_dict) or (None, None)."""
    from apps.inventory.services.manual_item import normalize_search_tags
    if not (content_text or '').strip():
        return None, None
    stripped = content_text.strip()
    if stripped.startswith('```'):
        stripped = re.sub(r'^```(?:json)?\s*', '', stripped, count=1, flags=re.IGNORECASE)
        stripped = re.sub(r'\s*```\s*$', '', stripped, count=1)

    parsed = None
    start = stripped.find('{')
    if start >= 0:
        try:
            decoder = json.JSONDecoder()
            parsed, _end = decoder.raw_decode(stripped, start)
        except json.JSONDecodeError:
            return None, None
    if not isinstance(parsed, dict):
        return None, None

    raw_suggestions = parsed.get('suggestions') if isinstance(parsed, dict) else None
    if not isinstance(raw_suggestions, dict):
        loose = {k: parsed[k] for k in allowed if k in parsed}
        if loose:
            raw_suggestions = loose
    if not isinstance(raw_suggestions, dict):
        return None, None

    out: dict = {}
    for key in fields:
        if key not in raw_suggestions:
            continue
        val = raw_suggestions[key]
        if key == 'condition':
            cv = str(val).strip() if val is not None else ''
            if cv in CONDITION_VALUES:
                out[key] = cv
            continue
        if key == 'specifications':
            if isinstance(val, dict):
                clean = {str(k): str(v) for k, v in val.items() if k is not None}
                out[key] = clean
            continue
        if key in ('price', 'retail_value'):
            formatted = _suggest_item_format_money_field(val)
            if formatted is not None:
                out[key] = formatted
            continue
        if key == 'search_tags':
            out[key] = normalize_search_tags(val)
            continue
        if key == 'google_query':
            out[key] = str(val).strip()[:200] if val is not None else ''
            continue
        if key == 'model':
            out[key] = str(val).strip()[:200] if val is not None else ''
            continue
        if key in ('title', 'brand', 'category', 'notes'):
            out[key] = str(val) if val is not None else ''

    return out, parsed


def _suggest_product_parse_suggestions_from_text(
    content_text: str,
    fields: list,
    allowed: set,
) -> tuple[dict | None, dict | None]:
    """Parse Product AI JSON; returns (suggestions_dict, full_parsed_dict) or (None, None)."""
    from apps.inventory.services.manual_item import normalize_search_tags
    if not (content_text or '').strip():
        return None, None
    stripped = content_text.strip()
    if stripped.startswith('```'):
        stripped = re.sub(r'^```(?:json)?\s*', '', stripped, count=1, flags=re.IGNORECASE)
        stripped = re.sub(r'\s*```\s*$', '', stripped, count=1)

    parsed = None
    start = stripped.find('{')
    if start >= 0:
        try:
            decoder = json.JSONDecoder()
            parsed, _end = decoder.raw_decode(stripped, start)
        except json.JSONDecodeError:
            return None, None
    if not isinstance(parsed, dict):
        return None, None

    raw_suggestions = parsed.get('suggestions') if isinstance(parsed, dict) else None
    if not isinstance(raw_suggestions, dict):
        loose = {k: parsed[k] for k in allowed if k in parsed}
        if loose:
            raw_suggestions = loose
    if not isinstance(raw_suggestions, dict):
        return None, None

    out: dict = {}
    for key in fields:
        if key not in raw_suggestions:
            continue
        val = raw_suggestions[key]
        if key in ('identifiers', 'specifications'):
            if isinstance(val, dict):
                clean = {str(k).strip(): str(v).strip() for k, v in val.items() if k is not None and str(v).strip()}
                out[key] = clean
            continue
        if key == 'tags':
            out[key] = normalize_search_tags(val, max_tags=20, max_len=40)
            continue
        if key == 'model':
            out[key] = str(val).strip()[:200] if val is not None else ''
            continue
        if key in ('title', 'brand', 'category'):
            out[key] = str(val).strip() if val is not None else ''

    return out, parsed


def normalize_row(raw, row_number, column_mappings):
    flat_out: dict = {}
    identifiers: dict[str, str] = {}
    taxonomy: dict[str, str] = {}
    specifications: dict[str, str] = {}
    tracking: dict[str, str] = {}
    mappings_by_target: dict[str, dict] = {}
    for m in column_mappings or []:
        if not isinstance(m, dict):
            continue
        rt = str(m.get('target') or '').strip()
        if not rt:
            continue
        mappings_by_target[coerce_mapping_target(rt)] = m
    ordered_keys: list[str] = []
    seen: set[str] = set()
    for m in column_mappings or []:
        if not isinstance(m, dict):
            continue
        rt = str(m.get('target') or '').strip()
        if not rt:
            continue
        rt_canon = coerce_mapping_target(rt)
        if rt_canon not in seen:
            seen.add(rt_canon)
            ordered_keys.append(rt_canon)

    for tgt in ordered_keys:
        mapping = mappings_by_target.get(tgt) or {}
        if validate_mapping_target(tgt) is not None and tgt not in OPTIONAL_FLAT_TARGETS:
            continue
        formula = (mapping.get('formula') or '').strip() if mapping.get('formula') else ''
        if formula:
            try:
                cell = evaluate_formula(formula, raw)
            except FormulaError:
                cell = ''
        else:
            source = mapping.get('source', '')
            raw_value = raw.get(source, '') if source else ''
            transforms = mapping.get('transforms')
            if transforms is None and mapping.get('transform'):
                transforms = [{'type': mapping.get('transform')}]
            cell = apply_transforms(raw_value, transforms or [])
        if '.' in tgt:
            bucket, sk = tgt.split('.', 1)
            if bucket == 'identifiers':
                identifiers[sk] = str(cell or '').strip()
            elif bucket == 'taxonomy':
                taxonomy[sk] = str(cell or '').strip()
            elif bucket == 'specifications':
                specifications[sk] = str(cell or '').strip()
            elif bucket == 'tracking':
                tracking[sk] = str(cell or '').strip()
        elif tgt == 'search_tags':
            flat_out[tgt] = slugify_formula_search_tags(str(cell or ''))
        elif tgt == 'quantity':
            flat_out[tgt] = parse_int(cell)
        elif tgt == 'unit_retail':
            flat_out[tgt] = parse_decimal(cell)
        else:
            flat_out[tgt] = str(cell or '').strip()

    qty = flat_out.get('quantity')
    search_tags_val = flat_out.get('search_tags')
    if not isinstance(search_tags_val, list):
        search_tags_val = slugify_formula_search_tags(str(search_tags_val or ''))

    title = str(flat_out.get('title') or flat_out.get('description') or '').strip()
    return {
        'row_number': row_number,
        'quantity': parse_int(qty, default=1),
        'title': title,
        'brand': str(flat_out.get('brand') or '').strip(),
        'model': str(flat_out.get('model') or '').strip(),
        'condition': str(flat_out.get('condition') or '').strip(),
        'unit_retail': flat_out.get('unit_retail'),
        'notes': str(flat_out.get('notes') or '').strip(),
        'identifiers': prune_empty_bucket_values(identifiers),
        'taxonomy': prune_empty_bucket_values(taxonomy),
        'specifications': prune_empty_bucket_values(specifications),
        'tracking': prune_empty_bucket_values(tracking),
        'search_tags': search_tags_val,
    }


def category_from_normalized_manifest_row(row_data):
    category = str(row_data.get('category') or '').strip()
    if category:
        return category[:200]
    taxonomy = row_data.get('taxonomy')
    if isinstance(taxonomy, dict):
        return str(taxonomy.get('category') or '').strip()[:200]
    return ''


def upsert_manifest_row_from_standardized_data(order, row_data, *, pricing):
    """Create/update the stable standardized ManifestRow spine for a standardize row."""

    rn = int(row_data.get('row_number') or 0)
    search_tags = row_data.get('search_tags')
    if isinstance(search_tags, list):
        search_tags = [str(x).strip() for x in search_tags if str(x).strip()]
    elif search_tags is not None:
        search_tags = slugify_formula_search_tags(str(search_tags))
    else:
        search_tags = []

    defaults = {
        'quantity': row_data.get('quantity', 1),
        'title': str(row_data.get('title') or '')[:300],
        'brand': str(row_data.get('brand') or '')[:200],
        'model': str(row_data.get('model') or '')[:200],
        'condition': str(row_data.get('condition') or ''),
        'unit_retail': pricing['unit_retail'],
        'proposed_price': pricing['proposed_price'],
        'final_price': pricing['final_price'],
        'pricing_stage': pricing['pricing_stage'],
        'pricing_notes': pricing['pricing_notes'],
        'batch_flag': bool(row_data.get('batch_flag')),
        'identifiers': row_data.get('identifiers') if isinstance(row_data.get('identifiers'), dict) else {},
        'taxonomy': row_data.get('taxonomy') if isinstance(row_data.get('taxonomy'), dict) else {},
        'search_tags': search_tags,
        'specifications': row_data.get('specifications') if isinstance(row_data.get('specifications'), dict) else {},
        'tracking': row_data.get('tracking') if isinstance(row_data.get('tracking'), dict) else {},
        'notes': str(row_data.get('notes') or ''),
        'category': category_from_normalized_manifest_row(row_data),
        'match_status': 'pending',
    }

    existing = (
        ManifestRow.objects
        .filter(purchase_order=order, row_number=rn)
        .order_by('id')
        .first()
    )
    if existing is None:
        return ManifestRow.objects.create(purchase_order=order, row_number=rn, **defaults), True

    for field, value in defaults.items():
        setattr(existing, field, value)
    existing.save(update_fields=[*defaults.keys()])
    return existing, False


def resolve_manifest_mappings(order, headers, template_id=None, mappings_payload=None):
    sig = header_signature(headers)
    used_template = None
    if template_id:
        used_template = CSVTemplate.objects.filter(
            id=template_id,
            vendor=order.vendor,
        ).first()
    if not used_template:
        used_template = CSVTemplate.objects.filter(
            vendor=order.vendor,
            header_signature=sig,
        ).order_by('-is_default', '-id').first()

    normalized_mappings = normalize_standard_mappings(mappings_payload or [])
    if not normalized_mappings:
        if used_template and used_template.column_mappings:
            normalized_mappings = normalize_standard_mappings(
                used_template.column_mappings,
            )
        if not normalized_mappings:
            normalized_mappings = default_column_mappings(headers)
    return sig, used_template, normalized_mappings


def build_normalized_manifest_rows_from_raw_rows(
    order,
    headers,
    raw_rows,
    *,
    selected_row_numbers=None,
    template_id=None,
    mappings_payload=None,
    row_count_in_file=None,
):
    """Normalize manifest rows from in-memory raw data (no S3). ``row_count_in_file`` defaults to len(raw_rows)."""
    if not headers:
        return {
            'error': 'No manifest file uploaded for this order.',
        }
    if not raw_rows:
        return {
            'error': 'Manifest has no usable rows.',
        }

    sig, used_template, mappings = resolve_manifest_mappings(
        order=order,
        headers=headers,
        template_id=template_id,
        mappings_payload=mappings_payload,
    )

    selected_set = set(parse_id_list(selected_row_numbers))
    filtered_rows = raw_rows
    if selected_set:
        filtered_rows = [r for r in raw_rows if r['row_number'] in selected_set]

    normalized_rows = [
        normalize_row(raw=row['raw'], row_number=row['row_number'], column_mappings=mappings)
        for row in filtered_rows
    ]

    rc_file = row_count_in_file if row_count_in_file is not None else len(raw_rows)

    return {
        'headers': headers,
        'header_signature': sig,
        'used_template': used_template,
        'mappings': mappings,
        'row_count_in_file': rc_file,
        'rows_selected': len(filtered_rows),
        'normalized_rows': normalized_rows,
    }


def build_normalized_manifest_rows_from_staging(
    order,
    *,
    selected_row_numbers=None,
    template_id=None,
    mappings_payload=None,
):
    """Normalize from DB staging rows after ``ensure_preprocessing_raw_rows`` (single S3 parse)."""
    headers = list(order.manifest_headers or [])
    raw_rows = [
        {'row_number': r.row_number, 'raw': r.raw_row or {}}
        for r in PreprocessingRow.objects.filter(purchase_order=order).order_by('row_number')
    ]
    row_count = order.manifest_row_count
    if row_count is None:
        row_count = len(raw_rows)
    return build_normalized_manifest_rows_from_raw_rows(
        order,
        headers,
        raw_rows,
        selected_row_numbers=selected_row_numbers,
        template_id=template_id,
        mappings_payload=mappings_payload,
        row_count_in_file=row_count,
    )


def history_event_type_for_field(field_name):
    if field_name == 'status':
        return 'status_change'
    if field_name == 'price':
        return 'price_change'
    if field_name == 'condition':
        return 'condition_change'
    if field_name == 'location':
        return 'location_change'
    return 'note'


def apply_item_updates(item, updates):
    changed = []
    for field, value in updates.items():
        old_value = getattr(item, field)
        if old_value == value:
            continue
        setattr(item, field, value)
        changed.append((field, old_value, value))
    return changed


def build_order_delete_preview(order, include_items=True):
    """
    Summarize all order-owned artifacts that can be safely purged.

    Deletion sequence intentionally runs in reverse operational order:
    history/scans -> items -> batch/process artifacts -> manifest rows/file -> order.
    """
    base_items_qs = Item.objects.filter(purchase_order=order)
    if include_items:
        item_objects = list(base_items_qs.select_related('product').order_by('id'))
        items_preview = [
            {
                'id': item.id,
                'sku': item.sku,
                'title': item.product.title if item.product_id else 'Generic Product',
                'status': item.status,
            }
            for item in item_objects
        ]
        item_count = len(item_objects)
        sold_item_count = sum(1 for item in item_objects if item.status == 'sold')
    else:
        items_preview = []
        item_count = base_items_qs.count()
        sold_item_count = base_items_qs.filter(status='sold').count()

    item_history_count = ItemHistory.objects.filter(item__purchase_order=order).count()
    item_scan_count = ItemScanHistory.objects.filter(item__purchase_order=order).count()

    processing_batch_count = ProcessingBatch.objects.filter(purchase_order=order).count()
    manifest_row_count = ManifestRow.objects.filter(purchase_order=order).count()
    manifest_file_count = 1 if order.manifest_id else 0

    manifest_file_shared = False
    if order.manifest_id:
        manifest_file_shared = PurchaseOrder.objects.filter(
            manifest_id=order.manifest_id,
        ).exclude(id=order.id).exists()

    warnings = [
        (
            'Shared catalog artifacts are retained: Product, VendorProductRef, '
            'and CSVTemplate records are not deleted.'
        ),
    ]
    if sold_item_count:
        warnings.append(
            (
                f'{sold_item_count} sold item(s) are linked to this order and will be '
                'deleted if you continue.'
            ),
        )
    if manifest_file_shared:
        warnings.append(
            'Uploaded manifest file record is referenced by another order and will be retained.',
        )

    return {
        'order_id': order.id,
        'order_number': order.order_number,
        'steps': [
            {
                'key': 'item_history',
                'label': 'Delete Item History',
                'description': 'Remove all ItemHistory records linked to this order',
                'count': item_history_count,
            },
            {
                'key': 'item_scans',
                'label': 'Delete Item Scan History',
                'description': 'Remove all ItemScanHistory records linked to this order',
                'count': item_scan_count,
            },
            {
                'key': 'items',
                'label': 'Delete Items',
                'description': 'Remove all Item records created from this order',
                'count': item_count,
            },
            {
                'key': 'processing_batches',
                'label': 'Delete Processing Batches',
                'description': 'Remove all ProcessingBatch runs linked to this order',
                'count': processing_batch_count,
            },
            {
                'key': 'manifest_rows',
                'label': 'Delete Manifest Rows',
                'description': 'Remove all standardized ManifestRow records',
                'count': manifest_row_count,
            },
            {
                'key': 'manifest_file',
                'label': 'Delete Uploaded Manifest File',
                'description': (
                    'Remove uploaded S3File record and underlying manifest file'
                    if not manifest_file_shared
                    else 'Retained because it is referenced by another order'
                ),
                'count': manifest_file_count if not manifest_file_shared else 0,
            },
            {
                'key': 'order',
                'label': 'Delete Order',
                'description': 'Delete the purchase order record itself',
                'count': 1,
            },
        ],
        'items': items_preview,
        'warnings': warnings,
    }


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'code', 'contact_name']
    filterset_fields = ['vendor_type', 'is_active']
    ordering_fields = ['name', 'code', 'created_at']

    def perform_destroy(self, instance):
        """Soft delete — set is_active=False."""
        instance.is_active = False
        instance.save()


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'slug']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


def _annotate_purchase_order_stats(qs):
    """Annotate PO querysets so list/detail avoid N+1 on processing_stats and skip heavy prefetches."""
    return qs.annotate(
        _items_intake=Count('items', filter=Q(items__status='intake'), distinct=True),
        _items_processing=Count('items', filter=Q(items__status='processing'), distinct=True),
        _items_on_shelf=Count('items', filter=Q(items__status='on_shelf'), distinct=True),
        _items_sold=Count('items', filter=Q(items__status='sold'), distinct=True),
        _items_returned=Count('items', filter=Q(items__status='returned'), distinct=True),
        _items_scrapped=Count('items', filter=Q(items__status='scrapped'), distinct=True),
        _items_lost=Count('items', filter=Q(items__status='lost'), distinct=True),
        _manifest_row_count=Count('manifest_rows', distinct=True),
        _batch_groups_total=Count('batch_groups', distinct=True),
        _batch_groups_pending=Count(
            'batch_groups',
            filter=~Q(batch_groups__status='complete'),
            distinct=True,
        ),
    )


# Workspace + processing mutations load manifest rows via services.processing_workspace; prefetching every
# manifest_row on get_object() duplicate-loads giant manifests and can wedge SQLite (never finishes → no log line).
_PURCHASE_ORDER_SLIM_DETAIL_ACTIONS = frozenset(
    {
        'processing_workspace',
        'processing_row_detail',
        'processing_print_multiple_action',
        'processing_dispute_action',
        'processing_bulk_disposition_action',
        'build_processing_data',
        'processing_data_build',
        'processing_data_build_chunk',
        'clear_processing_data',
        # Check-in / processing mutations: get_object() only needs the PO row.
        # The annotated COUNT(DISTINCT) over items × manifest_rows × batch_groups
        # took ~20s on a large PO and made quick check-in look hung.
        'processing_row_check_in_action',
        'processing_check_in_together_action',
        'processing_assign_shared_product_action',
        'processing_collapse_rows_action',
        'processing_uncollapse_rows_action',
        'processing_break_apart_row_action',
        'processing_make_set_row_action',
        'processing_restart_row_action',
        'processing_check_in_batch_remap_product',
        'processing_check_in_batch_delete',
        'processing_check_in_batch_update',
        'processing_row_set_product_action',
        'processing_row_patch_action',
        'processing_add_item_action',
        'check_in_items',
        'ai_cleanup_rows',
        'ai_cleanup_status',
        'ai_cleanup_batch',
        'ai_cleanup_complete',
        'ai_cleanup_models',
    },
)

# Single-row PO reads/writes: no _annotate_purchase_order_stats (avoids multi-Count on items).
_PURCHASE_ORDER_HOT_PATH_ACTIONS = frozenset(
    {
        'detail_surface',
        'retrieve',
        'update',
        'partial_update',
        'processing_stats',
        'upload_manifest',
        'remove_manifest',
    },
)


def _purchase_order_hot_path_queryset():
    return PurchaseOrder.objects.select_related('vendor', 'created_by').all()


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = {
        'vendor': ['exact'],
        'status': ['exact', 'in'],
    }
    ordering_fields = ['ordered_date', 'expected_delivery', 'created_at']
    ordering = ['-ordered_date']

    def _filter_purchase_order_list_extras(self, queryset, request):
        """Date range + word-split search on denormalized search_text (list/summary only)."""
        qs = queryset
        da = request.query_params.get('ordered_date_after')
        db = request.query_params.get('ordered_date_before')
        if da:
            d = parse_date(da)
            if d:
                qs = qs.filter(ordered_date__gte=d)
        if db:
            d = parse_date(db)
            if d:
                qs = qs.filter(ordered_date__lte=d)
        raw = request.query_params.get('search') or request.query_params.get('q')
        if raw:
            words = [w for w in re.split(r'\s+', raw.strip()) if w]
            for w in words[:20]:
                qs = qs.filter(search_text__icontains=w.lower())
        return qs

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if getattr(self, 'action', None) in ('list', 'summary', 'for_receiving', 'preprocessing_queue'):
            qs = self._filter_purchase_order_list_extras(qs, self.request)
        return qs

    def get_queryset(self):
        act = getattr(self, 'action', None)
        if act in _PURCHASE_ORDER_HOT_PATH_ACTIONS:
            return _purchase_order_hot_path_queryset()
        if act in ('list', 'summary', 'for_receiving', 'preprocessing_queue'):
            # Whitelist big-box dashboard vendors. Prefer matching Vendor.name because
            # vendor_name_cache can be empty or stale (bulk inserts, legacy rows, failed saves).
            return PurchaseOrder.objects.filter(
                Q(vendor_name_cache__in=PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES)
                | Q(vendor__name__in=PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES),
            ).select_related('vendor')
        if getattr(self, 'action', None) in _PURCHASE_ORDER_SLIM_DETAIL_ACTIONS:
            return PurchaseOrder.objects.select_related('vendor', 'created_by').all()
        base = PurchaseOrder.objects.select_related('vendor', 'created_by').all()
        qs = _annotate_purchase_order_stats(base)
        # inventory_manifest_row_count uses _manifest_row_count annotation; prefetching all manifest rows
        # loads entire PO manifests on every GET /orders/{id}/ and worsens Heroku timeouts.
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        if self.action == 'for_receiving':
            return OrderForReceivingListSerializer
        if self.action == 'preprocessing_queue':
            return PreprocessingQueueOrderSerializer
        if self.action == 'detail_surface':
            return PurchaseOrderDetailSurfaceSerializer
        if self.action == 'retrieve':
            return PurchaseOrderDetailSerializer
        if self.action in ('update', 'partial_update'):
            return PurchaseOrderSerializer
        return PurchaseOrderSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()
        return Response(PurchaseOrderDetailSurfaceSerializer(instance).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='preprocessing-queue')
    def preprocessing_queue(self, request):
        """Orders eligible for preprocessing: manifest present, not cancelled, PO not intake-finalized.

        Ordering uses ``PurchaseOrder.preprocess_status`` rank (furthest along first), then ``-updated_at``,
        then ``-ordered_date``. Row counts use ``manifest_row_count`` when set, else a staging-row count
        annotation.
        """
        _preprocess_queue_rank = Case(
            When(preprocess_status='finalized', then=Value(5)),
            When(preprocess_status='reviewing', then=Value(4)),
            When(preprocess_status='cleaned', then=Value(3)),
            When(preprocess_status='standardized', then=Value(2)),
            When(preprocess_status='not_started', then=Value(1)),
            default=Value(0),
            output_field=IntegerField(),
        )
        qs = (
            self.filter_queryset(self.get_queryset())
            .filter(manifest_id__isnull=False)
            .exclude(status='cancelled')
            .filter(finalized_at__isnull=True)
            .annotate(_preprocessing_staging_count=Count('preprocessing_rows'))
            .annotate(_preprocess_queue_rank=_preprocess_queue_rank)
            .order_by('-_preprocess_queue_rank', '-updated_at', '-ordered_date')
        )
        serializer = PreprocessingQueueOrderSerializer(qs, many=True)
        return Response({'results': serializer.data})

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Cheap aggregates for KPI cards; uses same filters as the list (no joins)."""
        qs = self.filter_queryset(self.get_queryset()).order_by()
        agg = qs.aggregate(
            n=Count('pk'),
            tc=Sum('total_cost'),
            rv=Sum('retail_value'),
            ic=Sum('item_count'),
        )
        total_orders = agg['n'] or 0
        tc = agg['tc']
        rv = agg['rv']
        ic = agg['ic']
        if tc is None:
            tc = Decimal('0')
        if rv is None:
            rv = Decimal('0')
        items_received = ic if ic is not None else 0
        delivered_count = qs.filter(status='delivered').count()
        margin_percent = None
        if rv > 0:
            margin_percent = float(((rv - tc) / rv * Decimal('100')).quantize(Decimal('0.01')))
        return Response({
            'total_orders': total_orders,
            'total_cost': str(tc.quantize(Decimal('0.01'))),
            'retail_value': str(rv.quantize(Decimal('0.01'))),
            'items_received': items_received,
            'delivered_count': delivered_count,
            'margin_percent': margin_percent,
        })

    def perform_create(self, serializer):
        from apps.inventory.services.po_defaults import get_default_po_est_shrink

        extra = {
            'created_by': self.request.user,
            'est_shrink': get_default_po_est_shrink(),
        }
        if not serializer.validated_data.get('order_number'):
            extra['order_number'] = PurchaseOrder.generate_order_number()
        if 'ordered_date' not in serializer.validated_data:
            extra['ordered_date'] = timezone.now().date()
        serializer.save(**extra)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """Mark a PO as paid."""
        order = self.get_object()
        order.status = 'paid'
        order.paid_date = request.data.get('paid_date', timezone.now().date())
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='revert-paid')
    def revert_paid(self, request, pk=None):
        """Revert a PO from paid back to ordered."""
        order = self.get_object()
        order.status = 'ordered'
        order.paid_date = None
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='mark-shipped')
    def mark_shipped(self, request, pk=None):
        """Mark a PO as shipped."""
        order = self.get_object()
        order.status = 'shipped'
        order.shipped_date = request.data.get('shipped_date', timezone.now().date())
        if request.data.get('expected_delivery'):
            order.expected_delivery = request.data['expected_delivery']
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='revert-shipped')
    def revert_shipped(self, request, pk=None):
        """Revert a PO from shipped back to paid (or ordered)."""
        order = self.get_object()
        order.shipped_date = None
        order.expected_delivery = None
        order.status = 'paid' if order.paid_date else 'ordered'
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        """Mark a PO as delivered. Auto-builds check-in queue if manifest rows exist."""
        order = self.get_object()
        delivered_date = request.data.get('delivered_date', timezone.now().date())
        extras = _finalize_purchase_order_deliver(order, request.user, delivered_date)
        data = PurchaseOrderSerializer(order).data
        data.update(extras)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='revert-delivered')
    def revert_delivered(self, request, pk=None):
        """Revert a PO from delivered back to paid (or ordered if no paid_date)."""
        order = self.get_object()
        order.delivered_date = None
        order.status = 'paid' if order.paid_date else 'ordered'
        order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['get'], url_path='detail-surface')
    def detail_surface(self, request, pk=None):
        order = self.get_object()
        return Response(PurchaseOrderDetailSurfaceSerializer(order).data)

    @action(detail=True, methods=['get'], url_path='processing-stats')
    def processing_stats(self, request, pk=None):
        from apps.inventory.services.purchase_order_processing_stats import compute_processing_stats

        order = self.get_object()
        return Response(compute_processing_stats(order.pk))

    @action(detail=True, methods=['post'], url_path='upload-manifest')
    def upload_manifest(self, request, pk=None):
        """Upload a raw CSV/TSV manifest — S3 storage plus small JSON preview on the order only."""
        order = self.get_object()
        if order.finalized_at:
            return Response(
                {
                    'detail': 'Preprocessing is finalized — rewind finalize (timeline) before re-uploading a manifest.',
                    'code': 'finalized',
                },
                status=status.HTTP_409_CONFLICT,
            )
        file = request.FILES.get('file')
        if not file:
            return Response(
                {'detail': 'No file provided.', 'code': 'missing_file'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lower_name = (file.name or '').lower()
        if not (lower_name.endswith('.csv') or lower_name.endswith('.tsv')):
            return Response(
                {'detail': 'Upload a .csv or .tsv file.', 'code': 'invalid_extension'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw = file.read()
        try:
            content = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response(
                {
                    'detail': 'Could not decode file as UTF-8. Save as CSV/TSV (UTF-8).',
                    'code': 'decode_error',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        head = content[:8192]
        nl = head.find('\n')
        line1 = head[:nl] if nl >= 0 else head
        delimiter = '\t' if line1.count('\t') > line1.count(',') else ','
        reader = csv.reader(io.StringIO(content), delimiter=delimiter)
        headers = next(reader, [])
        if not headers or not any(str(h).strip() for h in headers):
            return Response(
                {'detail': 'File has no header row.', 'code': 'empty_csv'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sig = header_signature(headers)

        rows_data = []
        for i, row in enumerate(reader, start=1):
            if not any(row):
                continue
            rows_data.append({
                'row_number': i,
                'raw': dict(zip(headers, row)),
            })

        s3_key = f'manifests/orders/{order.id}/{file.name}'
        file.seek(0)
        try:
            saved_path = default_storage.save(s3_key, file)
        except Exception as e:
            logger.exception('upload_manifest storage save failed order=%s', order.pk)
            return Response(
                {
                    'detail': f'Could not save manifest file to storage: {e}',
                    'code': 'storage_error',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        preview_data = {
            'headers': headers,
            'delimiter': delimiter,
            'rows': rows_data[:10],
        }

        old_manifest = order.manifest
        try:
            with transaction.atomic():
                s3_file = S3File.objects.create(
                    key=saved_path,
                    filename=file.name,
                    size=file.size,
                    content_type=file.content_type or 'text/csv',
                    uploaded_by=request.user,
                )
                order.manifest = s3_file
                order.manifest_preview = preview_data
                order.manifest_filename = s3_file.filename
                order.manifest_uploaded_at = s3_file.uploaded_at
                order.manifest_row_count = len(rows_data)
                order.manifest_category_count = compute_category_count(headers, rows_data)
                order.manifest_signature = sig
                order.manifest_headers = list(headers)
                # A new manifest restarts the pipeline: staging is deleted below, so the
                # flow flags must reset too — otherwise the order claims standardized/
                # cleaned with zero staging rows (stale-state class bug).
                order.preprocess_status = 'not_started'
                order.standardized_at = None
                order.ai_cleaned_at = None
                order.review_saved_at = None
                order.save(
                    update_fields=[
                        'manifest',
                        'manifest_preview',
                        'manifest_filename',
                        'manifest_uploaded_at',
                        'manifest_row_count',
                        'manifest_category_count',
                        'manifest_signature',
                        'manifest_headers',
                        'preprocess_status',
                        'standardized_at',
                        'ai_cleaned_at',
                        'review_saved_at',
                        'updated_at',
                    ],
                )
                PreprocessingRow.objects.filter(purchase_order=order).delete()
        except Exception as e:
            logger.exception('upload_manifest DB save failed order=%s', order.pk)
            try:
                default_storage.delete(saved_path)
            except Exception:
                pass
            return Response(
                {'detail': f'Could not record manifest: {e}', 'code': 'save_error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if old_manifest:
            old_key = old_manifest.key
            try:
                old_manifest.delete()
            except Exception:
                logger.warning('upload_manifest failed to delete old S3File', exc_info=True)
            try:
                default_storage.delete(old_key)
            except Exception:
                pass

        order.refresh_from_db()
        return Response(PurchaseOrderDetailSurfaceSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='remove-manifest')
    def remove_manifest(self, request, pk=None):
        """Clear raw manifest file + preview JSON; drops preprocessing staging if present."""
        from apps.inventory.services.manifest_remove import remove_manifest_database

        order = self.get_object()
        try:
            old_key = remove_manifest_database(order)
        except Exception as e:
            logger.exception('remove_manifest failed order=%s', order.pk)
            return Response(
                {'detail': str(e), 'code': 'save_error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if old_key is None:
            return Response(
                {'detail': 'No manifest file on this order.', 'code': 'no_manifest'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            default_storage.delete(old_key)
        except Exception:
            logger.warning('remove_manifest failed to delete storage object', exc_info=True)
        order.refresh_from_db()
        return Response(PurchaseOrderDetailSurfaceSerializer(order).data)

    @action(detail=True, methods=['get'], url_path='undo-preview')
    def undo_preview(self, request, pk=None):
        """Non-destructive preview for intake undo (staging-first)."""
        from apps.inventory.services.intake_undo import compute_undo_preview

        order = self.get_object()
        stage = str(request.query_params.get('to_stage') or '').strip()
        return Response(compute_undo_preview(order, stage))

    @action(detail=True, methods=['post'], url_path='undo')
    def undo(self, request, pk=None):
        """Apply intake undo rewind; returns detail surface on success."""
        from apps.inventory.services.intake_undo import UndoNotAllowed, apply_undo

        order = self.get_object()
        stage = str(request.data.get('to_stage') or '').strip()
        try:
            apply_undo(order, stage)
        except UndoNotAllowed as e:
            return Response(
                {'detail': e.message, 'code': 'undo_blocked'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.refresh_from_db()
        return Response(PurchaseOrderDetailSurfaceSerializer(order).data)

    @action(detail=False, methods=['get'], url_path='for-receiving')
    def for_receiving(self, request):
        raw_page = request.query_params.get('page') or 1
        raw_page_size = request.query_params.get('page_size') or 25
        try:
            page_num = max(1, int(raw_page))
        except (TypeError, ValueError):
            page_num = 1
        try:
            page_size = max(1, min(100, int(raw_page_size)))
        except (TypeError, ValueError):
            page_size = 25

        today = timezone.localdate()

        qs = (
            self.filter_queryset(self.get_queryset())
            .exclude(status__in=['delivered', 'complete', 'cancelled'])
            .only(
                'id',
                'vendor_id',
                'vendor_name_cache',
                'vendor_code_cache',
                'order_number',
                'status',
                'ordered_date',
                'expected_delivery',
                'delivered_date',
                'condition',
                'description',
                'item_count',
                'pallet_count',
                'total_cost',
                'retail_value',
                'manifest_id',
                'receiving_status',
                'receiving_started_at',
                'receiving_done_at',
                'created_at',
                'updated_at',
            )
            .annotate(
                _ed_epoch=Extract('expected_delivery', 'epoch'),
                _od_epoch=Extract('ordered_date', 'epoch'),
                _recv_bucket=Case(
                    When(expected_delivery__isnull=True, then=Value(2)),
                    When(expected_delivery__gte=today, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                ),
                _recv_sort_primary=Case(
                    When(
                        Q(expected_delivery__isnull=False) & Q(expected_delivery__gte=today),
                        then=Cast(F('_ed_epoch'), FloatField()),
                    ),
                    When(
                        Q(expected_delivery__isnull=False) & Q(expected_delivery__lt=today),
                        then=ExpressionWrapper(-F('_ed_epoch'), output_field=FloatField()),
                    ),
                    default=ExpressionWrapper(-F('_od_epoch'), output_field=FloatField()),
                    output_field=FloatField(),
                ),
            )
            .order_by('_recv_bucket', '_recv_sort_primary', '-ordered_date', '-id')
        )
        offset = (page_num - 1) * page_size
        rows = list(qs[offset:offset + page_size + 1])
        has_next = len(rows) > page_size
        rows = rows[:page_size]

        flags = {}
        if rows:
            recs = Receiving.objects.filter(
                purchase_order_id__in=[row.id for row in rows],
            ).only('purchase_order_id', 'completed_at')
            flags = {
                rec.purchase_order_id: {
                    'draft': rec.completed_at is None,
                    'complete': rec.completed_at is not None,
                }
                for rec in recs
            }
        for row in rows:
            row._receiving_flags = flags.get(row.id, {'draft': False, 'complete': False})

        ser = OrderForReceivingListSerializer(
            rows,
            many=True,
            context={'request': request},
        )
        return Response({
            'count': offset + len(rows) + (1 if has_next else 0),
            'next': page_num + 1 if has_next else None,
            'previous': page_num - 1 if page_num > 1 else None,
            'results': ser.data,
        })

    @action(detail=True, methods=['get', 'patch'], url_path='receiving')
    def receiving(self, request, pk=None):
        order = self.get_object()
        rec = get_or_create_receiving(order, request.user)
        rec = _receiving_detail_queryset().get(pk=rec.pk)
        if request.method == 'GET':
            return Response(ReceivingDetailSerializer(rec).data)
        ser = ReceivingDraftPatchSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        payload = ser.validated_data
        if not payload:
            rec = _receiving_detail_queryset().get(pk=rec.pk)
            return Response(ReceivingDetailSerializer(rec).data)
        try:
            patch_receiving_draft(rec, payload)
        except ValueError as e:
            if str(e) == 'receiving_already_complete':
                return Response(
                    {'detail': 'Receiving is already complete.', 'code': 'receiving_complete'},
                    status=status.HTTP_409_CONFLICT,
                )
            raise
        rec = _receiving_detail_queryset().get(pk=rec.pk)
        return Response(ReceivingDetailSerializer(rec).data)

    @action(detail=True, methods=['post'], url_path='receiving/photos')
    def receiving_upload_photo(self, request, pk=None):
        order = self.get_object()
        rec = get_or_create_receiving(order, request.user)
        if rec.completed_at is not None:
            return Response(
                {'detail': 'Receiving is complete; photos are locked.', 'code': 'receiving_complete'},
                status=status.HTTP_409_CONFLICT,
            )
        kind = request.data.get('kind')
        if kind not in ('bol', 'truck', 'pallet_side'):
            return Response(
                {'detail': 'kind must be bol, truck, or pallet_side.', 'code': 'invalid_kind'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'No file.', 'code': 'missing_file'}, status=status.HTTP_400_BAD_REQUEST)
        cid_uuid = None
        cid_raw = request.data.get('client_photo_id')
        if cid_raw not in (None, ''):
            try:
                cid_uuid = uuid.UUID(str(cid_raw))
            except ValueError:
                return Response(
                    {'detail': 'client_photo_id must be a UUID.', 'code': 'invalid_client_photo_id'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            dup = (
                ReceivingAttachment.objects.filter(receiving=rec, client_photo_id=cid_uuid)
                .select_related('s3_file')
                .first()
            )
            if dup:
                return Response(ReceivingAttachmentSerializer(dup).data)
        pallet_number = None
        side = ''
        if kind == 'pallet_side':
            try:
                pallet_number = int(request.data.get('pallet_number'))
            except (TypeError, ValueError):
                pallet_number = None
            side = str(request.data.get('side') or '').strip().lower()
            allowed_sides = {c[0] for c in ReceivingAttachment.SIDE_CHOICES}
            if pallet_number is None or pallet_number < 1 or pallet_number > 99:
                return Response(
                    {'detail': 'pallet_number (1–99) is required for pallet_side.', 'code': 'invalid_pallet'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if side not in allowed_sides:
                return Response(
                    {'detail': 'side must be one of front, right, back, left.', 'code': 'invalid_side'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        ext = '.jpg'
        ctype = getattr(file, 'content_type', None) or 'image/jpeg'
        path = f'receiving/orders/{order.id}/{uuid.uuid4().hex}{ext}'
        try:
            saved_path = default_storage.save(path, file)
        except Exception as e:
            logger.exception('receiving_upload_photo storage failed order=%s', order.pk)
            return Response(
                {'detail': f'Could not save file: {e}', 'code': 'storage_error'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        with transaction.atomic():
            sf = S3File.objects.create(
                key=saved_path,
                filename=file.name or path.split('/')[-1],
                size=getattr(file, 'size', 0),
                content_type=ctype,
                uploaded_by=request.user,
            )
            att_kwargs = {'receiving': rec, 's3_file': sf, 'kind': kind}
            if cid_uuid is not None:
                att_kwargs['client_photo_id'] = cid_uuid
            if kind == 'pallet_side':
                att = ReceivingAttachment.objects.create(
                    **att_kwargs,
                    pallet_number=pallet_number,
                    side=side,
                )
            else:
                att = ReceivingAttachment.objects.create(**att_kwargs)
            Receiving.objects.filter(pk=rec.pk).update(
                draft_version=F('draft_version') + 1,
                updated_at=timezone.now(),
            )
        att = ReceivingAttachment.objects.filter(pk=att.pk).select_related('s3_file').first()
        return Response(ReceivingAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'receiving/photos/(?P<photo_id>[0-9]+)')
    def receiving_delete_photo(self, request, pk=None, photo_id=None):
        order = self.get_object()
        rec = Receiving.objects.filter(purchase_order=order).first()
        if rec is None:
            return Response(
                {'detail': 'No receiving record.', 'code': 'no_receiving'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            pid = int(photo_id)
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid photo id.', 'code': 'invalid_id'}, status=status.HTTP_400_BAD_REQUEST)
        att = rec.attachments.filter(pk=pid).select_related('s3_file').first()
        if att is None:
            return Response({'detail': 'Photo not found.', 'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if rec.completed_at is not None:
            return Response(
                {'detail': 'Receiving is complete; photos are locked.', 'code': 'receiving_complete'},
                status=status.HTTP_409_CONFLICT,
            )
        s3_obj = att.s3_file
        key = s3_obj.key
        with transaction.atomic():
            att.delete()
            s3_obj.delete()
        try:
            default_storage.delete(key)
        except Exception:
            logger.warning('receiving_delete_photo storage delete failed', exc_info=True)
        Receiving.objects.filter(pk=rec.pk).update(
            draft_version=F('draft_version') + 1,
            updated_at=timezone.now(),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='receiving/complete')
    def receiving_complete(self, request, pk=None):
        order = self.get_object()
        if order.status == 'cancelled':
            return Response(
                {'detail': 'Order is not eligible for receiving.', 'code': 'ineligible'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rec = get_or_create_receiving(order, request.user)
        rec = _receiving_detail_queryset().get(pk=rec.pk)
        if rec.completed_at is not None:
            return Response(
                {'detail': 'Receiving already completed.', 'code': 'receiving_complete'},
                status=status.HTTP_409_CONFLICT,
            )
        reasons = validate_complete(rec)
        if reasons:
            return Response(
                {'detail': reasons, 'code': 'receiving_incomplete'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        delivered_date = rec.received_date or now.date()
        with transaction.atomic():
            order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
            rec = Receiving.objects.select_for_update().get(pk=rec.pk)
            rec.completed_at = now
            if not rec.end_time:
                rec.end_time = now.time().replace(microsecond=0)
            rec.save(update_fields=['completed_at', 'end_time', 'updated_at'])
            extras = _finalize_purchase_order_deliver(
                order,
                request.user,
                delivered_date,
                build_check_in_queue=False,
            )
            if not order.receiving_started_at:
                order.receiving_started_at = rec.created_at or now
            order.receiving_status = 'done'
            order.receiving_done_at = now
            order.save(
                update_fields=[
                    'receiving_status',
                    'receiving_done_at',
                    'receiving_started_at',
                    'updated_at',
                ],
            )
        order.refresh_from_db()
        rec = _receiving_detail_queryset().get(pk=rec.pk)
        data = ReceivingDetailSerializer(rec).data
        data['order'] = PurchaseOrderSerializer(order).data
        data.update(extras)
        return Response(data)

    @action(detail=True, methods=['get', 'post'], url_path='disputes')
    def order_disputes(self, request, pk=None):
        from apps.inventory.services.disputes import create_dispute, list_disputes

        order = self.get_object()
        if request.method == 'GET':
            kind = request.query_params.get('kind')
            st = request.query_params.get('status')
            rows = list_disputes(order, kind=kind or None, status=st or None)
            return Response(DisputeSerializer(rows, many=True).data)
        ser = DisputeCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        body = ser.validated_data
        if body.get('subject_receiving') and body['subject_receiving'].purchase_order_id != order.id:
            return Response({'detail': 'Receiving subject does not match order.'}, status=400)
        if body.get('subject_pallet') and body['subject_pallet'].receiving.purchase_order_id != order.id:
            return Response({'detail': 'Pallet subject does not match order.'}, status=400)
        if body.get('subject_manifest_row') and body['subject_manifest_row'].purchase_order_id != order.id:
            return Response({'detail': 'Manifest row subject does not match order.'}, status=400)
        if body.get('subject_processing_row') and body['subject_processing_row'].purchase_order_id != order.id:
            return Response({'detail': 'Processing row subject does not match order.'}, status=400)
        if body.get('subject_item') and body['subject_item'].purchase_order_id != order.id:
            return Response({'detail': 'Item subject does not match order.'}, status=400)
        d = create_dispute(
            order=order,
            kind=body['kind'],
            title=body['title'],
            description=body.get('description') or '',
            user=request.user,
            subject_receiving_id=body['subject_receiving'].pk if body.get('subject_receiving') else None,
            subject_pallet_id=body['subject_pallet'].pk if body.get('subject_pallet') else None,
            subject_manifest_row_id=body['subject_manifest_row'].pk if body.get('subject_manifest_row') else None,
            subject_processing_row_id=body['subject_processing_row'].pk if body.get('subject_processing_row') else None,
            subject_item_id=body['subject_item'].pk if body.get('subject_item') else None,
            payload=body.get('payload'),
        )
        return Response(DisputeSerializer(d).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path=r'disputes/(?P<dispute_id>[0-9]+)')
    def order_dispute_detail(self, request, pk=None, dispute_id=None):
        from apps.inventory.services.disputes import cancel_dispute, resolve_dispute

        order = self.get_object()
        try:
            did = int(dispute_id)
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid dispute id.'}, status=status.HTTP_400_BAD_REQUEST)
        dispute = Dispute.objects.filter(purchase_order=order, pk=did).first()
        if dispute is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        ser = DisputePatchSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        new_status = data.get('status')

        if 'title' in data or 'description' in data:
            if 'title' in data and data['title'] is not None:
                dispute.title = str(data['title'])[:300]
            if 'description' in data:
                dispute.description = str(data['description'] or '')
            dispute.save(update_fields=['title', 'description'])

        if new_status == Dispute.STATUS_RESOLVED:
            dispute = resolve_dispute(dispute=dispute, user=request.user)
        elif new_status == Dispute.STATUS_CANCELLED:
            dispute = cancel_dispute(dispute=dispute, user=request.user)

        dispute.refresh_from_db()
        return Response(DisputeSerializer(dispute).data)

    @action(detail=True, methods=['post'], url_path='process-manifest')
    def process_manifest(self, request, pk=None):
        """Standardize manifest rows: create/update ManifestRow spine and PreprocessingRow overlays."""
        order = self.get_object()
        if not order.manifest_id:
            return Response(
                {'detail': 'Upload a manifest file first.', 'code': 'no_manifest'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ensure_preprocessing_raw_rows(order)
        if not PreprocessingRow.objects.filter(purchase_order=order).exists():
            return Response(
                {'detail': 'Manifest file has no data rows.', 'code': 'empty_manifest'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.finalized_at:
            return Response(
                {'detail': 'Preprocessing is finalized. Reset preprocessing to edit standardization.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = request.data.get('rows')
        selected_row_numbers = request.data.get('selected_row_numbers') or []
        mapping_payload = (
            request.data.get('standard_mappings')
            or request.data.get('column_mappings')
            or []
        )
        template_id = request.data.get('template_id')
        save_template = bool(request.data.get('save_template', False))
        save_template_as_new = bool(request.data.get('save_template_as_new'))
        template_name = str(request.data.get('template_name') or '').strip()
        header_sig = None
        row_count_in_file = None
        rows_selected = None
        used_template = None
        normalized_mappings = normalize_standard_mappings(mapping_payload)

        if rows:
            normalized_rows = rows
        else:
            prepared = build_normalized_manifest_rows_from_staging(
                order,
                selected_row_numbers=selected_row_numbers,
                template_id=template_id,
                mappings_payload=mapping_payload,
            )
            if prepared.get('error'):
                return Response(
                    {'detail': prepared['error']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            header_sig = prepared['header_signature']
            used_template = prepared['used_template']
            normalized_mappings = prepared['mappings']
            row_count_in_file = prepared['row_count_in_file']
            rows_selected = prepared['rows_selected']
            normalized_rows = prepared['normalized_rows']

            if save_template and normalized_mappings:
                default_template_name = (
                    f'{order.vendor.code} Standard Manifest {timezone.now().date().isoformat()}'
                )
                if save_template_as_new:
                    if not template_name:
                        return Response(
                            {
                                'detail': 'template_name is required when save_template_as_new is true.',
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    used_template = CSVTemplate.objects.create(
                        vendor=order.vendor,
                        name=template_name,
                        header_signature=header_sig,
                        column_mappings=normalized_mappings,
                        is_default=False,
                    )
                elif used_template:
                    used_template.name = template_name or used_template.name
                    used_template.header_signature = header_sig
                    used_template.column_mappings = normalized_mappings
                    used_template.save(
                        update_fields=['name', 'header_signature', 'column_mappings'],
                    )
                else:
                    used_template = CSVTemplate.objects.create(
                        vendor=order.vendor,
                        name=template_name or default_template_name,
                        header_signature=header_sig,
                        column_mappings=normalized_mappings,
                        is_default=False,
                    )

        if not normalized_rows:
            return Response(
                {'detail': 'No rows selected for processing.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staging_by_rn = {
            r.row_number: r
            for r in PreprocessingRow.objects.filter(purchase_order=order)
        }
        to_update = []
        manifest_rows_upserted = 0
        now = timezone.now()
        with transaction.atomic():
            bulk_clear_preprocess_ai_and_final_layers(
                PreprocessingRow.objects.filter(purchase_order=order),
            )

            for row_data in normalized_rows:
                rn = int(row_data.get('row_number') or 0)
                sr = staging_by_rn.get(rn)
                if not sr:
                    continue

                proposed_price = parse_decimal(row_data.get('proposed_price'))
                final_price = parse_decimal(row_data.get('final_price'))
                pricing_stage = str(row_data.get('pricing_stage') or 'unpriced')
                if pricing_stage not in dict(ManifestRow.PRICING_STAGE_CHOICES):
                    pricing_stage = 'unpriced'
                if final_price is not None:
                    pricing_stage = 'final'
                elif proposed_price is not None and pricing_stage == 'unpriced':
                    pricing_stage = 'draft'
                base_retail = parse_decimal(row_data.get('unit_retail'))
                if base_retail is None:
                    base_retail = parse_decimal(row_data.get('retail_value'))
                base_cost = order.compute_item_cost(base_retail)
                pricing_notes_val = str(row_data.get('pricing_notes') or '')
                if proposed_price is None and final_price is None and base_cost is not None:
                    proposed_price = (base_cost * Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    pricing_stage = 'draft'
                    pricing_notes_val = pricing_notes_val or 'Initial ideal price (2x allocated base cost)'

                manifest_row, _created = upsert_manifest_row_from_standardized_data(
                    order,
                    row_data,
                    pricing={
                        'unit_retail': base_retail,
                        'proposed_price': proposed_price,
                        'final_price': final_price,
                        'pricing_stage': pricing_stage,
                        'pricing_notes': pricing_notes_val,
                    },
                )
                manifest_rows_upserted += 1

                sr.manifest_row = manifest_row
                sr.quantity = row_data.get('quantity', 1)
                sr.standard_brand = row_data.get('brand', '')
                sr.standard_model = row_data.get('model', '')
                sr.standard_condition = row_data.get('condition', '')
                sr.unit_retail = base_retail
                sr.proposed_price = proposed_price
                sr.final_price = final_price
                sr.pricing_stage = pricing_stage
                sr.pricing_notes = pricing_notes_val
                if isinstance(row_data.get('identifiers'), dict):
                    sr.standard_identifiers = row_data['identifiers']
                if isinstance(row_data.get('taxonomy'), dict):
                    sr.standard_taxonomy = row_data['taxonomy']
                if isinstance(row_data.get('specifications'), dict):
                    sr.standard_specifications = row_data['specifications']
                if isinstance(row_data.get('tracking'), dict):
                    sr.standard_tracking = row_data['tracking']
                stags = row_data.get('search_tags')
                if isinstance(stags, list):
                    sr.standard_search_tags = [str(x).strip() for x in stags if str(x).strip()]
                elif stags is not None:
                    sr.standard_search_tags = slugify_formula_search_tags(str(stags))
                sr.standard_notes = row_data.get('notes', '')
                sr.updated_at = now
                to_update.append(sr)

            if to_update:
                PreprocessingRow.objects.bulk_update(
                    to_update,
                    [
                        'quantity',
                        'manifest_row',
                        'standard_brand',
                        'standard_model',
                        'standard_condition',
                        'unit_retail',
                        'proposed_price',
                        'final_price',
                        'pricing_stage',
                        'pricing_notes',
                        'standard_identifiers',
                        'standard_taxonomy',
                        'standard_specifications',
                        'standard_tracking',
                        'standard_search_tags',
                        'standard_notes',
                        'updated_at',
                    ],
                )

            if used_template:
                order.template = used_template
                order.template_name_cache = used_template.name or ''
                order.template_header_signature_cache = used_template.header_signature or ''
                order.template_column_mappings_cache = used_template.column_mappings or []
            else:
                order.template = None
                order.template_name_cache = ''
                order.template_header_signature_cache = ''
                order.template_column_mappings_cache = []
            order.standardization_formulas = {'mappings': normalized_mappings}
            order.standardized_at = now
            order.preprocess_status = 'standardized'
            order.save(
                update_fields=[
                    'template',
                    'template_name_cache',
                    'template_header_signature_cache',
                    'template_column_mappings_cache',
                    'standardization_formulas',
                    'standardized_at',
                    'preprocess_status',
                    'updated_at',
                ],
            )

        response_data = {
            'rows_created': len(to_update),
            'order_status': order.status,
            'standard_columns': manifest_standard_flat_columns(),
            'mappings_used': normalized_mappings,
            'products_created': 0,
            'items_created': 0,
            'items_updated': 0,
            'item_count': order.item_count,
            'manifest_rows_upserted': manifest_rows_upserted,
        }
        if row_count_in_file is not None:
            response_data['row_count_in_file'] = row_count_in_file
        if rows_selected is not None:
            response_data['rows_selected'] = rows_selected
        if header_sig:
            response_data['header_signature'] = header_sig
        if used_template:
            response_data['template_id'] = used_template.id
            response_data['template_name'] = used_template.name
        return Response(response_data)

    @action(detail=True, methods=['post'], url_path='preview-standardize')
    def preview_standardize(self, request, pk=None):
        """Preview standardized manifest output without writing ManifestRows."""
        order = self.get_object()
        rows = request.data.get('rows')
        selected_row_numbers = request.data.get('selected_row_numbers') or []
        template_id = request.data.get('template_id')
        mapping_payload = (
            request.data.get('standard_mappings')
            or request.data.get('column_mappings')
            or []
        )
        preview_limit = parse_int(request.data.get('preview_limit'), default=50)
        preview_limit = max(1, min(preview_limit, 250))
        search_term = str(request.data.get('search_term') or '').strip()

        if rows:
            normalized_rows = rows
            header_sig = None
            used_template = None
            row_count_in_file = len(rows)
            rows_selected = len(rows)
            mappings_used = normalize_standard_mappings(mapping_payload)
        else:
            if not order.manifest_id:
                return Response(
                    {'detail': 'Upload a manifest file first.', 'code': 'no_manifest'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            hdrs, raw_sample = raw_rows_from_manifest_preview(order)
            if not hdrs or not raw_sample:
                return Response(
                    {'detail': 'manifest_preview sample missing; re-upload the manifest.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            row_count_uf = order.manifest_row_count
            if row_count_uf is None:
                row_count_uf = len(raw_sample)
            prepared = build_normalized_manifest_rows_from_raw_rows(
                order,
                hdrs,
                raw_sample,
                selected_row_numbers=selected_row_numbers,
                template_id=template_id,
                mappings_payload=mapping_payload,
                row_count_in_file=row_count_uf,
            )
            if prepared.get('error'):
                return Response(
                    {'detail': prepared['error']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            normalized_rows = prepared['normalized_rows']
            header_sig = prepared['header_signature']
            used_template = prepared['used_template']
            row_count_in_file = prepared['row_count_in_file']
            rows_selected = prepared['rows_selected']
            mappings_used = prepared['mappings']

        if search_term:
            normalized_rows = [
                row for row in normalized_rows
                if normalized_row_matches_search(row, search_term)
            ]

        if not normalized_rows:
            return Response(
                {'detail': 'No rows selected for preview.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_data = {
            'row_count_in_file': row_count_in_file,
            'rows_selected': len(normalized_rows),
            'preview_count': min(preview_limit, len(normalized_rows)),
            'normalized_preview': normalized_rows[:preview_limit],
            'standard_columns': manifest_standard_flat_columns(),
            'available_functions': MANIFEST_FUNCTION_OPTIONS,
            'mappings_used': mappings_used,
            'search_term': search_term,
        }
        if header_sig:
            response_data['header_signature'] = header_sig
        if used_template:
            response_data['template_id'] = used_template.id
            response_data['template_name'] = used_template.name
        return Response(response_data)

    @action(detail=True, methods=['post'], url_path='suggest-formulas')
    def suggest_formulas(self, request, pk=None):
        """Suggest formula mappings for standard manifest fields (provider via llm_router)."""
        import json as json_lib

        from apps.core.services.llm_router import (
            LLMConfigError,
            llm_chat_tool_input,
            suggest_mappings_tools,
        )

        order = self.get_object()
        template_id = request.data.get('template_id')

        preview = order.manifest_preview or {}
        headers_list = list(preview.get('headers') or [])
        if not headers_list:
            return Response(
                {'error': 'manifest_preview missing or has no headers; re-upload the manifest.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows_preview = preview.get('rows') or []
        sample_rows = []
        for r in rows_preview[:10]:
            if not isinstance(r, dict):
                continue
            sample_rows.append({
                'row_number': r.get('row_number'),
                'raw': r.get('raw') if isinstance(r.get('raw'), dict) else {},
            })

        prior_templates = []
        if template_id:
            tpl = CSVTemplate.objects.filter(id=template_id, vendor=order.vendor).first()
            if tpl:
                prior_templates.append({'name': tpl.name, 'mappings': tpl.column_mappings})
        if not prior_templates:
            sig = str(preview.get('signature') or '') or header_signature(headers_list)
            for tpl in CSVTemplate.objects.filter(vendor=order.vendor, header_signature=sig)[:3]:
                prior_templates.append({'name': tpl.name, 'mappings': tpl.column_mappings})

        standard_fields_desc = []
        for col in manifest_standard_flat_columns():
            standard_fields_desc.append(
                f"- {col['key']}: {col['label']} ({'required' if col['required'] else 'optional'})",
            )
        bucket_lines = []
        for bid, b in manifest_field_metadata_payload()['buckets'].items():
            sk = ', '.join(b['suggested_keys']) if b['suggested_keys'] else '(none listed — any ^[a-z][a-z0-9_]*$ sub-key)'
            bucket_lines.append(
                f'  - {bid}.<subkey>: {b["label"]}; suggested_keys (hints only): {sk}',
            )

        system_prompt = (
            'You are an assistant for a thrift store that processes liquidation manifests. '
            'Given CSV column headers and sample rows, suggest formula expressions to map '
            'raw CSV columns into standardized fields.\n\n'
            'Targets are either FLAT keys (see list below) or DOTTED `bucket.subkey` JSON buckets.\n'
            'The four bucket prefixes are fixed: identifiers, taxonomy, specifications, tracking. '
            'Sub-key strings must match the regex ^[a-z][a-z0-9_]*$. suggested_keys lists are autocomplete '
            'hints only—not a whitelist; prefer them when the column obviously matches '
            '(e.g. UPC column → identifiers.upc), otherwise emit a sensible custom sub-key.\n'
            + '\n'.join(bucket_lines)
            + '\n\nFlat fields:\n'
            + '\n'.join(standard_fields_desc)
            + '\n\nFormula syntax:\n'
            '- Column references: [COLUMN_NAME] (exact header name from the CSV)\n'
            '- Functions: UPPER(expr), LOWER(expr), TITLE(expr), TRIM(expr), '
            'REPLACE(expr, "find", "replace"), CONCAT(expr, ...), LEFT(expr, n), RIGHT(expr, n)\n'
            '- String concatenation: expr + " " + expr\n'
            '- String literals: "quoted text"\n\n'
            'Field-specific hints:\n'
            '- unit_retail (per-unit MSRP): Prefer a vendor stated **unit** retail column such as '
            '"Unit Retail" or "MSRP". Avoid extended line totals (e.g. "Ext. Retail") when a unit column exists.\n'
            '- identifiers.upc: map barcode / UPC columns here, not a separate flat upc.\n'
            '- taxonomy.category: map department/category text here.\n\n'
            'Omit targets you cannot infer. Use TRIM() liberally. '
            'You MUST respond only by calling the suggest_mappings tool with valid JSON input.'
        )

        user_message_parts = [f'CSV Headers: {json_lib.dumps(headers_list)}']
        if sample_rows:
            user_message_parts.append(f'Sample rows (first {len(sample_rows)}):')
            for row in sample_rows:
                user_message_parts.append(json_lib.dumps(row['raw']))
        if prior_templates:
            user_message_parts.append(f'Prior templates for this vendor: {json_lib.dumps(prior_templates)}')

        user_content = '\n'.join(user_message_parts)
        model_id = ai_model('PREPROCESSING_SUGGEST', request.data.get('model'))

        try:
            tool_inp, model_used = llm_chat_tool_input(
                purpose='PREPROCESSING_SUGGEST',
                model_override=model_id,
                system=system_prompt,
                user=user_content,
                tool_name='suggest_mappings',
                tools=suggest_mappings_tools(),
                temperature=0.0,
                max_tokens=4096,
                log_source='ai_suggest_formulas',
                log_detail=f'order={order.pk} suggest-formulas',
            )
        except LLMConfigError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as e:
            logger.error('AI error in suggest-formulas: %s', e)
            log_ai_usage(
                'ai_suggest_formulas',
                model_id,
                0,
                0,
                detail=f'order={order.pk} suggest-formulas',
                success=False,
                error=str(e),
            )
            return Response(
                {'error': f'AI service error: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        suggestions = tool_inp.get('suggestions') or []
        return Response({
            'suggestions': suggestions,
            'model_used': model_used,
        })

    @action(detail=True, methods=['post'], url_path='ai-cleanup-rows')
    def ai_cleanup_rows(self, request, pk=None):
        """Bulk Add Item-style AI cleanup for manifest rows and linked items."""
        import json as json_lib
        import time as _time

        from apps.core.services.llm_router import (
            LLMAPIError,
            LLMConfigError,
            llm_complete,
            resolve_api_key,
            resolve_provider,
        )

        timing = {}
        t_total_start = _time.perf_counter()
        max_retries = 1

        try:
            order = self.get_object()
            if _preprocessing_staging_active(order):
                # Deprecated for the new flow (P6-style retirement): it creates Products/Items
                # pre-check-in and writes ManifestRow listing fields. Full removal after soak.
                return Response(
                    {
                        'detail': (
                            'ai-cleanup-rows is deprecated for staging orders. '
                            'Use ai-cleanup-batch (web cleanup) or apply-cleanup-csv (offline).'
                        ),
                    },
                    status=status.HTTP_410_GONE,
                )
            generation_at_start = order.ai_cleanup_generation
            _models, configured_default = _inventory_cleanup_model_settings()
            model_id = request.data.get('model', '') or configured_default
            batch_size = int(request.data.get('batch_size', 25))
            offset = int(request.data.get('offset', 0))
            cleanup_mode = str(request.data.get('mode') or 'fast').strip().lower()
            is_fast_mode = cleanup_mode != 'rich'
            include_debug_payload = bool(request.data.get('debug_payload', False))
            try:
                resolve_api_key(resolve_provider(model_id))
            except LLMConfigError as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            t0 = _time.perf_counter()
            qs = ManifestRow.objects.filter(purchase_order=order).order_by('row_number')
            total_rows = qs.count()
            if total_rows == 0:
                return Response(
                    {'error': 'No manifest rows to process.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            batch = list(qs[offset:offset + batch_size])
            timing['db_fetch_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            if not batch:
                return Response({
                    'rows_processed': 0,
                    'total_rows': total_rows,
                    'offset': offset,
                    'suggestions': [],
                    'model_used': model_id,
                    'has_more': False,
                    'timing': timing,
                })

            ensure_manifest_products_and_items(order, request.user)
            batch = list(
                ManifestRow.objects.filter(purchase_order=order)
                .select_related('matched_product')
                .prefetch_related('items')
                .order_by('row_number')[offset:offset + batch_size]
            )

            t0 = _time.perf_counter()

            if is_fast_mode:
                system_prompt = (
                    'You clean liquidation manifest rows for an inventory intake workflow. '
                    'Return ONLY a JSON array, no markdown. Every object MUST echo row_id, row_number, and item_id exactly. '
                    'For each row return only these keys: row_id, row_number, item_id, title, brand, category, condition, price, low_confidence, low_confidence_reason.\n\n'
                    'Rules:\n'
                    '- Keep title concise and sellable.\n'
                    '- Use brand/model/description facts only; do not invent specific model numbers.\n'
                    '- condition must be exactly one of: ' + ', '.join(CONDITION_VALUES) + '.\n'
                    '- category must be exactly one of the allowed categories below; use "Miscellaneous" if uncertain.\n'
                    '- price should be a number string. Use ideal_price/base_cost/unit_retail as pricing context, not a long explanation.\n'
                    '- Set low_confidence true when the row is vague, identity is uncertain, or pricing is a guess.\n\n'
                    'Allowed categories:\n'
                    + '\n'.join(f'- {name}' for name in TAXONOMY_V1_CATEGORY_NAMES)
                    + '\n\nExample output object:\n'
                    '{"row_id": 1, "row_number": 12, "item_id": 99, "title": "Nike Athletic Shoes", "brand": "Nike", "category": "Footwear - Athletic", "condition": "good", "price": "24.99", "low_confidence": false, "low_confidence_reason": ""}'
                )
            else:
                system_prompt = (
                    LISTING_STANDARDS
                    + '\nAllowed condition values (exactly one): '
                    + ', '.join(CONDITION_VALUES)
                    + '\n\nIf you return a category, it MUST be exactly one of these strings:\n'
                    + '\n'.join(f'- {name}' for name in TAXONOMY_V1_CATEGORY_NAMES)
                    + '\n\n'
                    + FEW_SHOT_ADD_ITEM
                    + '\n\nYou are cleaning liquidation manifest rows in bulk. '
                    'Return ONLY a JSON array. Each object MUST echo row_id, row_number, and item_id exactly. '
                    'If identity is uncertain, still echo the provided ids and set low_confidence true. '
                    'Include suggestions for title, brand, category, condition, price, specifications, notes, and reasoning.'
                )

            batch_data = []
            for r in batch:
                first_item = r.items.exclude(status__in=TERMINAL_ITEM_STATUSES).order_by('id').first()
                base_cost = order.compute_item_cost(r.unit_retail)
                ideal_price = (base_cost * Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if base_cost is not None else None
                ids = r.identifiers or {}
                tx = r.taxonomy or {}
                batch_data.append({
                    'row_id': r.id,
                    'row_number': r.row_number,
                    'item_id': first_item.id if first_item else None,
                    'sku': first_item.sku if first_item else '',
                    'title': r.title,
                    'brand': r.brand,
                    'model': r.model,
                    'category': tx.get('category') or '',
                    'condition': r.condition,
                    'identifiers': ids,
                    'unit_retail': str(r.unit_retail) if r.unit_retail else '',
                    'base_cost': str(base_cost) if base_cost is not None else '',
                    'ideal_price': str(ideal_price) if ideal_price is not None else '',
                })
            submitted_row_ids = [row['row_id'] for row in batch_data]
            submitted_row_numbers = [row['row_number'] for row in batch_data]
            row_start = submitted_row_numbers[0] if submitted_row_numbers else None
            row_end = submitted_row_numbers[-1] if submitted_row_numbers else None
            timing['prompt_build_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            calculated_max_tokens = (
                max(1024, len(batch) * 120)
                if is_fast_mode
                else max(4096, len(batch) * 350)
            )

            t0 = _time.perf_counter()
            result = None
            for attempt in range(max_retries + 1):
                try:
                    result = llm_complete(
                        model_id=model_id,
                        system=system_prompt,
                        user=json_lib.dumps(batch_data),
                        max_tokens=calculated_max_tokens,
                        timeout=90.0,
                        log_source='ai_cleanup_rows',
                        log_detail=f'order={order.pk} ai-cleanup mode={cleanup_mode} offset={offset} batch={len(batch)}',
                    )
                    break
                except LLMAPIError as e:
                    if e.retryable and attempt < max_retries:
                        cleanup_logger.warning('AI cleanup retry %d after: %s', attempt + 1, e)
                        _time.sleep(2 ** attempt)
                    else:
                        raise
            timing['api_call_ms'] = round((_time.perf_counter() - t0) * 1000, 1)
            timing['retries'] = attempt

            # 'max_tokens' (Anthropic), 'length' (xAI), 'MAX_TOKENS' (Google)
            stop_reason = result.stop_reason or None
            truncated = stop_reason in ('max_tokens', 'length', 'MAX_TOKENS')

            t0 = _time.perf_counter()
            content_text = result.text

            suggestions = []
            rows_to_update = []
            discarded_rows = []
            low_confidence = 0
            parsed = None
            parse_text = content_text
            if truncated:
                bracket_pos = content_text.find('[')
                if bracket_pos >= 0:
                    parse_text = content_text[bracket_pos:] + ']'
                    cleanup_logger.warning(
                        'AI cleanup response truncated (max_tokens=%d, batch=%d rows). '
                        'Attempting partial JSON recovery.',
                        calculated_max_tokens, len(batch),
                    )

            try:
                parsed = parse_ai_cleanup_suggestions(parse_text)
            except ValueError as parse_error:
                parsed = []
                discarded_rows.extend(
                    {
                        'row_id': r.id,
                        'row_number': r.row_number,
                        'item_id': (
                            r.items.exclude(status__in=TERMINAL_ITEM_STATUSES)
                            .order_by('id')
                            .values_list('id', flat=True)
                            .first()
                        ),
                        'reason': 'parse_failed',
                        'detail': str(parse_error),
                    }
                    for r in batch
                )

            if parsed:
                suggestions_by_id = {
                    s['row_id']: s for s in parsed if isinstance(s, dict)
                }
                valid_conditions = set(CONDITION_VALUES)
                taxonomy_set = set(TAXONOMY_V1_CATEGORY_NAMES)
                expected_item_ids = {
                    r.id: (
                        r.items.exclude(status__in=TERMINAL_ITEM_STATUSES).order_by('id').values_list('id', flat=True).first()
                    )
                    for r in batch
                }

                for r in batch:
                    suggestion = suggestions_by_id.get(r.id, {})
                    expected_item_id = expected_item_ids.get(r.id)
                    if not suggestion:
                        discarded_rows.append({
                            'row_id': r.id,
                            'row_number': r.row_number,
                            'item_id': expected_item_id,
                            'reason': 'missing',
                        })
                        continue
                    try:
                        suggestion_row_number = int(suggestion.get('row_number') or -1)
                    except (TypeError, ValueError):
                        suggestion_row_number = -1
                    try:
                        suggestion_item_id = int(suggestion.get('item_id') or -1)
                    except (TypeError, ValueError):
                        suggestion_item_id = -1
                    row_number_ok = suggestion_row_number == r.row_number
                    item_id_ok = expected_item_id is None or suggestion_item_id == expected_item_id
                    if suggestion and row_number_ok and item_id_ok:
                        r.title = (suggestion.get('title') or '')[:300]
                        r.brand = (suggestion.get('brand') or '')[:200]
                        r.model = (suggestion.get('model') or '')[:200]
                        r.ai_reasoning = (
                            suggestion.get('reasoning')
                            or ('Fast cleanup low confidence' if suggestion.get('low_confidence') is True else 'Fast cleanup')
                        )
                        if suggestion.get('category') in taxonomy_set:
                            tx = dict(r.taxonomy or {})
                            tx['category'] = suggestion.get('category')
                            r.taxonomy = tx
                        condition = str(suggestion.get('condition') or '').strip()
                        if condition in valid_conditions:
                            r.condition = condition
                        if not is_fast_mode and suggestion.get('search_tags') is not None:
                            st = suggestion.get('search_tags')
                            if isinstance(st, list):
                                r.search_tags = slugify_formula_search_tags(
                                    ','.join(str(x) for x in st if str(x).strip()),
                                )
                            else:
                                r.search_tags = slugify_formula_search_tags(str(st))
                        if not is_fast_mode and suggestion.get('notes'):
                            r.notes = str(suggestion.get('notes') or '')
                        if not is_fast_mode and isinstance(suggestion.get('specifications'), dict):
                            cur = dict(r.specifications or {})
                            for k, v in suggestion['specifications'].items():
                                cur[str(k)] = str(v)
                            r.specifications = cur
                        price = parse_decimal(suggestion.get('price'))
                        if price is not None:
                            r.proposed_price = price
                            if r.pricing_stage == 'unpriced':
                                r.pricing_stage = 'draft'
                            if not r.pricing_notes:
                                r.pricing_notes = 'AI initial estimate'
                        if suggestion.get('low_confidence') is True:
                            low_confidence += 1
                            r.notes = (r.notes + '\n' if r.notes else '') + str(suggestion.get('low_confidence_reason') or 'AI low confidence')
                        rows_to_update.append(r)
                        suggestions.append(suggestion)
                    elif suggestion:
                        reason = 'row_number_mismatch' if not row_number_ok else 'item_id_mismatch'
                        discarded_rows.append({
                            'row_id': r.id,
                            'row_number': r.row_number,
                            'item_id': expected_item_id,
                            'reason': reason,
                            'received_row_number': suggestion.get('row_number'),
                            'received_item_id': suggestion.get('item_id'),
                        })
            timing['response_parse_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            t0 = _time.perf_counter()
            order.refresh_from_db()
            if order.ai_cleanup_generation != generation_at_start:
                timing['db_save_ms'] = 0.0
                timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
                next_offset = offset + batch_size
                return Response({
                    'rows_processed': len(batch),
                    'rows_saved': 0,
                    'total_rows': total_rows,
                    'offset': offset,
                    'batch_size': batch_size,
                    'row_start': row_start,
                    'row_end': row_end,
                    'submitted_row_ids': submitted_row_ids,
                    'submitted_row_numbers': submitted_row_numbers,
                    'suggestions': [],
                    'model_used': model_id,
                    'has_more': next_offset < total_rows,
                    'timing': timing,
                    'stop_reason': stop_reason,
                    'cancelled': True,
                    'mode': cleanup_mode,
                    'received_response': True,
                    'response_text_length': len(content_text),
                    'parsed_count': len(parsed or []),
                    'validated_row_ids': [],
                    'discarded_rows': discarded_rows,
                    'submitted_rows': batch_data if include_debug_payload else [],
                })
            if rows_to_update:
                ManifestRow.objects.bulk_update(rows_to_update, [
                    'title', 'brand',
                    'model', 'ai_reasoning',
                    'search_tags', 'specifications',
                    'taxonomy', 'condition', 'notes',
                    'proposed_price', 'pricing_stage', 'pricing_notes',
                ])
                sync_manifest_row_outputs_to_items(order, rows_to_update)
            timing['db_save_ms'] = round((_time.perf_counter() - t0) * 1000, 1)
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)

            next_offset = offset + batch_size
            order.refresh_from_db()
            return Response({
                'rows_processed': len(batch),
                'rows_saved': len(rows_to_update),
                'total_rows': total_rows,
                'offset': offset,
                'batch_size': batch_size,
                'row_start': row_start,
                'row_end': row_end,
                'submitted_row_ids': submitted_row_ids,
                'submitted_row_numbers': submitted_row_numbers,
                'suggestions': suggestions,
                'model_used': model_id,
                'has_more': next_offset < total_rows,
                'timing': timing,
                'stop_reason': stop_reason,
                'rows_discarded': len(discarded_rows),
                'rows_low_confidence': low_confidence,
                'mode': cleanup_mode,
                'received_response': True,
                'response_text_length': len(content_text),
                'parsed_count': len(parsed or []),
                'validated_row_ids': [r.id for r in rows_to_update],
                'discarded_rows': discarded_rows,
                'submitted_rows': batch_data if include_debug_payload else [],
                'item_count': order.item_count,
            })

        except LLMAPIError as e:
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
            cleanup_logger.error('AI cleanup API error: %s', e)
            _mid = ai_model('INVENTORY_CLEANUP', request.data.get('model'))
            log_ai_usage(
                'ai_cleanup_rows',
                _mid,
                0,
                0,
                detail=f'order={order.pk} ai-cleanup',
                success=False,
                error=str(e),
            )
            return Response(
                {'error': f'AI service error: {e}', 'timing': timing},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (json_lib.JSONDecodeError, KeyError) as e:
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
            cleanup_logger.warning('Failed to parse AI cleanup response: %s', e)
            return Response(
                {'error': f'Failed to parse AI response: {e}', 'timing': timing},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as e:
            timing['total_ms'] = round((_time.perf_counter() - t_total_start) * 1000, 1)
            cleanup_logger.exception('Unexpected error in ai_cleanup_rows')
            return Response(
                {'error': f'Unexpected error: {e}', 'timing': timing},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['get'], url_path='ai-cleanup-status')
    def ai_cleanup_status(self, request, pk=None):
        """Return progress of AI cleanup for this order's manifest rows."""
        order = self.get_object()
        use_staging = _preprocessing_staging_active(order)
        if use_staging:
            qs = PreprocessingRow.objects.filter(purchase_order=order)
        else:
            qs = ManifestRow.objects.filter(purchase_order=order)
        total = qs.count()
        cleaned = qs.exclude(ai_reasoning='').count()
        payload = {
            'total_rows': total,
            'cleaned_rows': cleaned,
            'remaining_rows': total - cleaned,
            'generation': order.ai_cleanup_generation,
            'use_staging': use_staging,
        }
        if use_staging:
            # Drives the web batch pool: client partitions these into row_ids batches,
            # and resume is "re-fetch status, process what's left".
            payload['uncleaned_row_ids'] = uncleaned_staging_row_ids(order)
        return Response(payload)

    @action(detail=True, methods=['post'], url_path='cancel-ai-cleanup')
    def cancel_ai_cleanup(self, request, pk=None):
        """Clear AI-generated fields while preserving deterministic product/item links."""
        order = self.get_object()
        use_staging = _preprocessing_staging_active(order)
        PurchaseOrder.objects.filter(pk=order.pk).update(
            ai_cleanup_generation=F('ai_cleanup_generation') + 1,
        )
        if use_staging:
            # Full layer clear (ai_* + final_* snapshot + match fields) — clearing only
            # ai_* left the final_* snapshot and stale matches visible in Final Decisions
            # while the order claimed "not cleaned" (same stale-wipe class as the
            # finalize-rewind bug). Mirrors timeline undo "Before AI cleanup".
            pr_qs = PreprocessingRow.objects.filter(purchase_order=order)
            updated = pr_qs.count()
            bulk_clear_preprocess_ai_and_final_layers(pr_qs)
            pr_qs.update(ai_reasoning='', ai_status={})
            PurchaseOrder.objects.filter(pk=order.pk).update(
                ai_cleaned_at=None,
                review_saved_at=None,
                preprocess_status='standardized',
            )
        else:
            updated = ManifestRow.objects.filter(purchase_order=order).update(
                ai_reasoning='',
                notes='',
                search_tags=[],
                specifications={},
            )
        return Response({
            'rows_cleared': updated,
        })

    @action(detail=True, methods=['post'], url_path='ai-cleanup-batch')
    def ai_cleanup_batch(self, request, pk=None):
        """One web cleanup batch: ≤25 staging row ids → one model call → ai_* merge.

        Designed for a browser worker pool (default 4 concurrent). Writes
        ``PreprocessingRow.ai_*`` only; see ``services/ai_cleanup.py``.
        """
        order = self.get_object()
        if not _preprocessing_staging_active(order):
            return Response(
                {'detail': 'AI cleanup batches require active preprocessing staging.', 'code': 'staging_required'},
                status=status.HTTP_409_CONFLICT,
            )

        raw_ids = request.data.get('row_ids')
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response(
                {'detail': 'row_ids must be a non-empty list of staging row ids.', 'code': 'invalid_row_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            row_ids = [int(x) for x in raw_ids]
        except (TypeError, ValueError):
            return Response(
                {'detail': 'row_ids must be integers.', 'code': 'invalid_row_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.inventory.services.ai_cleanup import resolve_cleanup_api_key

        allowed_models, configured_default = _inventory_cleanup_model_settings()
        allowed_ids = {m['id'] for m in allowed_models}
        model_id = str(request.data.get('model') or '') or configured_default
        if model_id not in allowed_ids:
            return Response(
                {
                    'detail': f'Unsupported cleanup model {model_id!r}. Choose one of: {sorted(allowed_ids)}.',
                    'code': 'invalid_model',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        api_key, key_error = resolve_cleanup_api_key(model_id)
        if key_error:
            return Response({'error': key_error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            result = run_ai_cleanup_batch(order, row_ids, model_id=model_id, api_key=api_key)
        except AiCleanupBatchError as e:
            return Response({'detail': str(e), 'code': 'invalid_row_ids'}, status=status.HTTP_400_BAD_REQUEST)
        except ImportError:
            return Response(
                {'error': 'anthropic library is not installed.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:  # noqa: BLE001 — model/network failures are retryable per batch
            return Response(
                {'detail': f'AI call failed: {e}', 'code': 'ai_call_failed', 'retryable': True},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(result)

    @action(detail=True, methods=['post'], url_path='ai-cleanup-complete')
    def ai_cleanup_complete(self, request, pk=None):
        """Fast, idempotent post-cleanup step: match candidates + order flags. No AI."""
        order = self.get_object()
        if not _preprocessing_staging_active(order):
            return Response(
                {'detail': 'AI cleanup completion requires active preprocessing staging.', 'code': 'staging_required'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(complete_ai_cleanup(order))

    @action(detail=True, methods=['post'], url_path='clear-manifest-rows')
    def clear_manifest_rows(self, request, pk=None):
        """Delete all ManifestRow records for this order, resetting standardization.
        Deletes only non-terminal generated items tied to these manifest rows.
        """
        order = self.get_object()
        terminal_count = order.items.filter(status__in=TERMINAL_ITEM_STATUSES).count()
        if terminal_count:
            return Response(
                {'detail': 'Cannot clear manifest rows — some generated items are sold, scrapped, or lost.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        items_deleted, _ = order.items.all().delete()
        deleted_count, _ = ManifestRow.objects.filter(purchase_order=order).delete()
        PreprocessingRow.objects.filter(purchase_order=order).delete()
        order.item_count = 0
        order.save(update_fields=['item_count', 'updated_at'])
        return Response({'rows_deleted': deleted_count, 'items_deleted': items_deleted})

    @action(detail=True, methods=['post'], url_path='clear-pricing')
    def clear_pricing(self, request, pk=None):
        """Clear all pricing data from manifest rows (Undo Step 4)."""
        order = self.get_object()
        updated = ManifestRow.objects.filter(purchase_order=order).update(
            proposed_price=None,
            final_price=None,
            pricing_stage='unpriced',
            pricing_notes='',
        )
        for item in order.items.exclude(status__in=TERMINAL_ITEM_STATUSES):
            item.price = Decimal('0.00')
            item.save(update_fields=['price', 'updated_at'])
        return Response({'rows_cleared': updated})

    @action(detail=True, methods=['get', 'post'], url_path='ai-cleanup-models')
    def ai_cleanup_models(self, request, pk=None):
        """Manage Inventory Preprocessing AI cleanup model choices."""
        _order = self.get_object()
        models, default_model = _inventory_cleanup_model_settings()
        if request.method == 'GET':
            return Response({'models': models, 'default': default_model})

        action_name = str(request.data.get('action') or '').strip()
        model_id = str(request.data.get('id') or request.data.get('model') or '').strip()
        model_name = str(request.data.get('name') or model_id).strip()

        if action_name == 'add':
            if not model_id:
                return Response({'detail': 'Model id is required.'}, status=status.HTTP_400_BAD_REQUEST)
            existing = [m for m in models if m['id'] != model_id]
            models = existing + [{'id': model_id, 'name': model_name or model_id}]
            _save_inventory_cleanup_model_settings(models, default_model, request.user)
            return Response({'models': models, 'default': default_model})

        if action_name == 'set_default':
            if not model_id:
                return Response({'detail': 'Model id is required.'}, status=status.HTTP_400_BAD_REQUEST)
            if not any(m['id'] == model_id for m in models):
                models.append({'id': model_id, 'name': model_name or model_id})
            _save_inventory_cleanup_model_settings(models, model_id, request.user)
            return Response({'models': models, 'default': model_id})

        if action_name == 'verify':
            if not model_id:
                return Response({'detail': 'Model id is required.'}, status=status.HTTP_400_BAD_REQUEST)
            from apps.core.services.llm_router import LLMConfigError, llm_complete
            try:
                result = llm_complete(
                    model_id=model_id,
                    system='Reply with OK.',
                    user='ping',
                    max_tokens=None,
                    timeout=30.0,
                    log_source='inventory_cleanup_model_verify',
                    log_detail='verify cleanup model',
                )
                return Response({'ok': True, 'model': result.model_used, 'sample': result.text[:80]})
            except LLMConfigError as e:
                return Response({'ok': False, 'detail': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            except Exception as e:
                return Response({'ok': False, 'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='download-cleanup-csv')
    def download_cleanup_csv(self, request, pk=None):
        """Standardized-row CSV for offline AI cleanup.

        Order: correlation + frozen economics (``row_id``, ``row_number``, ``quantity``,
        ``unit_retail``, ``base_cost``, ``ideal_price``), then flattened text fields (``description`` …
        ``notes``), then JSON cells (``identifiers_json`` … ``search_tags_json``).

        Omit ``title``, flat ``category`` / ``sku`` / ``upc``, and pricing-stage columns —
        offline tools infer from ``taxonomy_json`` / ``identifiers_json``; AI submits those via
        **upload-cleanup-csv** / **apply-cleanup-csv**.
        """
        order = self.get_object()
        use_staging = _preprocessing_staging_active(order)

        if use_staging:
            rows = (
                PreprocessingRow.objects.filter(purchase_order=order)
                .select_related('manifest_row')
                .order_by('row_number')
            )
        else:
            ensure_manifest_products_and_items(order, request.user)
            rows = (
                ManifestRow.objects.filter(purchase_order=order)
                .select_related('purchase_order', 'matched_product')
                .prefetch_related('items')
                .order_by('row_number')
            )

        columns = [
            'row_id',
            'row_number',
            'quantity',
            'unit_retail',
            'base_cost',
            'ideal_price',
            'title',
            'brand',
            'model',
            'condition',
            'notes',
            'identifiers_json',
            'taxonomy_json',
            'specifications_json',
            'tracking_json',
            'search_tags_json',
        ]

        response = HttpResponse(content_type='text/csv')
        fname = _safe_attachment_filename_stem(getattr(order, 'order_number', None) or str(order.pk))
        response['Content-Disposition'] = (f'attachment; filename="{fname}.csv"')
        writer = csv.DictWriter(response, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()

        for row in rows:
            if use_staging:
                source = row.manifest_row or row
                base_cost, ideal_price = _unit_base_cost_and_ideal_price(order, source.unit_retail)
                writer.writerow({
                    'row_id': source.id,
                    'row_number': source.row_number,
                    'quantity': source.quantity,
                    'unit_retail': source.unit_retail or '',
                    'base_cost': base_cost or '',
                    'ideal_price': ideal_price or '',
                    'title': getattr(source, 'title', ''),
                    'brand': getattr(source, 'brand', row.standard_brand),
                    'model': getattr(source, 'model', row.standard_model),
                    'condition': getattr(source, 'condition', row.standard_condition),
                    'notes': getattr(source, 'notes', row.standard_notes),
                    'identifiers_json': _cleanup_csv_json_cell(getattr(source, 'identifiers', row.standard_identifiers)),
                    'taxonomy_json': _cleanup_csv_json_cell(getattr(source, 'taxonomy', row.standard_taxonomy)),
                    'specifications_json': _cleanup_csv_json_cell(getattr(source, 'specifications', row.standard_specifications)),
                    'tracking_json': _cleanup_csv_json_cell(getattr(source, 'tracking', row.standard_tracking)),
                    'search_tags_json': _cleanup_csv_json_cell(getattr(source, 'search_tags', row.standard_search_tags)),
                })
            else:
                base_cost, ideal_price = _unit_base_cost_and_ideal_price(order, row.unit_retail)
                writer.writerow({
                    'row_id': row.id,
                    'row_number': row.row_number,
                    'quantity': row.quantity,
                    'unit_retail': row.unit_retail or '',
                    'base_cost': base_cost or '',
                    'ideal_price': ideal_price or '',
                    'title': row.title,
                    'brand': row.brand,
                    'model': row.model,
                    'condition': row.condition,
                    'notes': row.notes,
                    'identifiers_json': _cleanup_csv_json_cell(getattr(row, 'identifiers', None)),
                    'taxonomy_json': _cleanup_csv_json_cell(getattr(row, 'taxonomy', None)),
                    'specifications_json': _cleanup_csv_json_cell(getattr(row, 'specifications', None)),
                    'tracking_json': _cleanup_csv_json_cell(getattr(row, 'tracking', None)),
                    'search_tags_json': _cleanup_csv_json_cell(getattr(row, 'search_tags', None)),
                })

        return response

    def _parse_cleanup_csv_upload(self, request):
        """Return normalized cleanup rows (`list[dict]`) or `(None, Response)`."""
        rows_payload = request.data.get('rows') if isinstance(request.data, dict) else None
        if isinstance(rows_payload, list):
            if not rows_payload:
                return None, Response(
                    {'detail': 'JSON body `rows` must be a non-empty array.', 'code': 'empty_rows'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            csv_rows = []
            for idx, row in enumerate(rows_payload):
                if not isinstance(row, dict):
                    return None, Response(
                        {
                            'detail': f'rows[{idx}] must be an object.',
                            'code': 'invalid_row_shape',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                csv_rows.append(_cleanup_apply_header_aliases(_cleanup_strip_record(row)))
            return csv_rows, None

        upload = request.FILES.get('file')
        if not upload:
            return None, Response(
                {'detail': 'Provide multipart `file` or JSON `{ "rows": [...] }`.', 'code': 'missing_input'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            decoded = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return None, Response(
                {'detail': 'CSV must be UTF-8 encoded.', 'code': 'decode_error'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = csv.DictReader(io.StringIO(decoded))
        if not reader.fieldnames:
            return None, Response(
                {'detail': 'CSV header row is required.', 'code': 'empty_csv'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        csv_rows = []
        for r in reader:
            csv_rows.append(_cleanup_apply_header_aliases(_cleanup_strip_record(r)))
        return csv_rows, None

    @action(detail=True, methods=['post'], url_path='upload-cleanup-csv')
    def upload_cleanup_csv(self, request, pk=None):
        """Import AI cleanup results from CSV file or JSON `{rows:[...]}` into staging or ManifestRows."""
        return self._upload_cleanup_csv_impl(request)

    @action(detail=True, methods=['post'], url_path='apply-cleanup-csv')
    def apply_cleanup_csv(self, request, pk=None):
        """Alias for upload_cleanup_csv (JSON body apply path)."""
        return self._upload_cleanup_csv_impl(request)

    def _upload_cleanup_csv_impl(self, request):
        order = self.get_object()
        use_staging = _preprocessing_staging_active(order)
        partial = bool(request.data.get('partial')) if isinstance(request.data, dict) else False
        if partial and not use_staging:
            return Response(
                {'detail': 'Partial apply requires active preprocessing staging.', 'code': 'partial_requires_staging'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        csv_rows, parse_error = self._parse_cleanup_csv_upload(request)
        if parse_error is not None:
            return parse_error

        if use_staging:
            source_rows = list(
                PreprocessingRow.objects.filter(purchase_order=order)
                .select_related('manifest_row')
            )
            rows_by_id = {}
            for row in source_rows:
                if row.manifest_row_id:
                    rows_by_id[row.manifest_row_id] = row
                rows_by_id.setdefault(row.id, row)
            expected_rows = len(source_rows)
            expected_row_ids = {
                row.manifest_row_id if row.manifest_row_id else row.id
                for row in source_rows
            }
        else:
            source_rows = list(
                ManifestRow.objects.filter(purchase_order=order)
                .select_related('matched_product', 'purchase_order')
                .prefetch_related('items')
            )
            rows_by_id = {row.id: row for row in source_rows}
            expected_rows = len(source_rows)
            expected_row_ids = {row.id for row in source_rows}
        taxonomy_set = set(TAXONOMY_V1_CATEGORY_NAMES)
        rejected = []
        all_soft_warnings: list[dict] = []
        payloads = []
        seen_ids = set()
        referenced_in_csv = set()
        rows_seen = len(csv_rows)

        def _reject(line: int, **meta):
            entry = {'line': line, **meta}
            rejected.append(entry)

        def _loads_json_cell(line_no: int, row_id_hint: int, key: str, raw: str | None):
            s = str(raw or '').strip()
            if not s:
                return None
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                _reject(line_no, row_id=row_id_hint, reason='invalid_json', detail=key)
                return object()

        if rows_seen != expected_rows and not partial:
            return Response(
                {
                    'detail': 'Cleanup CSV must include exactly one row for every manifest row.',
                    'code': 'row_count_mismatch',
                    'rows_seen': rows_seen,
                    'expected_rows': expected_rows,
                    'rows_updated': 0,
                    'rows_rejected': rows_seen,
                    'rejected_rows': [{
                        'reason': 'row_count_mismatch',
                        'detail': f'Expected {expected_rows} row(s), received {rows_seen}.',
                    }],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        for idx, norm in enumerate(csv_rows, start=2):
            try:
                row_id = int(str(norm.get('row_id') or '').strip())
            except (TypeError, ValueError):
                _reject(idx, reason='invalid_identity', detail='row_id must be an integer.')
                continue

            row = rows_by_id.get(row_id)
            if not row:
                _reject(idx, row_id=row_id, reason='unknown_row_id')
                continue
            if row_id in seen_ids:
                _reject(idx, row_id=row_id, reason='duplicate_row_id')
                continue

            referenced_in_csv.add(row_id)

            staging_wide = use_staging and _cleanup_norm_has_non_empty(
                norm, _CLEANUP_STAGING_WIDE_SIGNAL_KEYS,
            )
            manifest_forbidden_wide = (
                not use_staging
                and _cleanup_norm_has_non_empty(norm, _CLEANUP_STAGING_WIDE_SIGNAL_KEYS)
            )
            if manifest_forbidden_wide:
                _reject(idx, row_id=row_id, reason='unsupported_cleanup_columns_for_manifest_row')
                continue

            if not staging_wide:
                missing = sorted(k for k in NARROW_AI_CLEANUP_KEYS if k not in norm)
                if missing:
                    _reject(idx, row_id=row_id, reason='missing_row_keys', detail=missing[:20])
                    continue

            extra_notes = ''
            if staging_wide:
                extra_notes = str(norm.get('notes') or '').strip()

            category = str(norm.get('category') or '').strip()
            if not category and staging_wide:
                raw_tx = _loads_json_cell(idx, row_id, 'taxonomy_json', norm.get('taxonomy_json'))
                if raw_tx is object():
                    continue
                if isinstance(raw_tx, dict):
                    category = str(raw_tx.get('category') or '').strip()

            proposed_price_raw = str(norm.get('proposed_price') or '').strip()
            display_title = str(norm.get('ai_title') or norm.get('title') or '').strip()
            condition_raw = str(norm.get('condition') or '').strip()
            brand_soft = str(norm.get('ai_brand') or norm.get('brand') or '').strip()
            _bc, ideal_row = _unit_base_cost_and_ideal_price(order, row.unit_retail)

            ai_status_obj = _normalize_cleanup_ai_status_value(norm.get('ai_status'))

            hard_errs, soft_ws, proposed_price, parsed_specs, parsed_search_tags, quality_issues = validate_cleanup_row_values(
                line=idx,
                row_id=row_id,
                staging_wide=staging_wide,
                norm=norm,
                category=category,
                taxonomy_set=frozenset(taxonomy_set),
                unit_retail=row.unit_retail,
                ideal_price=ideal_row,
                display_title=display_title,
                condition_raw=condition_raw,
                proposed_price_raw=proposed_price_raw,
                extra_description='',
                brand_for_soft=brand_soft,
                category_for_soft=category,
                block_on_quality=not staging_wide,
            )
            if hard_errs:
                for h in hard_errs:
                    rejected.append({
                        'line': h['line'],
                        'row_id': h['row_id'],
                        'rule': h['rule'],
                        'column': h.get('column'),
                        'reason': h['reason'],
                        'detail': h['reason'],
                    })
                continue

            all_soft_warnings.extend(soft_ws)
            for q in quality_issues:
                all_soft_warnings.append({
                    'line': q['line'],
                    'row_id': q['row_id'],
                    'rule': q['rule'],
                    'column': q.get('column'),
                    'reason': q['reason'],
                })

            csv_rn = str(norm.get('row_number') or '').strip()
            if csv_rn:
                try:
                    if int(csv_rn) != row.row_number:
                        all_soft_warnings.append({
                            'line': idx,
                            'row_id': row_id,
                            'rule': 'SOFT_ROW_NUMBER_MISMATCH',
                            'column': 'row_number',
                            'reason': f'CSV row_number {csv_rn} does not match staged row_number {row.row_number}',
                        })
                except (TypeError, ValueError):
                    pass

            seen_ids.add(row_id)
            norm_condition = normalize_cleanup_condition(condition_raw) or ''
            payloads.append({
                'line': idx,
                'row': row,
                'use_staging': use_staging,
                'staging_wide': staging_wide,
                'ai_title': display_title[:300],
                'ai_brand': brand_soft[:200],
                'ai_model': str(norm.get('ai_model') or norm.get('model') or '').strip()[:200],
                'category': category,
                'condition': norm_condition,
                'proposed_price': proposed_price,
                'parsed_specs': parsed_specs,
                'parsed_search_tags': parsed_search_tags,
                'extra_notes': extra_notes,
                'ai_status': ai_status_obj,
            })

        missing_ids = sorted(expected_row_ids - referenced_in_csv)
        if missing_ids and not partial:
            rejected.append({
                'reason': 'missing_row_ids',
                'row_ids': missing_ids[:100],
                'detail': f'{len(missing_ids)} manifest row id(s) missing from CSV.',
            })

        if rejected:
            return Response(
                {
                    'detail': 'Cleanup CSV failed validation; no rows were updated.',
                    'code': 'validation_failed',
                    'rows_seen': rows_seen,
                    'rows_updated': 0,
                    'rows_rejected': len(rejected),
                    'rejected_rows': rejected[:100],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        changed_rows = []
        with transaction.atomic():
            for pl in payloads:
                row = pl['row']
                staging_wide = pl['staging_wide']

                if pl['use_staging']:
                    apply_cleanup_values_to_staging_row(row, {
                        'title': pl['ai_title'],
                        'brand': pl['ai_brand'],
                        'model': pl['ai_model'],
                        'category': pl['category'],
                        'condition': pl['condition'],
                        'proposed_price': pl['proposed_price'],
                        'notes': pl['extra_notes'] if staging_wide else '',
                        'specifications': pl['parsed_specs'] if staging_wide and isinstance(pl['parsed_specs'], dict) else None,
                        'search_tags': pl['parsed_search_tags'] if staging_wide and isinstance(pl['parsed_search_tags'], list) else None,
                        'ai_status': pl.get('ai_status') or {},
                        'reasoning': 'Imported cleanup CSV',
                    })
                else:
                    update_fields_set = set()
                    row.title = pl['ai_title'][:300]
                    row.brand = pl['ai_brand'][:200]
                    row.model = pl['ai_model'][:200]
                    row.category = pl['category'][:200]
                    row.condition = pl['condition']
                    update_fields_set.update({
                        'title', 'brand', 'model', 'category', 'condition',
                    })
                    row.proposed_price = pl['proposed_price']
                    row.ai_reasoning = 'Imported cleanup CSV'
                    update_fields_set.update({'proposed_price', 'ai_reasoning'})
                    if pl['proposed_price'] is not None and row.pricing_stage == 'unpriced':
                        row.pricing_stage = 'draft'
                        row.pricing_notes = row.pricing_notes or 'Imported cleanup CSV'
                        update_fields_set.update({'pricing_stage', 'pricing_notes'})
                    row.save(update_fields=sorted(update_fields_set))
                changed_rows.append(row)

            if use_staging and changed_rows:
                snapshot_final_for_rows(changed_rows)

        if use_staging and partial:
            # Chunked apply: candidates + order flags are deferred to ai-cleanup-complete.
            return Response({
                'rows_seen': rows_seen,
                'rows_updated': len(changed_rows),
                'rows_rejected': 0,
                'rejected_rows': [],
                'soft_warnings': all_soft_warnings[:500],
                'partial': True,
            })

        if use_staging:
            completion = complete_ai_cleanup(order)
            return Response({
                'rows_seen': rows_seen,
                'rows_updated': len(changed_rows),
                'rows_rejected': 0,
                'rejected_rows': [],
                'soft_warnings': all_soft_warnings[:500],
                'items_updated': 0,
                'products_updated': 0,
                'match_candidates': completion['match_candidates'],
            })

        sync_summary = sync_manifest_row_outputs_to_items(order, changed_rows)
        return Response({
            'rows_seen': rows_seen,
            'rows_updated': len(changed_rows),
            'rows_rejected': 0,
            'rejected_rows': [],
            'soft_warnings': all_soft_warnings[:500],
            **sync_summary,
        })

    @action(detail=True, methods=['post'], url_path='update-manifest-pricing')
    def update_manifest_pricing(self, request, pk=None):
        """Update manifest-row pricing in bulk while order is pre-arrival/pre-check-in."""
        order = self.get_object()
        rows_qs = ManifestRow.objects.filter(purchase_order=order)
        rows_payload = request.data.get('rows')

        valid_pricing_stages = dict(ManifestRow.PRICING_STAGE_CHOICES)
        rows_updated = 0

        if isinstance(rows_payload, list):
            for row_payload in rows_payload:
                if not isinstance(row_payload, dict):
                    continue
                row_id = row_payload.get('id')
                if not row_id:
                    continue
                row = rows_qs.filter(id=row_id).first()
                if not row:
                    continue

                update_fields = []
                if 'proposed_price' in row_payload:
                    row.proposed_price = parse_decimal(row_payload.get('proposed_price'))
                    update_fields.append('proposed_price')
                if 'final_price' in row_payload:
                    row.final_price = parse_decimal(row_payload.get('final_price'))
                    update_fields.append('final_price')
                if 'pricing_notes' in row_payload:
                    row.pricing_notes = str(row_payload.get('pricing_notes') or '')
                    update_fields.append('pricing_notes')
                if 'pricing_stage' in row_payload:
                    stage = str(row_payload.get('pricing_stage') or '').strip().lower()
                    if stage in valid_pricing_stages:
                        row.pricing_stage = stage
                        update_fields.append('pricing_stage')

                if 'pricing_stage' not in row_payload:
                    if row.final_price is not None:
                        row.pricing_stage = 'final'
                        update_fields.append('pricing_stage')
                    elif row.proposed_price is not None and row.pricing_stage == 'unpriced':
                        row.pricing_stage = 'draft'
                        update_fields.append('pricing_stage')

                if update_fields:
                    deduped_fields = list(dict.fromkeys(update_fields))
                    row.save(update_fields=deduped_fields)
                    rows_updated += 1
        else:
            target_qs = rows_qs
            row_ids = parse_id_list(request.data.get('row_ids') or [])
            if row_ids:
                target_qs = target_qs.filter(id__in=row_ids)

            updates = {}
            has_change = False
            if 'proposed_price' in request.data:
                updates['proposed_price'] = parse_decimal(request.data.get('proposed_price'))
                has_change = True
            if 'final_price' in request.data:
                updates['final_price'] = parse_decimal(request.data.get('final_price'))
                has_change = True
            if 'pricing_notes' in request.data:
                updates['pricing_notes'] = str(request.data.get('pricing_notes') or '')
                has_change = True
            if 'pricing_stage' in request.data:
                stage = str(request.data.get('pricing_stage') or '').strip().lower()
                if stage in valid_pricing_stages:
                    updates['pricing_stage'] = stage
                    has_change = True

            if 'pricing_stage' not in updates:
                if updates.get('final_price') is not None:
                    updates['pricing_stage'] = 'final'
                    has_change = True
                elif updates.get('proposed_price') is not None:
                    updates['pricing_stage'] = 'draft'
                    has_change = True

            if not has_change:
                return Response(
                    {'detail': 'No pricing fields were provided.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            rows_updated = target_qs.update(**updates)

        updated_rows = list(
            rows_qs.filter(pricing_stage__in=['draft', 'final'])
            .select_related('matched_product', 'purchase_order')
            .prefetch_related('items')
        )
        sync_manifest_row_outputs_to_items(order, updated_rows)
        return Response({
            'rows_updated': rows_updated,
            'order_id': order.id,
        })

    @action(detail=True, methods=['get'], url_path='preprocessing-status')
    def preprocessing_status(self, request, pk=None):
        """Return lightweight step status and totals for the preprocessing workflow."""
        order = self.get_object()
        staging_qs = PreprocessingRow.objects.filter(purchase_order=order)
        if staging_qs.exists() and not order.finalized_at:
            cnt = preprocessing_status_counts_aggregate(order, staging_qs)
            total_rows = cnt['total_rows']
            cleaned_rows = cnt['cleaned_rows']
            final_rows = cnt['final_rows']
            missing_price = cnt['missing_price']
            total_units = cnt['total_units']
            total_paid = cnt['total_paid']
            total_ideal = cnt['total_ideal']
            total_set = cnt['total_set']
            delta = cnt['ideal_delta_pct']
        else:
            cnt = manifest_status_counts_aggregate(
                order,
                ManifestRow.objects.filter(purchase_order=order),
            )
            total_rows = cnt['total_rows']
            cleaned_rows = cnt['cleaned_rows']
            final_rows = cnt['final_rows']
            missing_price = cnt['missing_price']
            total_units = cnt['total_units']
            total_paid = cnt['total_paid']
            total_ideal = cnt['total_ideal']
            total_set = cnt['total_set']
            delta = cnt['ideal_delta_pct']

        completed_step = completed_step_from_preprocess_status(order.preprocess_status)

        preview = order.manifest_preview or {}
        manifest_sample = None
        if preview:
            manifest_sample = {
                'headers': list(preview.get('headers') or []),
                'delimiter': preview.get('delimiter'),
                'rows': preview.get('rows') or [],
            }

        sig = str(order.manifest_signature or '').strip()
        vendor = order.vendor if order.vendor_id else None
        matching_templates = (
            matching_templates_payload_for_vendor_signature(vendor, sig) if sig else []
        )
        standard_columns = list(manifest_standard_flat_columns())

        payload = {
            'order': {
                'id': order.id,
                'order_number': order.order_number,
                'vendor_name': order.vendor.name if order.vendor_id else '',
                'load_type': order.description or '',
                'status': order.status,
                'item_count': order.item_count,
                'has_manifest_file': bool(order.manifest_id),
                'manifest_sample': manifest_sample,
                'manifest_row_count': order.manifest_row_count,
                'manifest_signature': order.manifest_signature or '',
                'manifest_category_count': order.manifest_category_count,
                'template_id': order.template_id,
                'template_name_cache': order.template_name_cache or '',
                'template_header_signature_cache': order.template_header_signature_cache or '',
                'template_column_mappings_cache': order.template_column_mappings_cache or [],
                'standardization_formulas': order.standardization_formulas or {},
                'preprocess_status': order.preprocess_status,
                'standardized_at': order.standardized_at.isoformat() if order.standardized_at else None,
                'ai_cleaned_at': order.ai_cleaned_at.isoformat() if order.ai_cleaned_at else None,
                'review_saved_at': order.review_saved_at.isoformat() if order.review_saved_at else None,
                'finalized_at': order.finalized_at.isoformat() if order.finalized_at else None,
            },
            'matching_templates': matching_templates,
            'standard_columns': standard_columns,
            'counts': {
                'standardized_rows': total_rows,
                'cleaned_rows': cleaned_rows,
                'final_rows': final_rows,
                'missing_price': missing_price,
                'total_units': total_units,
            },
            'summary': {
                'total_paid': str(total_paid),
                'total_ideal_price': str(total_ideal.quantize(Decimal('0.01'))),
                'total_set_prices': str(total_set.quantize(Decimal('0.01'))),
                'ideal_delta_pct': delta,
            },
            'completed_step': completed_step,
        }
        if staging_qs.exists():
            payload['preprocessing'] = {
                'finalized_at': order.finalized_at.isoformat() if order.finalized_at else None,
                'row_count': staging_qs.count(),
            }
        else:
            payload['preprocessing'] = None
        if settings.DEBUG:
            ms = payload['order'].get('manifest_sample')
            logger.info(
                '[preprocessing_status] order=%s has_manifest=%s manifest_sample=%s',
                order.id,
                payload['order'].get('has_manifest_file'),
                None
                if not ms
                else {
                    'headers': len(ms.get('headers') or []),
                    'rows': len(ms.get('rows') or []),
                    'matching_templates': len(payload.get('matching_templates') or []),
                    'standard_columns': len(payload.get('standard_columns') or []),
                },
            )
        return Response(payload)

    @action(detail=True, methods=['get', 'patch'], url_path='preprocessing-review')
    def preprocessing_review(self, request, pk=None):
        """Staging-native review surface over PreprocessingRow only."""
        order = PurchaseOrder.objects.filter(pk=pk).first()
        if not order:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        staging_count = PreprocessingRow.objects.filter(purchase_order=order).count()
        if staging_count == 0:
            return Response(
                {'detail': 'Upload and standardize a manifest before reviewing preprocessing rows.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.finalized_at:
            return Response(
                {'detail': 'Preprocessing has already been finalized; edit canonical rows instead.'},
                status=status.HTTP_409_CONFLICT,
            )

        if request.method == 'GET':
            full_flag = str(request.query_params.get('full') or '').lower() in ('1', 'true', 'yes')
            fields_raw = str(request.query_params.get('fields') or 'minimal').strip().lower()
            use_full_rows = full_flag or fields_raw == 'full'
            row_serializer_cls = (
                PreprocessingReviewRowSerializer if use_full_rows else PreprocessingReviewRowMinimalSerializer
            )
            if full_flag:
                if staging_count > 10000:
                    return Response(
                        {'detail': 'Too many staged rows for full export (max 10000).'},
                        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    )
                rows_qs = (
                    PreprocessingRow.objects.filter(purchase_order=order)
                    .select_related('purchase_order', 'final_matched_product')
                    .order_by('row_number')
                )
                page_rows = list(rows_qs)
                review_ctx = build_preprocessing_review_serializer_context(order)
                serializer = row_serializer_cls(page_rows, many=True, context=review_ctx)
                return Response({
                    'rows': serializer.data,
                    'count': len(page_rows),
                    'full': True,
                    'fields': 'full',
                    'summary': summarize_preprocessing_rows(order, rows_qs),
                })

            rows_qs = build_preprocessing_review_queryset(order, request.query_params)
            page, page_size = _parse_page_params(request.query_params)
            start = (page - 1) * page_size
            end = start + page_size
            row_count = rows_qs.count()
            page_rows = list(rows_qs[start:end])
            review_ctx = build_preprocessing_review_serializer_context(order)
            serializer = row_serializer_cls(page_rows, many=True, context=review_ctx)
            return Response({
                'rows': serializer.data,
                'count': row_count,
                'page': page,
                'page_size': page_size,
                'has_next': end < row_count,
                'has_previous': start > 0,
                'fields': 'full' if use_full_rows else 'minimal',
                'summary': summarize_preprocessing_rows(order, rows_qs),
            })

        rows_payload = request.data.get('rows', [])
        if not isinstance(rows_payload, list):
            return Response({'detail': 'rows must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        changed_rows, changed_ids = update_preprocessing_review_rows(order, rows_payload)
        rows_qs = build_preprocessing_review_queryset(order, request.query_params)
        return Response({
            'rows_updated': len(changed_rows),
            'changed_row_ids': changed_ids,
            'items_updated': 0,
            'products_updated': 0,
            'summary': summarize_preprocessing_rows(order, rows_qs),
        })

    @action(detail=True, methods=['post'], url_path='regenerate-match-candidates')
    def regenerate_match_candidates(self, request, pk=None):
        """Re-run product match candidates for all staging rows on the order."""
        order = PurchaseOrder.objects.filter(pk=pk).first()
        if not order:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        staging_count = PreprocessingRow.objects.filter(purchase_order=order).count()
        if staging_count == 0:
            return Response(
                {'detail': 'Upload and standardize a manifest before reviewing preprocessing rows.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.finalized_at:
            return Response(
                {'detail': 'Preprocessing has already been finalized; edit canonical rows instead.'},
                status=status.HTTP_409_CONFLICT,
            )

        from apps.inventory.services.product_matching import generate_match_candidates_for_order

        summary = generate_match_candidates_for_order(order)
        return Response(summary)

    @action(detail=True, methods=['post'], url_path='preprocessing-review-reset-final')
    def preprocessing_review_reset_final(self, request, pk=None):
        """Rebuild final_* from ai_* + standard_* (same coalesce as cleanup CSV snapshot).

        Pricing fields (proposed_price, final_price, pricing_stage, pricing_notes) are not modified.
        """
        order = PurchaseOrder.objects.filter(pk=pk).first()
        if not order:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        staging = PreprocessingRow.objects.filter(purchase_order=order)
        if not staging.exists():
            return Response(
                {'detail': 'Upload and standardize a manifest before reviewing preprocessing rows.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.finalized_at:
            return Response(
                {'detail': 'Preprocessing has already been finalized; edit canonical rows instead.'},
                status=status.HTTP_409_CONFLICT,
            )

        raw_ids = request.data.get('row_ids')
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response(
                {'detail': 'row_ids must be a non-empty list of preprocessing row ids.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            row_ids = sorted({int(x) for x in raw_ids})
        except (TypeError, ValueError):
            return Response({'detail': 'row_ids must be integers.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = PreprocessingRow.objects.filter(purchase_order=order, pk__in=row_ids).order_by('row_number')
        found = list(qs)
        if len(found) != len(row_ids):
            return Response(
                {'detail': 'One or more row ids are invalid for this preprocessing session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        final_field_names = [f'final_{base}' for base in TRIPLE_LAYER_SPECS.keys()] + [
            'final_title',
            'final_category',
        ]
        save_fields = list(dict.fromkeys(final_field_names + ['updated_at']))
        ts = timezone.now()

        with transaction.atomic():
            for sr in found:
                snapshot_finalize_from_ai_and_standard(sr, fill_missing_only=False)
                sr.updated_at = ts
                sr.save(update_fields=save_fields)

        rows_qs = build_preprocessing_review_queryset(order, {})
        return Response({
            'rows_reset': len(found),
            'summary': summarize_preprocessing_rows(order, rows_qs),
        })

    @action(detail=True, methods=['get', 'post'], url_path='manual-review')
    def manual_review(self, request, pk=None):
        """Canonical manual review surface for manifest-linked Product/Item fields and prices."""
        order = PurchaseOrder.objects.filter(pk=pk).first()
        if not order:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'GET':
            if not order.items.exists():
                ensure_manifest_products_and_items(order, request.user)
            rows_qs = (
                ManifestRow.objects.filter(purchase_order=order)
                .select_related('purchase_order')
                .order_by('row_number')
            )
            search_term = str(request.query_params.get('search') or '').strip().lower()
            if search_term:
                q = (
                    Q(title__icontains=search_term)
                    | Q(brand__icontains=search_term)
                    | Q(model__icontains=search_term)
                    | Q(taxonomy__category__icontains=search_term)
                    | Q(identifiers__upc__icontains=search_term)
                    | Q(identifiers__sku__icontains=search_term)
                    | Q(items__sku__icontains=search_term)
                )
                rows_qs = rows_qs.filter(q).distinct()
            if str(request.query_params.get('missing_price') or '').lower() in ('1', 'true', 'yes'):
                rows_qs = rows_qs.filter(final_price__isnull=True, proposed_price__isnull=True)

            page, page_size = _parse_page_params(request.query_params)

            start = (page - 1) * page_size
            end = start + page_size
            row_count = rows_qs.count()
            summary_rows = rows_qs.only(
                'quantity',
                'unit_retail',
                'proposed_price',
                'final_price',
                'notes',
                'purchase_order',
            )
            page_rows = list(
                rows_qs
                .prefetch_related('items')
                [start:end]
            )
            serializer = ManualReviewRowSerializer(page_rows, many=True)
            total_paid = order.total_cost or Decimal('0.00')
            total_ideal = Decimal('0.00')
            total_set = Decimal('0.00')
            total_units = 0
            missing_price = 0
            low_confidence = 0
            for row in summary_rows:
                qty = row.quantity if row.quantity and row.quantity > 0 else 1
                total_units += qty
                base_cost = order.compute_item_cost(row.unit_retail)
                if base_cost is not None:
                    total_ideal += base_cost * Decimal('2') * qty
                row_price = effective_manifest_row_price(row)
                if row_price is None:
                    missing_price += 1
                else:
                    total_set += row_price * qty
                if 'low confidence' in (row.notes or '').lower():
                    low_confidence += 1
            delta = None
            if total_ideal > 0:
                delta = round(float((total_set - total_ideal) / total_ideal * 100), 1)
            return Response({
                'rows': serializer.data,
                'count': row_count,
                'page': page,
                'page_size': page_size,
                'has_next': end < row_count,
                'has_previous': start > 0,
                'summary': {
                    'total_paid': str(total_paid),
                    'total_ideal_price': str(total_ideal.quantize(Decimal('0.01'))),
                    'total_set_prices': str(total_set.quantize(Decimal('0.01'))),
                    'ideal_delta_pct': delta,
                    'total_rows': row_count,
                    'total_units': total_units,
                    'missing_price': missing_price,
                    'low_confidence': low_confidence,
                },
            })

        rows_payload = request.data.get('rows', [])
        if not isinstance(rows_payload, list):
            return Response({'detail': 'rows must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        rows_qs = ManifestRow.objects.filter(purchase_order=order).select_related('matched_product', 'purchase_order').prefetch_related('items')
        changed_rows = []
        for row_data in rows_payload:
            if not isinstance(row_data, dict) or not row_data.get('id'):
                continue
            row = rows_qs.filter(id=row_data['id']).first()
            if not row:
                continue
            update_fields = []
            for field in ('title', 'brand', 'model', 'category', 'condition', 'search_tags', 'notes'):
                if field in row_data:
                    setattr(row, field, str(row_data.get(field) or ''))
                    update_fields.append(field)
            if 'specifications' in row_data and isinstance(row_data.get('specifications'), dict):
                row.specifications = row_data['specifications']
                update_fields.append('specifications')
            if 'batch_flag' in row_data:
                row.batch_flag = bool(row_data.get('batch_flag'))
                update_fields.append('batch_flag')
            if 'final_price' in row_data:
                row.final_price = parse_decimal(row_data.get('final_price'))
                row.proposed_price = row.final_price
                row.pricing_stage = 'final' if row.final_price is not None else 'unpriced'
                update_fields.extend(['final_price', 'proposed_price', 'pricing_stage'])
            if 'pricing_notes' in row_data:
                row.pricing_notes = str(row_data.get('pricing_notes') or '')
                update_fields.append('pricing_notes')
            if update_fields:
                row.save(update_fields=list(dict.fromkeys(update_fields)))
                changed_rows.append(row)
        sync_summary = sync_manifest_row_outputs_to_items(order, changed_rows)
        if changed_rows:
            from apps.inventory.services.processing_manual_review_mirror import (
                mirror_manifest_rows_into_processing_bookmarks,
            )

            mirror_manifest_rows_into_processing_bookmarks(order, changed_rows)
            from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm

            refresh_processing_rows_denorm(order)
        return Response({
            'rows_updated': len(changed_rows),
            **sync_summary,
        })

    @action(detail=True, methods=['post'], url_path='finalize-preprocessing')
    def finalize_preprocessing(self, request, pk=None):
        """Materialize processing bookmarks from narrow final-layer staging fields; defer canonical build.

        Canonical ``ManifestRow`` / ``Product`` / ``Item`` creation runs via
        ``POST .../build-processing-data/`` so this stay fast and deterministic.
        """
        order = self.get_object()
        pr_qs = PreprocessingRow.objects.filter(purchase_order=order)
        if not pr_qs.exists():
            return Response(
                {'detail': 'Upload and standardize a manifest before finalizing.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.finalized_at:
            return Response(
                {'detail': 'Preprocessing is already finalized.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows_payload = request.data.get('rows')
        if rows_payload is not None:
            return Response(
                {
                    'detail': 'Save preprocessing review via PATCH preprocessing-review before finalizing.',
                    'code': 'finalize_with_rows_body',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        terminal_count = order.items.filter(status__in=TERMINAL_ITEM_STATUSES).count()
        if terminal_count:
            return Response(
                {
                    'detail': (
                        'Cannot finalize — some items are sold, scrapped, or lost. '
                        'Resolve inventory state before rebuilding manifest rows.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.inventory.services.processing_finalize import finalize_preprocessing_to_bookmarks

        t0 = time.perf_counter()
        finalization_logger.info(
            'finalize_preprocessing_start_fast order_id=%s staging_row_count=%s',
            order.id,
            pr_qs.count(),
        )

        try:
            n = finalize_preprocessing_to_bookmarks(order)
        except (ValidationError, DjangoValidationError) as exc:
            finalization_logger.warning(
                'finalize_preprocessing_validation_failed order_id=%s elapsed_ms=%.1f detail=%s',
                order.id,
                (time.perf_counter() - t0) * 1000,
                getattr(exc, 'detail', exc),
            )
            detail = _validation_error_response_detail(exc)
            if isinstance(detail, dict):
                return Response(detail, status=status.HTTP_400_BAD_REQUEST)
            if isinstance(detail, list):
                return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'detail': str(detail)}, status=status.HTTP_400_BAD_REQUEST)

        # Invalidate any still-in-flight cleanup batch: a batch that started before
        # finalize must not overwrite final_* (now projected into bookmarks) on landing.
        PurchaseOrder.objects.filter(pk=order.pk).update(
            ai_cleanup_generation=F('ai_cleanup_generation') + 1,
        )
        order.refresh_from_db()
        elapsed_ms = (time.perf_counter() - t0) * 1000
        finalization_logger.info(
            'finalize_preprocessing_complete_fast order_id=%s processing_bookmarks=%s elapsed_ms=%.1f',
            order.id,
            n,
            elapsed_ms,
        )
        return Response({
            'finalized_at': order.finalized_at.isoformat() if order.finalized_at else None,
            'processing_row_count': n,
        })

    @action(detail=True, methods=['post'], url_path='build-processing-data')
    def build_processing_data(self, request, pk=None):
        """Rebuild canonical ManifestRow/Product/Item from processing bookmarks."""

        order = self.get_object()
        if not order.finalized_at:
            return Response(
                {'detail': 'Finalize preprocessing before building processing data.', 'code': 'not_finalized'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.inventory.services.processing_finalize import build_manifest_from_processing_rows

        try:
            reset = bool(request.data.get('reset'))
            payload = build_manifest_from_processing_rows(order, request.user, reset=reset)
        except (ValidationError, DjangoValidationError) as exc:
            detail = _validation_error_response_detail(exc)
            status_code = status.HTTP_400_BAD_REQUEST
            if isinstance(detail, dict) and detail.get('code') == 'terminal_items_block':
                status_code = status.HTTP_409_CONFLICT
            if isinstance(detail, dict):
                return Response(detail, status=status_code)
            if isinstance(detail, list):
                return Response({'detail': detail}, status=status_code)
            return Response({'detail': str(detail)}, status=status_code)

        return Response(payload)

    @action(detail=True, methods=['get'], url_path='processing-data-build')
    def processing_data_build(self, request, pk=None):
        """Poll chunked processing-data build counters (no destructive work)."""
        order = self.get_object()
        if not order.finalized_at:
            return Response(
                {'detail': 'Finalize preprocessing before building processing data.', 'code': 'not_finalized'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.inventory.services.processing_finalize import get_processing_data_build_status

        try:
            payload = get_processing_data_build_status(order)
        except (ValidationError, DjangoValidationError) as exc:
            detail = _validation_error_response_detail(exc)
            if isinstance(detail, dict):
                return Response(detail, status=status.HTTP_400_BAD_REQUEST)
            if isinstance(detail, list):
                return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'detail': str(detail)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(payload)

    @action(detail=True, methods=['post'], url_path='processing-data-build/chunk')
    def processing_data_build_chunk(self, request, pk=None):
        """Process the next bounded chunk for a processing-data build."""
        order = self.get_object()
        if not order.finalized_at:
            return Response(
                {'detail': 'Finalize preprocessing before building processing data.', 'code': 'not_finalized'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.inventory.services.processing_finalize import process_processing_data_build_chunk

        try:
            payload = process_processing_data_build_chunk(order, request.user)
        except (ValidationError, DjangoValidationError) as exc:
            detail = _validation_error_response_detail(exc)
            status_code = status.HTTP_400_BAD_REQUEST
            if isinstance(detail, dict) and detail.get('code') == 'terminal_items_block':
                status_code = status.HTTP_409_CONFLICT
            if isinstance(detail, dict):
                return Response(detail, status=status_code)
            if isinstance(detail, list):
                return Response({'detail': detail}, status=status_code)
            return Response({'detail': str(detail)}, status=status_code)

        return Response(payload)

    @action(detail=True, methods=['post'], url_path='clear-processing-data')
    def clear_processing_data(self, request, pk=None):
        """Remove manifest/items/batches and return to finalized-preprocessing bookmarks (no rebuild)."""

        order = self.get_object()
        if not order.finalized_at:
            return Response(
                {'detail': 'Finalize preprocessing before clearing processing data.', 'code': 'not_finalized'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.inventory.services.processing_finalize import clear_processing_data_to_bookmarks_phase

        try:
            payload = clear_processing_data_to_bookmarks_phase(order)
        except (ValidationError, DjangoValidationError) as exc:
            detail = _validation_error_response_detail(exc)
            status_code = status.HTTP_400_BAD_REQUEST
            if isinstance(detail, dict) and detail.get('code') == 'terminal_items_block':
                status_code = status.HTTP_409_CONFLICT
            if isinstance(detail, dict):
                return Response(detail, status=status_code)
            if isinstance(detail, list):
                return Response({'detail': detail}, status=status_code)
            return Response({'detail': str(detail)}, status=status_code)

        return Response(payload)

    @action(detail=True, methods=['post'], url_path='preview-manifest-formulas')
    def preview_manifest_formulas(self, request, pk=None):
        """Evaluate mapping formulas against one raw row (debounced sample column on Step 1)."""
        order = self.get_object()
        if not order.manifest_id:
            return Response(
                {'detail': 'No manifest file uploaded for this order.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw_row = request.data.get('raw_row')
        formulas = request.data.get('formulas')
        if not isinstance(raw_row, dict):
            return Response({'detail': 'raw_row must be an object.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(formulas, dict):
            return Response({'detail': 'formulas must be an object.'}, status=status.HTTP_400_BAD_REQUEST)
        raw_as_strings = {str(k): '' if v is None else str(v) for k, v in raw_row.items()}
        results = {}
        errors = {}
        for target, formula in formulas.items():
            canon = coerce_mapping_target(str(target).strip())
            err = validate_mapping_target(canon)
            if err is not None and canon not in OPTIONAL_FLAT_TARGETS:
                errors[target] = 'unknown_target'
                continue
            if not isinstance(formula, str):
                errors[target] = 'invalid_formula_type'
                continue
            try:
                results[target] = evaluate_formula(formula, raw_as_strings)
            except FormulaError as exc:
                errors[target] = str(exc)
        return Response({'results': results, 'errors': errors})

    @action(detail=True, methods=['post'], url_path='match-products')
    def match_products(self, request, pk=None):
        """Deprecated — manifest match writes removed (P6). Use Final Decisions or assign shared product."""
        return Response(
            {
                'detail': (
                    'match-products is deprecated. Use Final Decisions during preprocessing '
                    'or Assign shared product in Item Processor.'
                ),
            },
            status=status.HTTP_410_GONE,
        )

    @action(detail=True, methods=['post'], url_path='suggest-finalization')
    def suggest_finalization(self, request, pk=None):
        """Ask the configured model to suggest formatting and spec fields for manifest rows."""
        import json as json_lib

        from apps.core.services.llm_router import LLMConfigError, llm_chat_text

        order = self.get_object()
        model_id = ai_model('SUGGEST_FINALIZATION', request.data.get('model'))

        rows = ManifestRow.objects.filter(purchase_order=order)[:50]
        rows_data = []
        for r in rows:
            rows_data.append({
                'row_id': r.id,
                'title': r.title or '',
                'brand': r.brand or '',
                'model': r.model or '',
                'category': _row_listing_category(r),
                'quantity': r.quantity,
                'unit_retail': str(r.unit_retail) if r.unit_retail else '',
            })

        system_prompt = (
            "You are a product data specialist for a thrift store. "
            "Clean up and standardize product data for each row. "
            "Suggest: clean title formatting, any relevant specification fields.\n\n"
            "Return ONLY valid JSON array:\n"
            '[{"row_id": N, "title": "Clean Title", "brand": "Brand", "model": "Model", '
            '"search_tags": "tag1, tag2", "specifications": {"key": "value"}, '
            '"batch_flag": true/false, "reasoning": "brief"}]'
        )

        try:
            content_text, model_used = llm_chat_text(
                purpose='SUGGEST_FINALIZATION',
                model_override=model_id,
                system=system_prompt,
                user=json_lib.dumps(rows_data),
                max_tokens=4096,
                log_source='ai_suggest_finalization',
                log_detail=f'order={order.pk} suggest-finalization',
            )

            json_match = re.search(r'\[[\s\S]*\]', content_text)
            if not json_match:
                finalization_logger.warning('AI finalization: no JSON array in response. Content length=%s', len(content_text))
                return Response(
                    {'error': 'AI returned non-JSON response.'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            try:
                suggestions = json_lib.loads(json_match.group())
            except json_lib.JSONDecodeError as parse_err:
                finalization_logger.warning('AI finalization: JSON parse failed: %s. Snippet: %s', parse_err, content_text[:500])
                return Response(
                    {'error': f'AI returned invalid JSON: {parse_err}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            return Response({
                'suggestions': suggestions,
                'model_used': model_used,
            })

        except LLMConfigError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            finalization_logger.error('AI finalization suggestion failed: %s', e)
            return Response(
                {'error': f'AI service error: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'], url_path='estimate-prices')
    def estimate_prices(self, request, pk=None):
        """Run the price estimator on all ManifestRows in this PO.

        Sets proposed_price on each unpriced row and pricing_stage to 'draft'.
        Returns a summary: total rows, estimated revenue, margin vs PO cost.
        """
        from .services.price_estimator import estimate_price as do_estimate
        from decimal import InvalidOperation

        order = self.get_object()
        rows = ManifestRow.objects.filter(purchase_order=order).select_related('matched_product')

        overwrite = bool(request.data.get('overwrite', False))
        updated = 0
        total_estimated_revenue = Decimal('0.00')
        skipped = 0

        rows_to_update = []
        for row in rows:
            if not overwrite and row.final_price is not None:
                skipped += 1
                total_estimated_revenue += (row.final_price or Decimal('0')) * (row.quantity or 1)
                continue
            if not overwrite and row.proposed_price is not None and row.pricing_stage in ('draft', 'final'):
                skipped += 1
                total_estimated_revenue += (row.proposed_price or Decimal('0')) * (row.quantity or 1)
                continue

            category_name = None
            if row.matched_product and row.matched_product.category:
                category_name = row.matched_product.category.name
            else:
                cat_tx = _row_listing_category(row)
                category_name = cat_tx if cat_tx else None

            result = do_estimate(
                title=row.title or '',
                brand=row.brand or None,
                model_name=row.model or None,
                category_name=category_name,
                condition=row.condition or 'unknown',
                source='purchased',
                retail_value=row.unit_retail,
                include_comparables=False,
            )

            row.proposed_price = result.estimated_price
            if row.pricing_stage == 'unpriced':
                row.pricing_stage = 'draft'
            row.pricing_notes = (
                f'AI estimate ({result.method}, {result.confidence:.0%} confidence). '
                f'Range: ${result.low_estimate}–${result.high_estimate}.'
            )
            rows_to_update.append(row)
            updated += 1
            total_estimated_revenue += result.estimated_price * (row.quantity or 1)

        if rows_to_update:
            ManifestRow.objects.bulk_update(
                rows_to_update,
                ['proposed_price', 'pricing_stage', 'pricing_notes'],
                batch_size=200,
            )

        margin = None
        if order.total_cost and total_estimated_revenue > 0:
            margin = float((total_estimated_revenue - order.total_cost) / order.total_cost * 100)

        return Response({
            'total_rows': rows.count(),
            'rows_estimated': updated,
            'rows_skipped': skipped,
            'estimated_revenue': str(total_estimated_revenue.quantize(Decimal('0.01'))),
            'po_cost': str(order.total_cost) if order.total_cost else None,
            'margin_pct': round(margin, 1) if margin is not None else None,
        })

    @action(detail=True, methods=['post'], url_path='finalize-rows')
    def finalize_rows(self, request, pk=None):
        """Bulk update finalized fields on manifest rows."""
        order = self.get_object()
        rows_payload = request.data.get('rows', [])
        if not isinstance(rows_payload, list):
            return Response({'detail': 'rows must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        rows_qs = ManifestRow.objects.filter(purchase_order=order)
        updated = 0

        for row_data in rows_payload:
            if not isinstance(row_data, dict):
                continue
            row_id = row_data.get('id')
            if not row_id:
                continue
            row = rows_qs.filter(id=row_id).first()
            if not row:
                continue

            update_fields = []
            for field in ('title', 'brand', 'model', 'category', 'condition',
                          'search_tags', 'notes'):
                if field in row_data:
                    setattr(row, field, str(row_data[field] or ''))
                    update_fields.append(field)

            if 'batch_flag' in row_data:
                row.batch_flag = bool(row_data['batch_flag'])
                update_fields.append('batch_flag')

            if 'specifications' in row_data and isinstance(row_data['specifications'], dict):
                row.specifications = row_data['specifications']
                update_fields.append('specifications')

            if 'final_price' in row_data:
                row.final_price = parse_decimal(row_data.get('final_price'))
                update_fields.append('final_price')

            if 'proposed_price' in row_data:
                row.proposed_price = parse_decimal(row_data.get('proposed_price'))
                update_fields.append('proposed_price')

            if update_fields:
                row.pricing_stage = 'final'
                update_fields.append('pricing_stage')
                row.save(update_fields=update_fields)
                updated += 1

        updated_rows = list(
            rows_qs.filter(pricing_stage='final')
            .select_related('matched_product', 'purchase_order')
            .prefetch_related('items')
        )
        sync_manifest_row_outputs_to_items(order, updated_rows)
        return Response({'rows_updated': updated, 'order_id': order.id})

    @action(detail=True, methods=['post'], url_path='create-items')
    def create_items(self, request, pk=None):
        """Open processing for pre-created manifest items without duplicating them."""
        order = self.get_object()
        if order.status not in ['delivered', 'processing', 'complete']:
            return Response(
                {
                    'detail': (
                        'Items can only be created after delivery. '
                        'You can standardize and price manifest rows before arrival.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = ManifestRow.objects.filter(
            purchase_order=order,
        ).select_related('matched_product')
        if not rows.exists():
            return Response(
                {'detail': 'No manifest rows to process.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ensure_summary = ensure_manifest_products_and_items(order, request.user)

        pr_by_mr_id = {
            pr.manifest_row_id: pr
            for pr in ProcessingRow.objects.filter(
                purchase_order=order,
                manifest_row_id__isnull=False,
            ).select_related('matched_product')
        }

        batch = ProcessingBatch.objects.filter(
            purchase_order=order,
        ).order_by('-started_at').first()
        if not batch:
            batch = ProcessingBatch.objects.create(
                purchase_order=order,
                status='in_progress',
                total_rows=rows.count(),
                processed_count=rows.count(),
                items_created=order.items.count(),
                started_at=timezone.now(),
                completed_at=timezone.now(),
                created_by=request.user,
            )

        if order.status == 'delivered':
            order.status = 'processing'
            order.item_count = order.items.count()
            order.save(update_fields=['status', 'item_count', 'updated_at'])

        return Response({
            'batch_id': batch.id if batch else None,
            'items_created': ensure_summary['items_created'],
            'items_updated': ensure_summary['items_updated'],
            'item_count': order.items.count(),
            'batch_groups_created': 0,
        })

    @action(detail=True, methods=['post'], url_path='check-in-items')
    def check_in_items(self, request, pk=None):
        """Bulk check-in selected order items and mark them shelf-ready."""
        order = self.get_object()
        item_ids = parse_id_list(request.data.get('item_ids') or [])
        selected_statuses = request.data.get('statuses') or []

        items_qs = order.items.exclude(status__in=['sold', 'scrapped', 'lost'])
        if item_ids:
            items_qs = items_qs.filter(id__in=item_ids)
        if selected_statuses:
            items_qs = items_qs.filter(status__in=selected_statuses)

        items = list(items_qs.select_related('product'))
        if not items:
            return Response(
                {'detail': 'No items found for check-in.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared_updates = {}
        if 'price' in request.data:
            parsed_price = parse_decimal(request.data.get('price'))
            if parsed_price is not None:
                shared_updates['price'] = parsed_price
        if 'unit_retail' in request.data:
            ur = parse_decimal(request.data.get('unit_retail'))
            if ur is not None:
                shared_updates['retail'] = ur
        elif 'retail_value' in request.data:
            ur = parse_decimal(request.data.get('retail_value'))
            if ur is not None:
                shared_updates['retail'] = ur
        for field in ['condition', 'location', 'notes']:
            if field in request.data:
                value = request.data.get(field)
                if value is not None:
                    shared_updates[field] = value

        now = timezone.now()
        histories = []
        checked_in = 0

        for item in items:
            changed = apply_item_updates(item, shared_updates)
            old_status = item.status
            item.status = 'on_shelf'
            item.listed_at = now
            item.checked_in_at = now
            item.checked_in_by = request.user
            item.save()
            checked_in += 1

            if old_status != 'on_shelf':
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type='status_change',
                        old_value=old_status,
                        new_value='on_shelf',
                        note='Checked in and marked shelf-ready',
                        created_by=request.user,
                    ),
                )

            for field, old_value, new_value in changed:
                histories.append(
                    ItemHistory(
                        item=item,
                        event_type=history_event_type_for_field(field),
                        old_value='' if old_value is None else str(old_value),
                        new_value='' if new_value is None else str(new_value),
                        note=f'Bulk check-in updated {field}',
                        created_by=request.user,
                    ),
                )

        if histories:
            ItemHistory.objects.bulk_create(histories, batch_size=1000)

        if order.status in ['delivered', 'ordered', 'paid', 'shipped']:
            order.status = 'processing'
            order.save(update_fields=['status', 'updated_at'])

        return Response({
            'checked_in': checked_in,
            'order_status': order.status,
        })

    @action(detail=True, methods=['post'], url_path='mark-items-broken')
    def mark_items_broken(self, request, pk=None):
        """Bulk mark selected order items as scrapped (broken)."""
        order = self.get_object()
        item_ids = parse_id_list(request.data.get('item_ids') or [])
        if not item_ids:
            return Response(
                {'detail': 'item_ids required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        items = list(order.items.filter(id__in=item_ids).exclude(status__in=['sold', 'scrapped', 'lost']))
        if not items:
            return Response(
                {'detail': 'No items found to mark broken.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        histories = []
        for item in items:
            old_status = item.status
            item.status = 'scrapped'
            item.save()
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='status_change',
                    old_value=old_status,
                    new_value='scrapped',
                    note='Bulk marked broken',
                    created_by=request.user,
                ),
            )
        if histories:
            ItemHistory.objects.bulk_create(histories, batch_size=1000)
        return Response({'marked_broken': len(items)})

    @action(detail=True, methods=['post'], url_path='uncheck-in-items')
    def uncheck_in_items(self, request, pk=None):
        """Bulk revert selected order items to intake so they can be re-processed."""
        order = self.get_object()
        item_ids = parse_id_list(request.data.get('item_ids') or [])
        if not item_ids:
            return Response(
                {'detail': 'item_ids required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        items = list(order.items.filter(id__in=item_ids))
        if not items:
            return Response(
                {'detail': 'No items found to uncheck.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        histories = []
        for item in items:
            old_status = item.status
            item.status = 'intake'
            item.checked_in_at = None
            item.checked_in_by = None
            item.listed_at = None
            item.save()
            histories.append(
                ItemHistory(
                    item=item,
                    event_type='status_change',
                    old_value=old_status,
                    new_value='intake',
                    note='Bulk unchecked in',
                    created_by=request.user,
                ),
            )
        if histories:
            ItemHistory.objects.bulk_create(histories, batch_size=1000)
        return Response({'unchecked_in': len(items)})

    @action(detail=True, methods=['post'], url_path='mark-complete')
    def mark_complete(self, request, pk=None):
        """Mark a purchase order complete when no intake/processing items remain."""
        order = self.get_object()
        pending = order.items.filter(status__in=['intake', 'processing']).count()
        if pending > 0:
            return Response(
                {'detail': f'{pending} item(s) still pending processing.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = 'complete'
        order.save(update_fields=['status', 'updated_at'])
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=['get'], url_path='processing-workspace')
    def processing_workspace(self, request, pk=None):
        from apps.inventory.services.processing_workspace import build_processing_workspace

        order = self.get_object()

        def _qint(name: str, default: int) -> int:
            raw = request.query_params.get(name)
            if raw is None or str(raw).strip() == '':
                return default
            try:
                return int(raw)
            except ValueError:
                return default

        segment = str(request.query_params.get('segment') or 'all').strip() or 'all'
        search = str(request.query_params.get('search') or '').strip()
        product_raw = request.query_params.get('product_id')
        product_id = None
        if product_raw not in (None, '') and str(product_raw).strip().isdigit():
            product_id = int(str(product_raw).strip())
        hci_raw = str(request.query_params.get('hide_checked_in') or 'true').strip().lower()
        hide_checked_in = hci_raw not in {'0', 'false', 'no'}

        return Response(
            build_processing_workspace(
                order,
                limit=_qint('limit', 25),
                offset=_qint('offset', 0),
                segment=segment,
                product_id=product_id,
                search=search,
                hide_checked_in=hide_checked_in,
            ),
        )

    @action(detail=True, methods=['get'], url_path='processing-row-detail')
    def processing_row_detail(self, request, pk=None):
        from apps.inventory.services.processing_workspace import build_processing_row_detail

        order = self.get_object()
        raw = request.query_params.get('processing_row_id')
        if raw is None or not str(raw).strip().isdigit():
            return Response({'detail': 'processing_row_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payload = build_processing_row_detail(order, processing_row_id=int(raw))
        except LookupError:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)

    @action(detail=True, methods=['post'], url_path='processing-row-check-in')
    def processing_row_check_in_action(self, request, pk=None):
        from apps.inventory.processing_ops import ProcessingDataRequired, processing_row_check_in

        order = self.get_object()
        raw = request.data.get('processing_row_id') or request.data.get('processingRowId')
        if raw is None or not str(raw).strip().isdigit():
            return Response({'detail': 'processing_row_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(processing_row_check_in(request.user, order, int(str(raw).strip()), request.data))
        except ProcessingRow.DoesNotExist:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        except ProcessingDataRequired as e:
            return Response(
                {'detail': str(e), 'code': 'processing_data_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-check-in-together')
    def processing_check_in_together_action(self, request, pk=None):
        from apps.inventory.processing_ops import ProcessingDataRequired, processing_check_in_together

        order = self.get_object()
        try:
            return Response(processing_check_in_together(request.user, order, request.data))
        except ProcessingDataRequired as e:
            return Response(
                {'detail': str(e), 'code': 'processing_data_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-assign-shared-product')
    def processing_assign_shared_product_action(self, request, pk=None):
        from apps.inventory.processing_ops import processing_assign_shared_product

        order = self.get_object()
        try:
            return Response(processing_assign_shared_product(request.user, order, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-collapse-rows')
    def processing_collapse_rows_action(self, request, pk=None):
        from apps.inventory.processing_ops import processing_collapse_rows

        order = self.get_object()
        try:
            return Response(processing_collapse_rows(request.user, order, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-uncollapse-rows')
    def processing_uncollapse_rows_action(self, request, pk=None):
        from apps.inventory.processing_ops import processing_uncollapse_rows

        order = self.get_object()
        try:
            return Response(processing_uncollapse_rows(request.user, order, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-break-apart-row')
    def processing_break_apart_row_action(self, request, pk=None):
        from apps.inventory.services.processing_transforms import processing_break_apart_row

        order = self.get_object()
        try:
            return Response(processing_break_apart_row(request.user, order, request.data))
        except ProcessingRow.DoesNotExist:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-make-set-row')
    def processing_make_set_row_action(self, request, pk=None):
        from apps.inventory.services.processing_transforms import processing_make_set_row

        order = self.get_object()
        try:
            return Response(processing_make_set_row(request.user, order, request.data))
        except ProcessingRow.DoesNotExist:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-restart-row')
    def processing_restart_row_action(self, request, pk=None):
        from apps.inventory.services.processing_transforms import processing_restart_row

        order = self.get_object()
        try:
            return Response(processing_restart_row(request.user, order, request.data))
        except ProcessingRow.DoesNotExist:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True,
        methods=['post'],
        url_path=r'processing-check-in-batch/(?P<batch_id>[0-9]+)/remap-product',
    )
    def processing_check_in_batch_remap_product(self, request, pk=None, batch_id=None):
        from apps.inventory.processing_ops import remap_check_in_batch_product

        order = self.get_object()
        try:
            batch_pk = int(str(batch_id).strip())
        except (TypeError, ValueError):
            return Response({'detail': 'batch_id must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(remap_check_in_batch_product(request.user, order, batch_pk, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True,
        methods=['post'],
        url_path=r'processing-check-in-batch/(?P<batch_id>[0-9]+)/delete',
    )
    def processing_check_in_batch_delete(self, request, pk=None, batch_id=None):
        from apps.inventory.processing_ops import delete_check_in_batch

        order = self.get_object()
        try:
            batch_pk = int(str(batch_id).strip())
        except (TypeError, ValueError):
            return Response({'detail': 'batch_id must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(delete_check_in_batch(request.user, order, batch_pk))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True,
        methods=['post'],
        url_path=r'processing-check-in-batch/(?P<batch_id>[0-9]+)/update',
    )
    def processing_check_in_batch_update(self, request, pk=None, batch_id=None):
        from apps.inventory.processing_ops import update_check_in_batch

        order = self.get_object()
        try:
            batch_pk = int(str(batch_id).strip())
        except (TypeError, ValueError):
            return Response({'detail': 'batch_id must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(update_check_in_batch(request.user, order, batch_pk, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-row-set-product')
    def processing_row_set_product_action(self, request, pk=None):
        from apps.inventory.processing_ops import ProcessingDataRequired, processing_row_set_product_decision

        order = self.get_object()
        raw = request.data.get('processing_row_id') or request.data.get('processingRowId')
        if raw is None or not str(raw).strip().isdigit():
            return Response({'detail': 'processing_row_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(
                processing_row_set_product_decision(request.user, order, int(str(raw).strip()), request.data),
            )
        except ProcessingRow.DoesNotExist:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        except ProcessingDataRequired as e:
            return Response(
                {'detail': str(e), 'code': 'processing_data_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'], url_path='processing-row-patch')
    def processing_row_patch_action(self, request, pk=None):
        from apps.inventory.processing_ops import processing_row_patch

        order = self.get_object()
        raw = request.data.get('processing_row_id') or request.data.get('processingRowId')
        if raw is None or not str(raw).strip().isdigit():
            return Response({'detail': 'processing_row_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(processing_row_patch(request.user, order, int(str(raw).strip()), request.data))
        except ProcessingRow.DoesNotExist:
            return Response({'detail': 'Processing row not found for this order.'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-add-item')
    def processing_add_item_action(self, request, pk=None):
        from apps.inventory.processing_ops import processing_add_item

        order = self.get_object()
        try:
            return Response(processing_add_item(request.user, order, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-print-multiple')
    def processing_print_multiple_action(self, request, pk=None):
        from apps.inventory.processing_ops import ProcessingDataRequired, processing_print_multiple

        order = self.get_object()
        try:
            return Response(processing_print_multiple(request.user, order, request.data))
        except ProcessingDataRequired as e:
            return Response(
                {'detail': str(e), 'code': 'processing_data_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-dispute')
    def processing_dispute_action(self, request, pk=None):
        from apps.inventory.processing_ops import ProcessingDataRequired, processing_dispute

        order = self.get_object()
        try:
            return Response(processing_dispute(request.user, order, request.data))
        except ProcessingDataRequired as e:
            return Response(
                {'detail': str(e), 'code': 'processing_data_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='processing-bulk-disposition')
    def processing_bulk_disposition_action(self, request, pk=None):
        from apps.inventory.processing_ops import ProcessingDataRequired, processing_bulk_disposition

        order = self.get_object()
        try:
            return Response(processing_bulk_disposition(request.user, order, request.data))
        except ProcessingDataRequired as e:
            return Response(
                {'detail': str(e), 'code': 'processing_data_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='delete-preview')
    def delete_preview(self, request, pk=None):
        """Preview reverse-sequence deletion counts before purging an order."""
        order = self.get_object()
        return Response(build_order_delete_preview(order, include_items=True))

    @action(detail=True, methods=['post'], url_path='purge-delete')
    def purge_delete(self, request, pk=None):
        """
        Purge all order-owned artifacts in reverse sequence, then delete the order.

        Requires confirm_order_number to guard accidental destructive deletion.
        """
        order = self.get_object()
        confirmation = str(request.data.get('confirm_order_number') or '').strip()
        if not confirmation:
            return Response(
                {'detail': 'confirm_order_number is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if confirmation != order.order_number:
            return Response(
                {'detail': 'Confirmation value does not match this order number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        preview = build_order_delete_preview(order, include_items=False)
        deleted = {
            'item_history': 0,
            'item_scans': 0,
            'items': 0,
            'batch_groups': 0,
            'processing_batches': 0,
            'manifest_rows': 0,
            'manifest_file': 0,
            'order': 0,
        }

        manifest_file = order.manifest
        manifest_key = manifest_file.key if manifest_file else ''
        manifest_file_id = manifest_file.id if manifest_file else None
        manifest_file_shared = False
        if manifest_file_id:
            manifest_file_shared = PurchaseOrder.objects.filter(
                manifest_id=manifest_file_id,
            ).exclude(id=order.id).exists()

        order_id = order.id
        order_number = order.order_number

        with transaction.atomic():
            item_history_qs = ItemHistory.objects.filter(item__purchase_order=order)
            deleted['item_history'] = item_history_qs.count()
            if deleted['item_history']:
                item_history_qs.delete()

            item_scan_qs = ItemScanHistory.objects.filter(item__purchase_order=order)
            deleted['item_scans'] = item_scan_qs.count()
            if deleted['item_scans']:
                item_scan_qs.delete()

            items_qs = Item.objects.filter(purchase_order=order)
            deleted['items'] = items_qs.count()
            if deleted['items']:
                items_qs.delete()

            batch_qs = BatchGroup.objects.filter(purchase_order=order)
            deleted['batch_groups'] = batch_qs.count()
            if deleted['batch_groups']:
                batch_qs.delete()

            processing_batch_qs = ProcessingBatch.objects.filter(purchase_order=order)
            deleted['processing_batches'] = processing_batch_qs.count()
            if deleted['processing_batches']:
                processing_batch_qs.delete()

            manifest_rows_qs = ManifestRow.objects.filter(purchase_order=order)
            deleted['manifest_rows'] = manifest_rows_qs.count()
            if deleted['manifest_rows']:
                manifest_rows_qs.delete()

            if manifest_file_id and not manifest_file_shared:
                deleted['manifest_file'] = 1
                S3File.objects.filter(id=manifest_file_id).delete()

            order.delete()
            deleted['order'] = 1

        if deleted['manifest_file'] and manifest_key:
            try:
                default_storage.delete(manifest_key)
            except Exception:
                # Storage cleanup failures should not rollback DB purge.
                pass

        return Response({
            'order_id': order_id,
            'order_number': order_number,
            'deleted': deleted,
            'steps': preview.get('steps', []),
            'manifest_file_shared': manifest_file_shared,
        })


class CSVTemplateViewSet(viewsets.ModelViewSet):
    queryset = CSVTemplate.objects.select_related('vendor').all()
    serializer_class = CSVTemplateSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['vendor', 'header_signature', 'is_default']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['product_number', 'title', 'brand', 'model', 'category__name', 'identifiers', 'tags']
    ordering_fields = ['title', 'created_at']

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            item_count = Item.objects.filter(product_id=product.pk).count()
            return Response(
                {
                    'detail': (
                        f'Cannot delete product {product.product_number or product.pk}; '
                        f'{item_count} item{"s" if item_count != 1 else ""} still reference it.'
                    ),
                    'item_count': item_count,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=['get'], url_path='usage')
    def usage(self, request, pk=None):
        """Blast radius for editing this catalog product: how many Items across how many POs share it."""
        product = self.get_object()
        item_qs = Item.objects.filter(product_id=product.pk)
        agg = item_qs.aggregate(
            item_count=Count('id'),
            order_count=Count('purchase_order_id', distinct=True),
        )
        item_count = agg['item_count'] or 0

        recent_orders = [
            {
                'order_number': row['order_number'] or f"PO #{row['id']}",
                'ordered_date': row['ordered_date'].isoformat() if row['ordered_date'] else None,
            }
            for row in (
                PurchaseOrder.objects
                .filter(items__product_id=product.pk)
                .distinct()
                .order_by('-ordered_date', '-id')
                .values('id', 'order_number', 'ordered_date')[:5]
            )
        ]

        status_counts = []
        status_labels = dict(Item.STATUS_CHOICES)
        for row in item_qs.values('status').annotate(count=Count('id')).order_by('status'):
            count = row['count'] or 0
            status_counts.append({
                'status': row['status'] or '',
                'label': status_labels.get(row['status'], row['status'] or 'Unknown'),
                'count': count,
                'pct': round((count / item_count * 100), 1) if item_count else 0,
            })

        on_shelf_total = item_qs.filter(status='on_shelf').count()
        on_shelf_locations = []
        for row in (
            item_qs.filter(status='on_shelf')
            .values('location')
            .annotate(count=Count('id'))
            .order_by('-count', 'location')[:8]
        ):
            count = row['count'] or 0
            location = str(row['location'] or '').strip() or 'No location'
            on_shelf_locations.append({
                'location': location,
                'count': count,
                'pct': round((count / on_shelf_total * 100), 1) if on_shelf_total else 0,
            })

        sold_qs = item_qs.filter(status='sold')
        sold_agg = sold_qs.aggregate(
            sold_count=Count('id'),
            avg_sold_price=Avg('sold_for'),
            avg_cost=Avg('cost'),
            avg_profit=Avg(
                ExpressionWrapper(
                    F('sold_for') - F('cost'),
                    output_field=DecimalField(max_digits=10, decimal_places=2),
                ),
            ),
        )
        return Response({
            'product_id': product.pk,
            'item_count': item_count,
            'order_count': agg['order_count'] or 0,
            'recent_orders': recent_orders,
            'status_counts': status_counts,
            'on_shelf_count': on_shelf_total,
            'on_shelf_locations': on_shelf_locations,
            'sold_count': sold_agg['sold_count'] or 0,
            'avg_sold_price': str(sold_agg['avg_sold_price']) if sold_agg['avg_sold_price'] is not None else None,
            'avg_cost': str(sold_agg['avg_cost']) if sold_agg['avg_cost'] is not None else None,
            'avg_profit': str(sold_agg['avg_profit']) if sold_agg['avg_profit'] is not None else None,
        })

    @action(detail=False, methods=['post'], url_path='suggest')
    def suggest_product(self, request):
        """AI-assisted catalog copy for Product CRUD (structured JSON)."""
        import json as json_lib
        import time as _time

        from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

        t_total = _time.perf_counter()
        timing: dict = {}

        try:
            fields = request.data.get('fields') or []
            context = request.data.get('context') or {}
            model_id = ai_model('SUGGEST_PRODUCT', request.data.get('model'))

            if not isinstance(fields, list) or not fields:
                return Response(
                    {'error': 'fields must be a non-empty list of field names.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed = {
                'title', 'brand', 'model', 'category', 'tags', 'identifiers', 'specifications',
            }
            fields = [f for f in fields if f in allowed]
            if not fields:
                return Response(
                    {'error': 'No valid fields requested.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            title = (context.get('title') or '')[:500]
            brand = (context.get('brand') or '')[:200]
            category = (context.get('category') or '')[:200]
            model_ctx = (context.get('model') or '')[:200]

            category_options = context.get('category_options') or []
            if not isinstance(category_options, list):
                category_options = []
            category_option_set = {
                str(x).strip() for x in category_options if str(x).strip()
            }

            t0 = _time.perf_counter()
            store_examples, examples_used = retrieve_listing_examples_for_prompt(
                title, brand or None, category or None, None,
            )
            timing['db_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            draft_keys = ['title', 'brand', 'model', 'category', 'tags', 'identifiers', 'specifications']
            user_payload = {
                'requested_fields': fields,
                'draft': {k: context.get(k, '' if k not in ('tags',) else []) for k in draft_keys},
                'allowed_categories': sorted(category_option_set),
                'store_examples': store_examples,
            }

            category_lines = '\n'.join(f'- {name}' for name in sorted(category_option_set))
            system_prompt = (
                PRODUCT_CATALOG_STANDARDS
                + '\n\n'
                + 'If you return a suggestion for "category", it MUST be exactly one of these strings:\n'
                + (category_lines or '- (no categories provided — omit category)')
                + '\n\n'
                + FEW_SHOT_SUGGEST_PRODUCT
                + '\n'
                + PRODUCT_OUTPUT_SCHEMA_HINT
                + '\n\n'
                + 'The user message is JSON with requested_fields, draft, allowed_categories, and store_examples. '
                'store_examples are for style only; do not copy SKUs/prices as facts about the draft product.'
            )

            user_message_json = json_lib.dumps(user_payload)
            user_message_json_pretty = json_lib.dumps(user_payload, indent=2)
            if suggest_logger.active_targets() & {'django', 'file'}:
                prompt_blob = (
                    f'\n[suggest_product] model={model_id!r}\n'
                    f'--- SYSTEM PROMPT ({len(system_prompt)} chars) ---\n'
                    f'{system_prompt}\n'
                    f'--- USER MESSAGE ---\n'
                    f'{user_message_json_pretty}\n'
                    f'--- END suggest_product ---\n'
                )
                suggest_logger.info('%s', prompt_blob)

            t0 = _time.perf_counter()
            response = llm_complete(
                model_id=model_id,
                system=system_prompt,
                user=user_message_json,
                max_tokens=1024,
                timeout=60.0,
                log_source='suggest_product',
                log_detail='POST suggest_product',
            )
            timing['api_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            content_text = response.text

            if suggest_logger.active_targets() & {'django', 'file'}:
                suggest_logger.info('%s', '--- AI RESPONSE (raw) ---\n' + content_text[:50000])

            if not (content_text or '').strip():
                suggest_logger.warning('suggest_product empty content from model=%s', model_id)
                return Response(
                    {
                        'error': 'AI returned an empty response. Check the provider API key and model id, then try again.',
                        'examples_used': examples_used,
                        'timing': timing,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            out, parsed = _suggest_product_parse_suggestions_from_text(content_text, fields, allowed)
            if not isinstance(parsed, dict) or out is None:
                suggest_logger.warning(
                    'suggest_product could not parse suggestions JSON; model=%s content_len=%s preview=%s',
                    model_id,
                    len(content_text),
                    content_text[:800],
                )
                return Response(
                    {
                        'error': 'Could not parse AI response as JSON. Try again or pick another model.',
                        'examples_used': examples_used,
                        'timing': timing,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            if 'category' in fields and 'category' in out and category_option_set:
                cv = str(out['category']).strip()
                if cv and cv not in category_option_set:
                    retry_user = json.dumps({
                        'instruction': (
                            'Your previous answer used category %r which is not allowed. '
                            'Return ONLY a JSON object with the same structure as required before, '
                            'but category must be exactly one of the strings in allowed_categories.'
                        ) % (cv,),
                        'allowed_categories': sorted(category_option_set),
                    })
                    t_retry = _time.perf_counter()
                    response_retry = llm_complete(
                        model_id=model_id,
                        system=system_prompt,
                        messages=[
                            {'role': 'user', 'content': user_message_json},
                            {'role': 'assistant', 'content': content_text},
                            {'role': 'user', 'content': retry_user},
                        ],
                        max_tokens=1024,
                        timeout=60.0,
                        log_source='suggest_product',
                        log_detail='POST suggest_product category retry',
                    )
                    timing['api_retry_ms'] = round((_time.perf_counter() - t_retry) * 1000, 1)
                    content_retry = response_retry.text
                    out_retry, parsed_retry = _suggest_product_parse_suggestions_from_text(
                        content_retry, fields, allowed,
                    )
                    if out_retry is not None and isinstance(parsed_retry, dict):
                        out = out_retry
                        parsed = parsed_retry

            low_confidence = parsed.get('low_confidence', False) is True
            low_confidence_reason = ''
            if low_confidence:
                low_confidence_reason = str(parsed.get('low_confidence_reason', ''))[:500]

            usage_out = {
                'input_tokens': response.input_tokens,
                'output_tokens': response.output_tokens,
            }

            timing['total_ms'] = round((_time.perf_counter() - t_total) * 1000, 1)

            payload = {
                'suggestions': out,
                'low_confidence': low_confidence,
                'low_confidence_reason': low_confidence_reason,
                'usage': usage_out,
                'examples_used': examples_used,
                'timing': timing,
            }
            if suggest_logger.should_log_browser():
                payload['debug'] = {
                    'model': model_id,
                    'system_prompt': system_prompt,
                    'user_message': user_message_json_pretty,
                }
            return Response(payload)

        except LLMConfigError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except LLMAPIError as e:
            suggest_logger.warning('suggest_product LLM error: %s', e)
            detail = str(e)
            if e.status_code is not None:
                detail = f'{detail} (HTTP {e.status_code})'
            return Response(
                {
                    'error': (
                        'AI service error. '
                        'Confirm the provider API key and that the model id is valid for your account. '
                        f'Detail: {detail}'
                    ),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except json_lib.JSONDecodeError as e:
            return Response(
                {'error': f'Failed to parse AI response: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as e:
            suggest_logger.exception('suggest_product unexpected error')
            return Response(
                {'error': f'AI suggest failed: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['get'], url_path='check-in-orders')
    def check_in_orders(self, request):
        """Preferred purchase orders for product-first check-in (misfit default, manual adds, search)."""
        from apps.inventory.processing_ops import product_check_in_order_options

        raw_limit = request.query_params.get('limit') or '25'
        try:
            limit = max(1, min(50, int(raw_limit)))
        except (TypeError, ValueError):
            limit = 25
        search = (request.query_params.get('search') or request.query_params.get('q') or '').strip()
        orders = product_check_in_order_options(search=search, limit=limit)
        return Response({'orders': orders})

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Create on-shelf items for a locked catalog product on a selected purchase order."""
        from apps.inventory.processing_ops import MAX_CHECK_IN_QUANTITY, product_check_in

        product = self.get_object()
        data = request.data if isinstance(request.data, dict) else {}
        try:
            quantity = int(data.get('quantity') or 1)
        except (TypeError, ValueError):
            quantity = 1
        if quantity < 1:
            return Response({'detail': 'quantity must be at least 1'}, status=status.HTTP_400_BAD_REQUEST)
        if quantity > MAX_CHECK_IN_QUANTITY:
            return Response(
                {'detail': f'Quantity {quantity:,} exceeds the {MAX_CHECK_IN_QUANTITY:,} per-action safety limit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = product_check_in(request.user, product, {**data, 'quantity': quantity})
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'product_id': result['product_id'],
            'purchase_order_id': result['purchase_order_id'],
            'created_count': result['created_count'],
            'created_item_ids': result['created_item_ids'],
            'processing_row_id': result['processing_row_id'],
            'check_in_batch_id': result.get('check_in_batch_id'),
            'printed_items_preview': result.get('printed_items_preview') or [],
        }, status=status.HTTP_201_CREATED)


class BatchGroupViewSet(viewsets.ModelViewSet):
    serializer_class = BatchGroupSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'purchase_order', 'product']
    search_fields = ['batch_number', 'product__title', 'purchase_order__order_number']
    ordering_fields = ['created_at', 'processed_at', 'batch_number']
    ordering = ['-created_at']

    def get_queryset(self):
        return BatchGroup.objects.select_related(
            'product', 'purchase_order', 'manifest_row', 'processed_by',
        ).annotate(
            items_count=Value(0, output_field=IntegerField()),
            intake_items_count=Value(0, output_field=IntegerField()),
        )

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Apply shared processing values to all batch items."""
        return Response(
            {'detail': 'Batch item processing is retired; process items from the item processor.'},
            status=status.HTTP_410_GONE,
        )

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Check in pending items in this batch. Optional check_in_count and scrap_count for partial."""
        return Response(
            {'detail': 'Batch item check-in is retired; check in items from the item processor.'},
            status=status.HTTP_410_GONE,
        )
        batch = self.get_object()
        unit_price = request.data.get('unit_price')
        unit_cost = request.data.get('unit_cost')
        condition = request.data.get('condition')
        location = request.data.get('location')
        check_in_count = request.data.get('check_in_count')
        scrap_count = request.data.get('scrap_count')

        update_fields = []
        if unit_price is not None:
            batch.unit_price = parse_decimal(unit_price)
            update_fields.append('unit_price')
        if unit_cost is not None:
            batch.unit_cost = parse_decimal(unit_cost)
            update_fields.append('unit_cost')
        if condition:
            batch.condition = condition
            update_fields.append('condition')
        if location is not None:
            batch.location = location
            update_fields.append('location')

        batch.status = 'in_progress'
        batch.processed_by = request.user
        update_fields.extend(['status', 'processed_by', 'updated_at'])
        batch.save(update_fields=update_fields)

        pending_qs = batch.items.exclude(status__in=['sold', 'scrapped', 'lost']).order_by('id')
        pending_ids = list(pending_qs.values_list('id', flat=True))
        now = timezone.now()

        # Partial check-in: optional check_in_count and scrap_count
        try:
            scrap_n = int(scrap_count) if scrap_count is not None else 0
            check_n = int(check_in_count) if check_in_count is not None else None
        except (TypeError, ValueError):
            scrap_n = 0
            check_n = None

        if scrap_n < 0:
            scrap_n = 0
        if check_n is not None and check_n < 0:
            check_n = None

        if scrap_n > 0 or (check_n is not None and check_n > 0):
            # Partial: first scrap_n -> scrapped, next check_n -> on_shelf
            scrap_ids = pending_ids[:scrap_n] if scrap_n else []
            check_ids = (
                pending_ids[scrap_n:scrap_n + check_n]
                if check_n is not None and check_n > 0
                else (pending_ids[scrap_n:] if check_n is None else [])
            )
            if check_n is None and not scrap_ids:
                check_ids = pending_ids[:]

            if scrap_ids:
                Item.objects.filter(id__in=scrap_ids).update(status='scrapped')
                ItemHistory.objects.bulk_create(
                    [
                        ItemHistory(
                            item_id=iid,
                            event_type='status_change',
                            old_value='intake',
                            new_value='scrapped',
                            note=f'Marked broken via {batch.batch_number}',
                            created_by=request.user,
                        )
                        for iid in scrap_ids
                    ],
                    batch_size=1000,
                )

            if check_ids:
                updates = {
                    'status': 'on_shelf',
                    'listed_at': now,
                    'checked_in_at': now,
                    'checked_in_by': request.user,
                }
                if batch.unit_price is not None:
                    updates['price'] = batch.unit_price
                if batch.unit_cost is not None:
                    updates['unit_retail'] = batch.unit_cost
                if batch.condition:
                    updates['condition'] = batch.condition
                if batch.location:
                    updates['location'] = batch.location
                Item.objects.filter(id__in=check_ids).update(**updates)
                ItemHistory.objects.bulk_create(
                    [
                        ItemHistory(
                            item_id=item_id,
                            event_type='batch_processed',
                            note=f'Checked in via {batch.batch_number}',
                            created_by=request.user,
                        )
                        for item_id in check_ids
                    ],
                    batch_size=1000,
                )

            remaining = len(pending_ids) - len(scrap_ids) - len(check_ids)
            if remaining <= 0:
                batch.status = 'complete'
                batch.processed_at = now
                batch.save(update_fields=['status', 'processed_at', 'updated_at'])

            serializer = self.get_serializer(batch)
            data = serializer.data
            data['checked_in'] = len(check_ids)
            data['marked_broken'] = len(scrap_ids)
            return Response(data)

        # Full check-in (existing behavior)
        checked_in_count = batch.apply_to_items()
        if pending_ids:
            Item.objects.filter(id__in=pending_ids).update(
                checked_in_at=now,
                checked_in_by=request.user,
            )
            ItemHistory.objects.bulk_create(
                [
                    ItemHistory(
                        item_id=item_id,
                        event_type='batch_processed',
                        note=f'Checked in via {batch.batch_number}',
                        created_by=request.user,
                    )
                    for item_id in pending_ids
                ],
                batch_size=1000,
            )

        serializer = self.get_serializer(batch)
        data = serializer.data
        data['checked_in'] = checked_in_count
        return Response(data)

    @action(detail=True, methods=['post'])
    def detach(self, request, pk=None):
        """Detach one item from a batch into individual processing."""
        return Response(
            {'detail': 'Batch item detaching is retired; items are no longer batch-grouped.'},
            status=status.HTTP_410_GONE,
        )
        batch = self.get_object()
        item_id = request.data.get('item_id')

        item_qs = batch.items.exclude(status__in=['sold', 'scrapped', 'lost'])
        if item_id:
            item = item_qs.filter(id=item_id).first()
        else:
            item = item_qs.order_by('id').first()

        if not item:
            return Response(
                {'detail': 'No detachable item found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_batch = batch.batch_number
        item.batch_group = None
        item.processing_tier = 'individual'
        item.status = 'processing'
        item.save(update_fields=['batch_group', 'processing_tier', 'status', 'updated_at'])

        ItemHistory.objects.create(
            item=item,
            event_type='detached_from_batch',
            old_value=old_batch,
            new_value='individual',
            note=f'Detached from {old_batch}',
            created_by=request.user,
        )

        remaining = batch.items.count()
        batch.total_qty = remaining
        if remaining == 0 and batch.status != 'complete':
            batch.status = 'complete'
            batch.processed_at = timezone.now()
            batch.save(update_fields=['total_qty', 'status', 'processed_at', 'updated_at'])
        else:
            batch.save(update_fields=['total_qty', 'updated_at'])

        return Response({
            'detached_item_id': item.id,
            'detached_item_sku': item.sku,
            'remaining_in_batch': remaining,
        })


class VendorProductRefViewSet(viewsets.ModelViewSet):
    queryset = VendorProductRef.objects.select_related('vendor', 'product').all()
    serializer_class = VendorProductRefSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['vendor', 'product']
    search_fields = ['vendor_item_number', 'vendor__code', 'product__title']
    ordering_fields = ['last_seen_date', 'times_seen']


def _item_stats_payload(qs, label: str):
    """Aggregate counts and averages for a filtered Item queryset (single aggregate query)."""
    agg = qs.aggregate(
        total=Count('id'),
        on_shelf=Count('id', filter=Q(status='on_shelf')),
        sold=Count('id', filter=Q(status='sold')),
        lost=Count('id', filter=Q(status='lost')),
        scrapped=Count('id', filter=Q(status='scrapped')),
        avg_retail=Avg('price'),
        avg_sold=Avg('sold_for', filter=Q(sold_for__isnull=False)),
    )
    total = agg['total'] or 0
    lost = agg['lost'] or 0
    avg_retail = agg['avg_retail']
    avg_sold = agg['avg_sold']
    loss_rate = Decimal('0')
    if total > 0:
        loss_rate = (Decimal(lost) / Decimal(total)).quantize(Decimal('0.0001'))
    return {
        'label': label,
        'on_shelf': agg['on_shelf'] or 0,
        'sold': agg['sold'] or 0,
        'lost': lost,
        'scrapped': agg['scrapped'] or 0,
        'total': total,
        'avg_retail': str(round(avg_retail, 2)) if avg_retail is not None else '0.00',
        'avg_sold': str(round(avg_sold, 2)) if avg_sold is not None else '0.00',
        'loss_rate': f'{float(loss_rate):.4f}',
    }


def _csv_query_values(request, key: str) -> list[str]:
    """Comma-separated and/or repeated query param values (e.g. status=a,b or status=a&status=b)."""
    out: list[str] = []
    for part in request.query_params.getlist(key):
        for x in part.split(','):
            t = x.strip()
            if t:
                out.append(t)
    return out


class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    pagination_class = ItemListPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = [
        'sku', 'notes', 'location',
        'product__title', 'product__brand', 'product__product_number', 'product__model', 'product__identifiers',
        'manifest_row__title',
        'manifest_row__identifiers__upc',
        'manifest_row__identifiers__sku',
        'manifest_row__identifiers__asin',
    ]
    filterset_fields = [
        'sku', 'purchase_order',
    ]
    ordering_fields = ['created_at', 'checked_in_at', 'price', 'sku', 'id']
    ordering = ['-checked_in_at', '-created_at']

    def get_queryset(self):
        qs = Item.objects.select_related(
            'product', 'purchase_order', 'manifest_row',
        ).all()
        request = self.request

        q_raw = (request.query_params.get('q') or '').strip()
        if q_raw:
            for word in q_raw.lower().split():
                w = word.strip()
                if w:
                    qs = qs.filter(search_text__icontains=w)

        updated_after = (request.query_params.get('updated_after') or '').strip()
        if updated_after:
            dt = parse_datetime(updated_after)
            if dt is not None:
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                qs = qs.filter(updated_at__gte=dt)

        ids_raw = (request.query_params.get('ids') or '').strip()
        if ids_raw:
            id_list: list[int] = []
            for part in ids_raw.split(','):
                part = part.strip()
                if not part:
                    continue
                try:
                    id_list.append(int(part))
                except (TypeError, ValueError):
                    continue
            if id_list:
                qs = qs.filter(id__in=id_list)
            else:
                qs = qs.none()

        batch_raw = (
            request.query_params.get('check_in_batch')
            or request.query_params.get('batch')
            or ''
        ).strip()
        if batch_raw:
            try:
                batch_pk = int(batch_raw)
            except (TypeError, ValueError):
                qs = qs.none()
            else:
                from apps.inventory.models import ProcessingCheckInBatch

                batch_item_ids = (
                    ProcessingCheckInBatch.objects.filter(pk=batch_pk)
                    .values_list('item_ids', flat=True)
                    .first()
                )
                if batch_item_ids:
                    qs = qs.filter(id__in=batch_item_ids)
                else:
                    qs = qs.none()

        status_vals = _csv_query_values(request, 'status')
        if status_vals:
            qs = qs.filter(status__in=status_vals)

        product_raw = (request.query_params.get('product') or request.query_params.get('product_id') or '').strip()
        if product_raw:
            try:
                qs = qs.filter(product_id=int(product_raw))
            except (TypeError, ValueError):
                qs = qs.none()

        condition_vals = _csv_query_values(request, 'condition')
        if condition_vals:
            qs = qs.filter(condition__in=condition_vals)

        source_vals = _csv_query_values(request, 'source')
        if source_vals:
            qs = qs.filter(source__in=source_vals)

        return qs

    def perform_create(self, serializer):
        serializer.save(sku=Item.generate_sku())

    def create(self, request, *args, **kwargs):
        """Qty-aware manual create. Workspace-enabled POs route through processing_add_item so
        the units land in the processing queue as a first-class Added row (one model for
        adds and check-ins everywhere); other creates loop the serializer per unit."""
        from apps.inventory.processing_ops import MAX_CHECK_IN_QUANTITY

        data = request.data if isinstance(request.data, dict) else {}
        try:
            quantity = int(data.get('quantity') or 1)
        except (TypeError, ValueError):
            quantity = 1
        quantity = max(1, quantity)
        if quantity > MAX_CHECK_IN_QUANTITY:
            return Response(
                {'detail': f'Quantity {quantity:,} exceeds the {MAX_CHECK_IN_QUANTITY:,} per-action safety limit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = None
        raw_po = data.get('purchase_order')
        if raw_po not in (None, ''):
            try:
                order = PurchaseOrder.objects.filter(pk=int(raw_po)).first()
            except (TypeError, ValueError):
                order = None
        workspace_enabled = (
            order is not None
            and ProcessingRow.objects.filter(purchase_order=order).exists()
        )

        if workspace_enabled:
            from apps.inventory.processing_ops import processing_add_item

            payload = {**data, 'quantity': quantity}
            # 'edit' = find-or-create from payload fields — same product resolution
            # (find_or_create_product_for_manual_item) the plain serializer path uses.
            payload.setdefault('product_mode', 'edit')
            if not payload.get('retail'):
                payload['retail'] = data.get('retail_value') or data.get('unit_retail') or ''
            try:
                result = processing_add_item(request.user, order, payload)
            except ValueError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            body = dict(result['items'][0])
            body['created_count'] = result['created_count']
            body['created_items'] = [
                {
                    'id': it['id'],
                    'sku': it['sku'],
                    'price': it['price'],
                    'title': it['title'],
                    'brand': it.get('brand') or '',
                    'product_number': it.get('product_number'),
                }
                for it in result['items']
            ]
            return Response(body, status=status.HTTP_201_CREATED)

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            first = serializer.save(sku=Item.generate_sku())
            items = [first]
            for _ in range(quantity - 1):
                dup = self.get_serializer(data=data)
                dup.is_valid(raise_exception=True)
                items.append(dup.save(sku=Item.generate_sku()))
        body = self.get_serializer(first).data
        body['created_count'] = len(items)
        body['created_items'] = [
            {
                'id': it.id,
                'sku': it.sku,
                'price': str(it.price),
                'title': it.product.title,
                'brand': it.product.brand or '',
                'product_number': getattr(it.product, 'product_number', None) if it.product_id else None,
            }
            for it in items
        ]
        headers = self.get_success_headers(body)
        return Response(body, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=['get'], url_path='stats')
    def item_stats(self, request):
        """Product / category / global item aggregates for the item drawer."""
        product_id_raw = request.query_params.get('product_id', '').strip()
        category_raw = (request.query_params.get('category') or '').strip()

        product_block = None
        if product_id_raw:
            try:
                pid = int(product_id_raw)
            except ValueError:
                pid = None
            if pid is not None:
                prod = Product.objects.filter(pk=pid).first()
                if prod:
                    product_block = _item_stats_payload(
                        Item.objects.filter(product_id=pid),
                        prod.title,
                    )

        category_block = None
        if category_raw:
            category_block = _item_stats_payload(
                Item.objects.filter(
                    Q(product__category__name=category_raw) | Q(manifest_row__category=category_raw),
                ),
                category_raw,
            )

        # TTL-only cache; no signal invalidation (batch processing would thrash the cache).
        global_block = cache.get_or_set(
            'item_stats_global',
            lambda: _item_stats_payload(Item.objects.all(), 'All Items'),
            300,
        )

        return Response({
            'product': product_block,
            'category': category_block,
            'global': global_block,
        })

    @action(detail=False, methods=['post'], url_path='suggest')
    def suggest_item(self, request):
        """AI-assisted listing copy for Add Item (single-item, structured JSON)."""
        import json as json_lib
        import time as _time

        from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

        t_total = _time.perf_counter()
        timing: dict = {}

        try:
            fields = request.data.get('fields') or []
            context = request.data.get('context') or {}
            model_id = ai_model('SUGGEST_ITEM', request.data.get('model'))

            if not isinstance(fields, list) or not fields:
                return Response(
                    {'error': 'fields must be a non-empty list of field names.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed = {
                'title', 'brand', 'category', 'condition',
                'specifications', 'notes', 'price',
                'model', 'retail_value', 'search_tags', 'google_query',
            }
            fields = [f for f in fields if f in allowed]
            if not fields:
                return Response(
                    {'error': 'No valid fields requested.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            mandatory_fields = ('model', 'retail_value', 'search_tags', 'google_query')
            fields = list(dict.fromkeys([*fields, *mandatory_fields]))

            title = (context.get('title') or '')[:500]
            brand = (context.get('brand') or '')[:200]
            category = (context.get('category') or '')[:200]
            cond = (context.get('condition') or '')[:40]
            model_ctx = (context.get('model') or '')[:200]

            t0 = _time.perf_counter()
            store_examples, examples_used = retrieve_listing_examples_for_prompt(
                title, brand or None, category or None, cond or None,
            )
            timing['db_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            user_payload = {
                'requested_fields': fields,
                'draft': {k: context.get(k, '') for k in fields},
                'store_examples': store_examples,
            }

            taxonomy_lines = '\n'.join(f'- {name}' for name in TAXONOMY_V1_CATEGORY_NAMES)
            system_prompt = (
                LISTING_STANDARDS
                + '\nAllowed condition values (exactly one if returning condition): '
                + ', '.join(CONDITION_VALUES)
                + '\n\n'
                + 'If you return a suggestion for "category", it MUST be exactly one of these strings:\n'
                + taxonomy_lines
                + '\n\n'
                + FEW_SHOT_ADD_ITEM
                + '\n'
                + OUTPUT_SCHEMA_HINT
                + '\n\n'
                + 'The user message is JSON with requested_fields, draft, and store_examples. '
                'store_examples are for style only; do not copy SKUs/prices as facts about the draft item.'
            )

            user_message_json = json_lib.dumps(user_payload)
            user_message_json_pretty = json_lib.dumps(user_payload, indent=2)
            if suggest_logger.active_targets() & {'django', 'file'}:
                prompt_blob = (
                    f'\n[suggest_item] model={model_id!r}\n'
                    f'--- SYSTEM PROMPT ({len(system_prompt)} chars) ---\n'
                    f'{system_prompt}\n'
                    f'--- USER MESSAGE ---\n'
                    f'{user_message_json_pretty}\n'
                    f'--- END suggest_item ---\n'
                )
                suggest_logger.info('%s', prompt_blob)

            t0 = _time.perf_counter()
            response = llm_complete(
                model_id=model_id,
                system=system_prompt,
                user=user_message_json,
                max_tokens=1024,
                timeout=60.0,
                log_source='suggest_item',
                log_detail='POST suggest_item',
            )
            timing['api_ms'] = round((_time.perf_counter() - t0) * 1000, 1)

            content_text = response.text

            if suggest_logger.active_targets() & {'django', 'file'}:
                suggest_logger.info('%s', '--- AI RESPONSE (raw) ---\n' + content_text[:50000])

            if not (content_text or '').strip():
                suggest_logger.warning('suggest_item empty content from model=%s', model_id)
                return Response(
                    {
                        'error': 'AI returned an empty response. Check the provider API key and model id, then try again.',
                        'examples_used': examples_used,
                        'timing': timing,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            out, parsed = _suggest_item_parse_suggestions_from_text(content_text, fields, allowed)
            if out is not None:
                from apps.inventory.services.manual_item import build_google_query

                if 'search_tags' in fields and 'search_tags' not in out:
                    out['search_tags'] = []
                if 'google_query' in fields:
                    gq = str(out.get('google_query', '')).strip()
                    if not gq:
                        out['google_query'] = build_google_query(
                            title=str(out.get('title', title) or ''),
                            brand=str(out.get('brand', brand) or ''),
                            model=str(out.get('model', model_ctx) or ''),
                            search_tags=out.get('search_tags') or [],
                        )
            if not isinstance(parsed, dict) or out is None:
                suggest_logger.warning(
                    'suggest_item could not parse suggestions JSON; model=%s content_len=%s preview=%s',
                    model_id,
                    len(content_text),
                    content_text[:800],
                )
                return Response(
                    {
                        'error': 'Could not parse AI response as JSON. Try again or pick another model.',
                        'examples_used': examples_used,
                        'timing': timing,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            taxonomy_set = set(TAXONOMY_V1_CATEGORY_NAMES)
            if 'category' in fields and 'category' in out:
                cv_bad = str(out['category']).strip()
                if cv_bad and cv_bad not in taxonomy_set:
                    retry_user = json.dumps({
                        'instruction': (
                            'Your previous answer used category %r which is not allowed. '
                            'Return ONLY a JSON object with the same structure as required before, '
                            'but category must be exactly one of the strings in allowed_categories.'
                        ) % (cv_bad,),
                        'allowed_categories': list(TAXONOMY_V1_CATEGORY_NAMES),
                    })
                    t_retry = _time.perf_counter()
                    response_retry = llm_complete(
                        model_id=model_id,
                        system=system_prompt,
                        messages=[
                            {'role': 'user', 'content': user_message_json},
                            {'role': 'assistant', 'content': content_text},
                            {'role': 'user', 'content': retry_user},
                        ],
                        max_tokens=1024,
                        timeout=60.0,
                        log_source='suggest_item',
                        log_detail='POST suggest_item category retry',
                    )
                    timing['api_retry_ms'] = round((_time.perf_counter() - t_retry) * 1000, 1)
                    content_retry = response_retry.text
                    out_retry, parsed_retry = _suggest_item_parse_suggestions_from_text(
                        content_retry, fields, allowed,
                    )
                    if out_retry is not None and isinstance(parsed_retry, dict):
                        out = out_retry
                        parsed = parsed_retry
                    cv_after = str(out.get('category', '')).strip()
                    if cv_after and cv_after not in taxonomy_set:
                        out['category'] = MIXED_LOTS_UNCATEGORIZED

            low_confidence = parsed.get('low_confidence', False) is True
            low_confidence_reason = ''
            if low_confidence:
                low_confidence_reason = str(parsed.get('low_confidence_reason', ''))[:500]

            usage_out = {
                'input_tokens': response.input_tokens,
                'output_tokens': response.output_tokens,
            }

            timing['total_ms'] = round((_time.perf_counter() - t_total) * 1000, 1)

            payload = {
                'suggestions': out,
                'low_confidence': low_confidence,
                'low_confidence_reason': low_confidence_reason,
                'usage': usage_out,
                'examples_used': examples_used,
                'timing': timing,
            }
            if suggest_logger.should_log_browser():
                payload['debug'] = {
                    'model': model_id,
                    'system_prompt': system_prompt,
                    'user_message': user_message_json_pretty,
                }
            return Response(payload)

        except LLMConfigError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except LLMAPIError as e:
            suggest_logger.warning('suggest_item LLM error: %s', e)
            detail = str(e)
            if e.status_code is not None:
                detail = f'{detail} (HTTP {e.status_code})'
            return Response(
                {
                    'error': (
                        'AI service error. '
                        'Confirm the provider API key and that the model id is valid for your account. '
                        f'Detail: {detail}'
                    ),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except json_lib.JSONDecodeError as e:
            return Response(
                {'error': f'Failed to parse AI response: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as e:
            suggest_logger.exception('suggest_item unexpected error')
            return Response(
                {'error': f'AI suggest failed: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='processing-print-and-check-in')
    def processing_print_and_check_in(self, request, pk=None):
        from apps.inventory.processing_ops import processing_print_and_check_in

        item = self.get_object()
        try:
            return Response(processing_print_and_check_in(request.user, item, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'], url_path='processing-patch')
    def processing_patch(self, request, pk=None):
        from apps.inventory.processing_ops import processing_patch_item

        item = self.get_object()
        try:
            return Response(processing_patch_item(request.user, item, request.data))
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Check in an individual item and mark shelf-ready."""
        item = self.get_object()
        updates = {}
        if 'price' in request.data:
            parsed_price = parse_decimal(request.data.get('price'))
            if parsed_price is not None:
                updates['price'] = parsed_price
        if 'unit_retail' in request.data:
            updates['retail'] = parse_decimal(request.data.get('unit_retail'))
        elif 'retail_value' in request.data:
            updates['retail'] = parse_decimal(request.data.get('retail_value'))
        for field in ['condition', 'location', 'notes']:
            if field in request.data:
                value = request.data.get(field)
                if value is not None:
                    updates[field] = value
        if 'specifications' in request.data:
            updates['specifications'] = request.data.get('specifications') or {}

        changed = apply_item_updates(item, updates)
        old_status = item.status
        now = timezone.now()
        item.status = 'on_shelf'
        item.listed_at = now
        item.checked_in_at = now
        item.checked_in_by = request.user
        item.save()

        history_events = []
        if old_status != 'on_shelf':
            history_events.append(
                ItemHistory(
                    item=item,
                    event_type='status_change',
                    old_value=old_status,
                    new_value='on_shelf',
                    note='Checked in and marked shelf-ready',
                    created_by=request.user,
                ),
            )

        for field, old_value, new_value in changed:
            history_events.append(
                ItemHistory(
                    item=item,
                    event_type=history_event_type_for_field(field),
                    old_value='' if old_value is None else str(old_value),
                    new_value='' if new_value is None else str(new_value),
                    note=f'Check-in updated {field}',
                    created_by=request.user,
                ),
            )

        if history_events:
            ItemHistory.objects.bulk_create(history_events)

        data = ItemSerializer(item).data
        data['checked_in'] = True
        return Response(data)

    @action(detail=True, methods=['post'])
    def ready(self, request, pk=None):
        """Mark item as ready for shelf."""
        item = self.get_object()
        old_status = item.status
        item.status = 'on_shelf'
        now = timezone.now()
        item.listed_at = now
        item.checked_in_at = now
        item.checked_in_by = request.user
        item.save()
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value=old_status,
            new_value='on_shelf',
            note='Marked ready for shelf',
            created_by=request.user,
        )
        return Response(ItemSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='mark-broken')
    def mark_broken(self, request, pk=None):
        """Mark item as scrapped (broken)."""
        item = self.get_object()
        old_status = item.status
        item.status = 'scrapped'
        item.save()
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value=old_status,
            new_value='scrapped',
            note='Marked broken',
            created_by=request.user,
        )
        return Response(ItemSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='uncheck-in')
    def uncheck_in(self, request, pk=None):
        """Revert item to intake so it can be re-processed."""
        item = self.get_object()
        old_status = item.status
        item.status = 'intake'
        item.checked_in_at = None
        item.checked_in_by = None
        item.listed_at = None
        item.save()
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value=old_status,
            new_value='intake',
            note='Unchecked in',
            created_by=request.user,
        )
        return Response(ItemSerializer(item).data)


class ItemHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ItemHistory.objects.select_related('item', 'created_by').all()
    serializer_class = ItemHistorySerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['item', 'event_type']
    ordering_fields = ['created_at']
    ordering = ['-created_at']



@api_view(['GET'])
@perm_classes([IsAuthenticated, IsStaff])
def manifest_field_metadata_view(request):
    """Pinned flat + buckets manifest field definitions (formula UI)."""
    return Response(manifest_field_metadata_payload())


@api_view(['GET'])
@perm_classes([AllowAny])
def item_lookup(request, sku):
    """Public item lookup by SKU (no auth required)."""
    try:
        item = Item.objects.select_related('manifest_row').get(sku=sku)
    except Item.DoesNotExist:
        return Response(
            {'detail': 'Item not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Record scan
    ItemScanHistory.objects.create(
        item=item,
        ip_address=request.META.get('REMOTE_ADDR'),
        source='public_lookup',
        outcome='public_lookup',
    )

    return Response(ItemPublicSerializer(item).data)


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsStaff])
def verify_present_view(request, pk):
    """Mark an item as verified present during a shrinkage audit scan.

    POST /api/inventory/items/:id/verify-present/
    Body: { audit_session_id? }
    Logs an ItemScanHistory record with source='audit_scan'.
    """
    try:
        item = Item.objects.select_related('product').get(pk=pk)
    except Item.DoesNotExist:
        return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

    ItemScanHistory.objects.create(
        item=item,
        ip_address=request.META.get('REMOTE_ADDR'),
        source='audit_scan',
        outcome='audit_scan',
    )
    return Response({
        'sku': item.sku,
        'title': item.product.title if item.product_id else 'Generic Product',
        'status': item.status,
        'location': item.location,
        'verified': True,
    })


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsStaff])
def quick_reprice_view(request, pk):
    """Apply a discount to an item and return the updated item.

    POST /api/inventory/items/:id/quick-reprice/
    Body: {
        discount_type: 'percent' | 'fixed',
        discount_value: number,    # e.g. 25 for 25% or 5.00 for $5
        min_price?: number         # floor — won't go below this (default 0.50)
    }
    Returns updated item data. Logs a price_change history event.
    """
    try:
        item = Item.objects.select_related('product').get(pk=pk)
    except Item.DoesNotExist:
        return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Do not change price on units that are no longer active sellable inventory (receipts / reporting).
    allowed = {'intake', 'processing', 'on_shelf', 'returned'}
    if item.status not in allowed:
        return Response(
            {
                'detail': (
                    f'Quick reprice is not allowed for items with status "{item.status}". '
                    'Only active inventory (intake, processing, on shelf, or returned) can be repriced.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    discount_type = request.data.get('discount_type')
    discount_value = request.data.get('discount_value')
    min_price = Decimal(str(request.data.get('min_price', '0.50')))

    if discount_type not in ('percent', 'fixed'):
        return Response(
            {'detail': 'discount_type must be "percent" or "fixed".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        discount_value = Decimal(str(discount_value))
    except Exception:
        return Response({'detail': 'discount_value must be a number.'}, status=status.HTTP_400_BAD_REQUEST)

    old_price = item.price
    if discount_type == 'percent':
        if not (0 < discount_value <= 100):
            return Response({'detail': 'percent discount_value must be between 1 and 100.'}, status=400)
        discount_amount = (old_price * discount_value / 100).quantize(Decimal('0.01'))
    else:
        discount_amount = discount_value.quantize(Decimal('0.01'))

    new_price = max(old_price - discount_amount, min_price).quantize(Decimal('0.01'))

    item.price = new_price
    item.save(update_fields=['price', 'updated_at'])

    ItemHistory.objects.create(
        item=item,
        event_type='price_change',
        old_value=str(old_price),
        new_value=str(new_price),
        note=f'Quick reprice: {discount_type} {discount_value} off',
        created_by=request.user,
    )

    product_number = ''
    if item.product_id:
        try:
            product_number = (item.product.product_number or '').strip()
        except Exception:
            product_number = ''

    return Response({
        'sku': item.sku,
        'title': item.product.title if item.product_id else 'Generic Product',
        'status': item.status,
        'old_price': str(old_price),
        'new_price': str(new_price),
        'discount_amount': str(discount_amount),
        'discount_type': discount_type,
        'discount_value': str(discount_value),
        'brand': (item.product.brand if item.product_id else '') or '',
        'product_number': product_number,
    })


def _item_has_completed_pos_sale(item):
    from apps.pos.models import CartLine

    return CartLine.objects.filter(item=item, cart__status='completed').exists()


def _completed_sale_receipt_number(item):
    from apps.pos.models import CartLine

    line = (
        CartLine.objects.filter(item=item, cart__status='completed')
        .select_related('cart__receipt')
        .order_by('-cart__completed_at')
        .first()
    )
    if not line:
        return None
    r = getattr(line.cart, 'receipt', None)
    return r.receipt_number if r else None


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsStaff])
def duplicate_item_for_resale_view(request, pk):
    """Create a new on-shelf item copied from a sold unit (new SKU).

    POST /api/inventory/items/:id/duplicate-for-resale/
    Copies product, PO, manifest/batch links, title, pricing, condition, etc.
    Consignment-sourced items are stored as purchased on the copy (no ConsignmentItem row).
    """
    try:
        src = Item.objects.get(pk=pk)
    except Item.DoesNotExist:
        return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

    if src.status != 'sold':
        return Response(
            {'detail': 'Only sold items can be duplicated for resale.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from apps.inventory.services.resale_duplicate import duplicate_item_for_resale

    new_item = duplicate_item_for_resale(request.user, src)
    return Response(ItemSerializer(new_item).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def mark_sold_item_on_shelf_view(request, pk):
    """Put a sold item back on shelf (manager). Blocked if a completed POS sale exists.

    POST /api/inventory/items/:id/mark-on-shelf/
    Use when there is no completed register sale for this unit (e.g. data fix). Otherwise void the sale in POS.
    """
    try:
        item = Item.objects.get(pk=pk)
    except Item.DoesNotExist:
        return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)

    if item.status != 'sold':
        return Response(
            {'detail': 'Only sold items can be returned to shelf.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if _item_has_completed_pos_sale(item):
        rnum = _completed_sale_receipt_number(item)
        extra = f' Receipt: {rnum}.' if rnum else ''
        return Response(
            {
                'detail': (
                    'This item is on a completed register sale. Void that transaction in POS first.'
                    + extra
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    old_status = item.status
    item.status = 'on_shelf'
    item.sold_at = None
    item.sold_for = None
    item.save(update_fields=['status', 'sold_at', 'sold_for', 'updated_at'])

    if item.source == 'consignment' and hasattr(item, 'consignment'):
        ci = item.consignment
        ci.status = 'listed'
        ci.sold_at = None
        ci.sale_amount = None
        ci.store_commission = None
        ci.consignee_earnings = None
        ci.save()

    ItemHistory.objects.create(
        item=item,
        event_type='status_change',
        old_value=old_status,
        new_value='on_shelf',
        note='Marked on shelf from Quick reprice / inventory (manager)',
        created_by=request.user,
    )

    return Response(ItemSerializer(item).data)


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsStaff])
def estimate_price_view(request):
    """Estimate a price for an item given its attributes.

    POST /api/inventory/estimate-price/
    Body: { title, brand?, model?, condition?, source?, retail_value?, category? }
    Returns: { estimated_price, low_estimate, high_estimate, confidence, method, comparables }
    """
    from .services.price_estimator import estimate_price
    from decimal import InvalidOperation

    title = request.data.get('title', '')
    if not title:
        return Response({'detail': 'title is required.'}, status=status.HTTP_400_BAD_REQUEST)

    retail_raw = request.data.get('unit_retail', request.data.get('retail_value'))
    try:
        retail_value = Decimal(str(retail_raw)) if retail_raw else None
    except (InvalidOperation, ValueError):
        retail_value = None

    result = estimate_price(
        title=title,
        brand=request.data.get('brand') or None,
        model_name=request.data.get('model') or None,
        category_name=request.data.get('category') or None,
        condition=request.data.get('condition', 'unknown'),
        source=request.data.get('source', 'purchased'),
        retail_value=retail_value,
    )

    return Response({
        'estimated_price': str(result.estimated_price),
        'low_estimate': str(result.low_estimate),
        'high_estimate': str(result.high_estimate),
        'confidence': result.confidence,
        'method': result.method,
        'comparables': result.comparables,
        'notes': result.notes,
    })


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsStaff])
def classify_item_view(request):
    """Classify an item into a Category using the tiered classifier.

    Body: { title, brand?, model?, use_llm? }
    Returns: { category_id, category_name, confidence, method }
    """
    from .services.categorizer import classify_item

    title = request.data.get('title', '')
    if not title:
        return Response({'detail': 'title is required.'}, status=status.HTTP_400_BAD_REQUEST)

    brand = request.data.get('brand') or None
    model = request.data.get('model') or None
    use_llm = bool(request.data.get('use_llm', True))

    result = classify_item(title=title, brand=brand, model=model, use_llm_fallback=use_llm)
    return Response({
        'category_id': result.category_id,
        'category_name': result.category_name,
        'confidence': result.confidence,
        'method': result.method,
    })


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsStaff])
def store_report_view(request):
    """Manager store report: on-shelf inventory summary, stale items, pricing gaps.

    Query params:
        stale_days (int): items on shelf longer than this are flagged (default 60)
        location (str):   filter by location prefix
    """
    from django.db.models import Avg, Max, Min
    from datetime import timedelta

    stale_days = int(request.query_params.get('stale_days', 60))
    location_filter = request.query_params.get('location', '')

    listing_category = Case(
        When(manifest_row__category__gt='', then=F('manifest_row__category')),
        When(product__category__isnull=False, then=F('product__category__name')),
        default=Value(''),
        output_field=CharField(),
    )
    on_shelf_qs = (
        Item.objects.filter(status='on_shelf')
        .select_related('manifest_row', 'product')
        .annotate(
            listing_category=listing_category,
            item_title=F('product__title'),
            item_brand=F('product__brand'),
        )
    )
    if location_filter:
        on_shelf_qs = on_shelf_qs.filter(location__icontains=location_filter)

    stale_cutoff = timezone.now() - timedelta(days=stale_days)

    # Aggregate stats
    totals = on_shelf_qs.aggregate(
        total_items=Count('id'),
        total_retail_value=Sum('price'),
        avg_price=Avg('price'),
        min_price=Min('price'),
        max_price=Max('price'),
    )

    stale_items = on_shelf_qs.filter(
        listed_at__lt=stale_cutoff,
    ).order_by('listed_at').values(
        'id',
        'sku',
        'price',
        'listed_at',
        'location',
        title=F('item_title'),
        brand=F('item_brand'),
        category=F('listing_category'),
    )[:100]

    unpriced_items = on_shelf_qs.filter(price=0).values(
        'id', 'sku', 'listed_at', 'location',
        title=F('item_title'),
        brand=F('item_brand'),
    )[:50]

    lost_items = Item.objects.filter(status='lost').select_related('product').annotate(
        item_title=F('product__title'),
        item_brand=F('product__brand'),
    ).values(
        'id', 'sku', 'price', 'location',
        title=F('item_title'),
        brand=F('item_brand'),
    )[:50]

    category_breakdown = on_shelf_qs.values(category=F('listing_category')).annotate(
        count=Count('id'),
        total_value=Sum('price'),
    ).order_by('-total_value')[:30]

    source_breakdown = on_shelf_qs.values('source').annotate(
        count=Count('id'),
        total_value=Sum('price'),
    )

    condition_breakdown = on_shelf_qs.values('condition').annotate(
        count=Count('id'),
    )

    # Price histogram buckets
    buckets = [
        (0, 5), (5, 10), (10, 25), (25, 50),
        (50, 100), (100, 200), (200, 500), (500, None),
    ]
    price_histogram = []
    for low, high in buckets:
        qs = on_shelf_qs.filter(price__gte=low)
        if high is not None:
            qs = qs.filter(price__lt=high)
        label = f'${low}–${high}' if high else f'${low}+'
        price_histogram.append({'range': label, 'count': qs.count()})

    return Response({
        'summary': {
            'total_items_on_shelf': totals['total_items'] or 0,
            'total_retail_value': str(totals['total_retail_value'] or 0),
            'avg_price': str(round(totals['avg_price'] or 0, 2)),
            'min_price': str(totals['min_price'] or 0),
            'max_price': str(totals['max_price'] or 0),
            'stale_threshold_days': stale_days,
            'stale_item_count': on_shelf_qs.filter(listed_at__lt=stale_cutoff).count(),
            'unpriced_item_count': on_shelf_qs.filter(price=0).count(),
            'lost_item_count': Item.objects.filter(status='lost').count(),
        },
        'stale_items': list(stale_items),
        'unpriced_items': list(unpriced_items),
        'lost_items': list(lost_items),
        'category_breakdown': list(category_breakdown),
        'source_breakdown': list(source_breakdown),
        'condition_breakdown': list(condition_breakdown),
        'price_histogram': price_histogram,
    })
