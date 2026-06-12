"""Local dev reset for WLMRT-OJU-3V74 intake pipeline testing."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from apps.core.models import S3File
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingDataBuild,
    ProcessingRow,
    PurchaseOrder,
)
from apps.inventory.services.manifest_meta import compute_category_count
from apps.inventory.services.manifest_remove import remove_manifest_database

DEFAULT_ORDER_NUMBER = 'WLMRT-OJU-3V74'
FIXTURE_DIR_NAME = 'intake-test-fixtures'
FIXTURE_CSV_NAME = 'WLMRT-OJU-3V74.csv'
FIXTURE_META_NAME = 'WLMRT-OJU-3V74.fixture.json'

TERMINAL_ITEM_STATUSES = frozenset({'sold', 'scrapped', 'lost'})
RESET_STAGE_AFTER_UPLOAD = 'after-upload'
RESET_STAGE_BEFORE_UPLOAD = 'before-upload'
RESET_STAGES = frozenset({RESET_STAGE_AFTER_UPLOAD, RESET_STAGE_BEFORE_UPLOAD})


class IntakeTestResetError(Exception):
    """Raised when reset/capture cannot proceed safely."""


def fixture_dir() -> Path:
    return Path(settings.BASE_DIR) / 'workspace' / FIXTURE_DIR_NAME


def fixture_csv_path() -> Path:
    return fixture_dir() / FIXTURE_CSV_NAME


def fixture_meta_path() -> Path:
    return fixture_dir() / FIXTURE_META_NAME


def fallback_csv_paths() -> list[Path]:
    # NOTE: workspace/ai-cleanup-grok/data/in/*.csv is deliberately NOT a fallback —
    # that file is download-cleanup-csv export format (row_id/base_cost/...), which is
    # valid Grok input but invalid for upload-manifest.
    return [fixture_csv_path()]


def resolve_fixture_csv() -> Path | None:
    for path in fallback_csv_paths():
        if path.is_file():
            return path
    return None


# Headers that identify a cleanup-CSV export (or Grok cleaned output) — never a raw
# vendor manifest. Reject fixtures carrying any of these.
_CLEANUP_EXPORT_HEADER_MARKERS = frozenset({'row_id', 'base_cost', 'ideal_price', 'ai_title', 'ai_status'})


def validate_fixture_bytes(raw: bytes, *, path: Path, po: PurchaseOrder) -> None:
    """Reject fixtures that are not a plausible raw vendor manifest for this PO."""
    headers, rows_data, _delim = _parse_manifest_bytes(raw, path.name)
    lowered = {str(h).strip().lower() for h in headers}
    markers = sorted(lowered & _CLEANUP_EXPORT_HEADER_MARKERS)
    if markers:
        raise IntakeTestResetError(
            f'Fixture {path} looks like a cleanup-CSV export (headers include {markers}), '
            'not a raw vendor manifest — refusing to upload it. Delete the file or replace '
            'it with the original BStock CSV.',
        )
    expected = po.manifest_row_count
    if expected and len(rows_data) != expected:
        raise IntakeTestResetError(
            f'Fixture {path} has {len(rows_data)} data row(s) but PO {po.order_number} '
            f'expects {expected} — refusing stale/poisoned fixture. Delete the file or '
            're-capture it (reset_intake_test_po --capture-fixture).',
        )


def read_manifest_snapshot(po: PurchaseOrder) -> tuple[bytes, str] | None:
    """Read the PO's current manifest bytes before purge."""
    if not po.manifest_id:
        return None
    manifest = po.manifest
    if manifest is None:
        return None
    filename = (po.manifest_filename or manifest.filename or FIXTURE_CSV_NAME).strip()
    if not filename:
        filename = FIXTURE_CSV_NAME
    try:
        raw = default_storage.open(manifest.key, 'rb').read()
    except Exception:
        return None
    if not raw:
        return None
    return raw, filename


def reconstruct_manifest_csv_from_po(po: PurchaseOrder) -> tuple[bytes, str] | None:
    """Rebuild vendor CSV bytes from staging raw_row when S3 file is missing."""
    staging = list(
        PreprocessingRow.objects.filter(purchase_order=po)
        .order_by('row_number')
        .values_list('raw_row', flat=True)
    )
    if not staging:
        return None

    headers = [str(h) for h in (po.manifest_headers or []) if str(h).strip()]
    if not headers:
        first = staging[0] if isinstance(staging[0], dict) else {}
        headers = [str(k) for k in first.keys() if str(k).strip()]
    if not headers:
        return None

    preview = po.manifest_preview if isinstance(po.manifest_preview, dict) else {}
    delimiter = preview.get('delimiter')
    if delimiter not in ('\t', ','):
        delimiter = ','

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=delimiter)
    writer.writerow(headers)
    for raw in staging:
        row_map = raw if isinstance(raw, dict) else {}
        writer.writerow([row_map.get(h, '') for h in headers])

    filename = (po.manifest_filename or FIXTURE_CSV_NAME).strip() or FIXTURE_CSV_NAME
    return buf.getvalue().encode('utf-8'), filename


def resolve_manifest_bytes(po: PurchaseOrder) -> tuple[bytes, str, str]:
    """Manifest source: S3/local storage, DB raw_row rebuild, then workspace fixtures."""
    snap = read_manifest_snapshot(po)
    if snap is not None:
        raw, filename = snap
        return raw, filename, 'purchase_order_manifest'

    rebuilt = reconstruct_manifest_csv_from_po(po)
    if rebuilt is not None:
        raw, filename = rebuilt
        return raw, filename, 'reconstructed_from_staging_raw_row'

    csv_path = resolve_fixture_csv()
    if csv_path is not None:
        raw = csv_path.read_bytes()
        validate_fixture_bytes(raw, path=csv_path, po=po)
        return raw, csv_path.name, f'fixture:{csv_path}'

    raise IntakeTestResetError(
        f'PO {po.order_number!r}: manifest file missing from storage (S3 key stale?) and '
        f'could not rebuild CSV from staging rows or find a fixture at '
        f'{fixture_csv_path()}.',
    )


def cache_manifest_fixture(raw: bytes, *, source: str, po: PurchaseOrder) -> str:
    """Best-effort local cache of the manifest bytes used for reset."""
    target_dir = fixture_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    csv_path = fixture_csv_path()
    csv_path.write_bytes(raw)
    try:
        fixture_csv_rel = str(csv_path.relative_to(settings.BASE_DIR)).replace('\\', '/')
    except ValueError:
        fixture_csv_rel = str(csv_path)
    meta = {
        'cached_at': timezone.now().isoformat(),
        'source': source,
        'order_number': po.order_number,
        'po_id': po.pk,
        'bytes': len(raw),
        'fixture_csv': fixture_csv_rel,
    }
    fixture_meta_path().write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return str(csv_path)


def header_signature(headers: list[str]) -> str:
    return hashlib.md5(','.join(h.strip().lower() for h in headers).encode()).hexdigest()


def assert_dev_only(*, allow_non_dev: bool) -> None:
    if allow_non_dev:
        return
    # settings.ENVIRONMENT is decouple-loaded from .env (default 'production');
    # os.environ is the Heroku config-var path. Either source saying non-dev blocks.
    env = str(
        getattr(settings, 'ENVIRONMENT', '') or os.environ.get('ENVIRONMENT', '') or '',
    ).strip().lower()
    if not settings.DEBUG and env not in ('development', 'dev', 'local'):
        raise IntakeTestResetError(
            'Refusing to run outside local dev (DEBUG=True or ENVIRONMENT=development, '
            'or pass --allow-non-dev).'
        )


def get_test_po(order_number: str = DEFAULT_ORDER_NUMBER) -> PurchaseOrder:
    po = PurchaseOrder.objects.filter(order_number=order_number).first()
    if po is None:
        raise IntakeTestResetError(f'PurchaseOrder {order_number!r} not found.')
    return po


def summarize_po(po: PurchaseOrder) -> dict[str, Any]:
    return {
        'po_id': po.pk,
        'order_number': po.order_number,
        'status': po.status,
        'preprocess_status': po.preprocess_status,
        'processing_status': po.processing_status,
        'manifest_filename': po.manifest_filename,
        'manifest_row_count': po.manifest_row_count,
        'manifest_rows': ManifestRow.objects.filter(purchase_order=po).count(),
        'preprocessing_rows': PreprocessingRow.objects.filter(purchase_order=po).count(),
        'processing_rows': ProcessingRow.objects.filter(purchase_order=po).count(),
        'items': Item.objects.filter(purchase_order=po).count(),
    }


def _parse_manifest_bytes(raw: bytes, filename: str) -> tuple[list[str], list[dict], str]:
    try:
        content = raw.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise IntakeTestResetError(
            f'Fixture {filename!r} is not valid UTF-8: {exc}',
        ) from exc

    head = content[:8192]
    nl = head.find('\n')
    line1 = head[:nl] if nl >= 0 else head
    delimiter = '\t' if line1.count('\t') > line1.count(',') else ','
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    headers = next(reader, [])
    if not headers or not any(str(h).strip() for h in headers):
        raise IntakeTestResetError(f'Fixture {filename!r} has no header row.')

    rows_data: list[dict] = []
    for i, row in enumerate(reader, start=1):
        if not any(row):
            continue
        rows_data.append({
            'row_number': i,
            'raw': dict(zip(headers, row)),
        })
    return headers, rows_data, delimiter


def upload_manifest_from_bytes(
    po: PurchaseOrder,
    *,
    filename: str,
    raw: bytes,
    uploaded_by,
) -> dict[str, Any]:
    """Mirror POST upload-manifest for local fixture re-upload."""
    headers, rows_data, delimiter = _parse_manifest_bytes(raw, filename)
    sig = header_signature(headers)
    s3_key = f'manifests/orders/{po.id}/{filename}'

    try:
        saved_path = default_storage.save(s3_key, ContentFile(raw, name=filename))
    except Exception as exc:
        raise IntakeTestResetError(f'Could not save manifest to storage: {exc}') from exc

    preview_data = {
        'headers': headers,
        'delimiter': delimiter,
        'rows': rows_data[:10],
    }
    old_manifest = po.manifest

    try:
        with transaction.atomic():
            s3_file = S3File.objects.create(
                key=saved_path,
                filename=filename,
                size=len(raw),
                content_type='text/csv',
                uploaded_by=uploaded_by,
            )
            po.manifest = s3_file
            po.manifest_preview = preview_data
            po.manifest_filename = s3_file.filename
            po.manifest_uploaded_at = s3_file.uploaded_at
            po.manifest_row_count = len(rows_data)
            po.manifest_category_count = compute_category_count(headers, rows_data)
            po.manifest_signature = sig
            po.manifest_headers = list(headers)
            po.preprocess_status = 'not_started'
            po.standardized_at = None
            po.ai_cleaned_at = None
            po.review_saved_at = None
            po.finalized_at = None
            po.template = None
            po.template_name_cache = ''
            po.template_header_signature_cache = ''
            po.template_column_mappings_cache = []
            po.standardization_formulas = {}
            po.save(
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
                    'finalized_at',
                    'template',
                    'template_name_cache',
                    'template_header_signature_cache',
                    'template_column_mappings_cache',
                    'standardization_formulas',
                    'updated_at',
                ],
            )
            PreprocessingRow.objects.filter(purchase_order=po).delete()
    except Exception as exc:
        try:
            default_storage.delete(saved_path)
        except Exception:
            pass
        raise IntakeTestResetError(f'Could not record manifest on PO: {exc}') from exc

    if old_manifest:
        old_key = old_manifest.key
        try:
            old_manifest.delete()
        except Exception:
            pass
        try:
            default_storage.delete(old_key)
        except Exception:
            pass

    po.refresh_from_db()
    return {
        'manifest_filename': po.manifest_filename,
        'manifest_row_count': po.manifest_row_count,
        'manifest_category_count': po.manifest_category_count,
    }


def upload_manifest_from_path(
    po: PurchaseOrder,
    path: Path,
    *,
    uploaded_by,
) -> dict[str, Any]:
    raw = path.read_bytes()
    filename = path.name
    return upload_manifest_from_bytes(
        po,
        filename=filename,
        raw=raw,
        uploaded_by=uploaded_by,
    )


def purge_po_pipeline_data(po: PurchaseOrder) -> dict[str, int]:
    terminal = po.items.filter(status__in=TERMINAL_ITEM_STATUSES).count()
    if terminal:
        raise IntakeTestResetError(
            f'PO {po.order_number} has {terminal} sold/scrapped/lost item(s); refusing reset.',
        )

    counts: dict[str, int] = {}
    with transaction.atomic():
        locked = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
        counts['items'], _ = Item.objects.filter(purchase_order=locked).delete()
        counts['processing_builds'], _ = ProcessingDataBuild.objects.filter(
            purchase_order=locked,
        ).delete()
        counts['processing_rows'], _ = ProcessingRow.objects.filter(
            purchase_order=locked,
        ).delete()
        counts['manifest_rows'], _ = ManifestRow.objects.filter(
            purchase_order=locked,
        ).delete()
        counts['preprocessing_rows'], _ = PreprocessingRow.objects.filter(
            purchase_order=locked,
        ).delete()

        old_key = remove_manifest_database(locked)
        if old_key:
            try:
                default_storage.delete(old_key)
            except Exception:
                pass

        locked.refresh_from_db()
        locked.processing_status = 'not_started'
        locked.processing_started_at = None
        locked.processing_done_at = None
        locked.uses_legacy_processing = False
        locked.ai_cleanup_generation = (locked.ai_cleanup_generation or 0) + 1
        locked.item_count = 0
        locked.save(
            update_fields=[
                'processing_status',
                'processing_started_at',
                'processing_done_at',
                'uses_legacy_processing',
                'ai_cleanup_generation',
                'item_count',
                'updated_at',
            ],
        )

    return counts


def capture_fixture(
    *,
    order_number: str = DEFAULT_ORDER_NUMBER,
) -> dict[str, Any]:
    po = get_test_po(order_number)
    raw, filename = resolve_manifest_bytes(po)
    csv_path = cache_manifest_fixture(raw, source='capture_fixture', po=po)
    return {
        'manifest_filename': filename,
        'fixture_csv': csv_path,
        'fixture_meta': str(fixture_meta_path()),
        'bytes': len(raw),
        **summarize_po(po),
    }


def apply_reset(
    *,
    order_number: str = DEFAULT_ORDER_NUMBER,
    allow_non_dev: bool = False,
    stage: str = RESET_STAGE_AFTER_UPLOAD,
) -> dict[str, Any]:
    assert_dev_only(allow_non_dev=allow_non_dev)
    if stage not in RESET_STAGES:
        raise IntakeTestResetError(
            f'Invalid stage {stage!r}; expected {sorted(RESET_STAGES)}.',
        )

    po = get_test_po(order_number)
    manifest_raw: bytes | None = None
    manifest_filename = FIXTURE_CSV_NAME
    manifest_source = ''

    if stage == RESET_STAGE_AFTER_UPLOAD:
        manifest_raw, manifest_filename, manifest_source = resolve_manifest_bytes(po)

    purge_counts = purge_po_pipeline_data(po)
    po.refresh_from_db()

    upload_summary: dict[str, Any] | None = None
    cached_fixture: str | None = None

    if stage == RESET_STAGE_AFTER_UPLOAD:
        assert manifest_raw is not None
        cached_fixture = cache_manifest_fixture(
            manifest_raw,
            source=f'reset:{manifest_source}',
            po=po,
        )
        User = get_user_model()
        uploaded_by = User.objects.filter(is_superuser=True).order_by('id').first()
        if uploaded_by is None:
            uploaded_by = User.objects.order_by('id').first()
        if uploaded_by is None:
            raise IntakeTestResetError('No Django user found for manifest uploaded_by.')
        upload_summary = upload_manifest_from_bytes(
            po,
            filename=manifest_filename,
            raw=manifest_raw,
            uploaded_by=uploaded_by,
        )

    po.refresh_from_db()
    return {
        'stage': stage,
        'manifest_source': manifest_source or None,
        'cached_fixture': cached_fixture,
        'purge': purge_counts,
        'upload': upload_summary,
        **summarize_po(po),
    }
