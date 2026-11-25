"""Step 1, Load: copy the truck's manifest lines into this app's own lines (code, no AI).

The source is the order's staging rows (``PreprocessingRow.raw_row``: the manifest exactly as uploaded), else its
manifest rows. Columns are found by header name; what was found is kept on the run (``load_info``) and shown.
Nothing in inventory is written.
"""
from __future__ import annotations

import re
import time
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from apps.prep_steps.models import PrepAction, PrepLine, PrepRun

# field -> header names, best first (compared lower-case, spaces and punctuation squeezed)
COLUMNS: dict[str, tuple[str, ...]] = {
    'title': ('item description', 'description', 'title', 'product name', 'item name', 'product description',
              'item title', 'product title', 'name'),
    'brand': ('brand', 'brand name', 'manufacturer', 'mfr', 'vendor brand'),
    'model': ('model #', 'model', 'model number', 'part #', 'mpn', 'mfr part #', 'part number'),
    'qty': ('qty', 'quantity', 'units', 'unit qty', 'qty shipped'),
    'retail': ('unit retail', 'retail', 'unit price', 'retail price', 'msrp', 'price', 'unit msrp'),
    'ext_retail': ('ext. retail', 'ext retail', 'extended retail', 'total retail', 'ext msrp'),
    'category': ('category', 'department', 'dept'),
    'subcategory': ('subcategory', 'sub category', 'seller category', 'product class', 'class'),
    'condition': ('condition', 'grade', 'optoro condition'),
    'upc': ('upc', 'gtin', 'ean', 'upc code'),
    'item_number': ('item #', 'tcin', 'sku', 'asin', 'item number', 'item id', 'lpn'),
    'image_url': ('image url', 'image', 'image link', 'photo url'),
    'page_url': ('notes/comments', 'url', 'link', 'product url', 'page url'),
}


def _key(header: str) -> str:
    return re.sub(r'\s+', ' ', str(header or '').strip().lower())


def find_columns(headers: list[str]) -> dict[str, str]:
    """{field: the header it comes from}."""
    by_key = {_key(h): h for h in headers if h}
    out: dict[str, str] = {}
    used: set[str] = set()
    for field, names in COLUMNS.items():
        for name in names:
            h = by_key.get(name)
            if h and h not in used:
                out[field] = h
                used.add(h)
                break
    return out


def fix_text(text: Any) -> str:
    """Mojibake from a wrong encoding ("Latitude RunÃ‚Â®") back to the real characters; spaces squeezed."""
    s = str(text or '')
    if any(m in s for m in ('Ã', 'Â', 'â')):
        for _ in range(2):
            try:
                fixed = s.encode('cp1252').decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                try:
                    fixed = s.encode('latin-1').decode('utf-8')
                except (UnicodeEncodeError, UnicodeDecodeError):
                    break
            if fixed == s:
                break
            s = fixed
    return re.sub(r'\s+', ' ', s).strip()


def money(value: Any) -> Decimal | None:
    s = str(value or '').replace('$', '').replace(',', '').strip()
    if not s:
        return None
    try:
        d = Decimal(s)
    except (InvalidOperation, ValueError):
        return None
    if not d.is_finite() or d < 0:
        return None
    return d.quantize(Decimal('0.01'))


def whole(value: Any, default: int = 1) -> int:
    try:
        n = int(Decimal(str(value).replace(',', '').strip()))
    except (InvalidOperation, ValueError, TypeError):
        return default
    return n if n > 0 else default


def clean_upc(value: Any) -> str:
    digits = re.sub(r'\D', '', str(value or '').split(',')[0])
    return digits if 8 <= len(digits) <= 14 else ''


def upc_rounded(upc: str) -> bool:
    """A UPC the spreadsheet rounded (197768000000): useless for matching."""
    return bool(upc) and len(upc) >= 11 and upc.endswith('000000')


_WAYFAIR_IMG = re.compile(r'wfcdn\.com/im/\d+/[^/]+/\d+/(\d{4,})/')


def real_image(url: str) -> str:
    """Wayfair manifests give a placeholder photo URL; the catalog photo is rebuilt from its image id."""
    url = str(url or '').strip()
    m = _WAYFAIR_IMG.search(url)
    if m:
        iid = m.group(1)
        return f'https://assets.wfcdn.com/im/1/resize-h800-w800%5Ecompr-r85/{iid[:4]}/{iid}/x.jpg'
    return url if url.startswith('http') else ''


def _line_from_raw(raw: dict, cols: dict[str, str]) -> dict[str, Any]:
    g = lambda f: raw.get(cols[f], '') if f in cols else ''  # noqa: E731
    page = str(g('page_url') or '').strip()
    return {
        'src_title': fix_text(g('title')),
        'src_brand': fix_text(g('brand'))[:200],
        'src_model': fix_text(g('model'))[:200],
        'src_qty': whole(g('qty')),
        'src_retail': money(g('retail')),
        'src_ext_retail': money(g('ext_retail')),
        'src_category': fix_text(g('category'))[:200],
        'src_subcategory': fix_text(g('subcategory'))[:200],
        'src_condition': fix_text(g('condition'))[:40],
        'upc': clean_upc(g('upc')),
        'item_number': fix_text(g('item_number'))[:100],
        'image_url': real_image(g('image_url')),
        'page_url': page if page.startswith('http') else '',
    }


@transaction.atomic
def load(order, *, user=None, columns: dict[str, str] | None = None) -> PrepRun:
    """Make (or make again) the run of an order with one line per manifest line. `columns` (field -> header)
    overrides the columns found by name (a person fixing the mapping)."""
    from apps.inventory.models import ManifestRow, PreprocessingRow

    started = time.monotonic()
    PrepRun.objects.filter(purchase_order=order).delete()
    run = PrepRun.objects.create(purchase_order=order, step='load', target={'share': 0.55, 'band': 0.15},
                                 created_by=user if getattr(user, 'pk', None) else None)
    if (order.manifest_id and not PreprocessingRow.objects.filter(purchase_order=order).exists()
            and not ManifestRow.objects.filter(purchase_order=order).exists()):
        # A manifest was uploaded but its lines were never read (a truck nobody opened in Preprocessing yet): read the
        # file the standard way first, exactly as opening Preprocessing does. The one inventory write this app makes.
        from apps.inventory.views import ensure_preprocessing_raw_rows

        ensure_preprocessing_raw_rows(order)
    pre = list(PreprocessingRow.objects.filter(purchase_order=order).order_by('row_number')
               .values('id', 'row_number', 'raw_row', 'manifest_row_id'))
    lines: list[PrepLine] = []
    if pre:
        headers = list(order.manifest_headers or [])
        if not headers:
            seen: dict[str, None] = {}
            for p in pre[:50]:
                for h in (p['raw_row'] or {}):
                    seen.setdefault(h, None)
            headers = list(seen)
        cols = find_columns(headers)
        if columns:
            for field, header in columns.items():
                if field in COLUMNS:
                    if header in headers:
                        cols[field] = header
                    elif not header:
                        cols.pop(field, None)
        source = 'preprocessing'
        for p in pre:
            raw = p['raw_row'] if isinstance(p['raw_row'], dict) else {}
            f = _line_from_raw(raw, cols)
            lines.append(PrepLine(run=run, row_number=p['row_number'], preprocessing_row_id=p['id'],
                                  manifest_row_id=p['manifest_row_id'], raw=raw, **f))
    else:
        headers, cols, source = [], {}, 'manifest'
        for mr in ManifestRow.objects.filter(purchase_order=order).order_by('row_number'):
            ids = mr.identifiers if isinstance(mr.identifiers, dict) else {}
            tax = mr.taxonomy if isinstance(mr.taxonomy, dict) else {}
            raw = {'title': mr.title, 'brand': mr.brand, 'model': mr.model, 'qty': mr.quantity,
                   'unit_retail': str(mr.unit_retail or ''), 'category': tax.get('category', ''),
                   'subcategory': tax.get('subcategory', ''), 'condition': mr.condition, **ids}
            lines.append(PrepLine(
                run=run, row_number=mr.row_number, manifest_row_id=mr.pk, raw=raw,
                src_title=fix_text(mr.title), src_brand=fix_text(mr.brand)[:200], src_model=fix_text(mr.model)[:200],
                src_qty=max(1, mr.quantity or 1), src_retail=mr.unit_retail,
                src_category=str(tax.get('category') or mr.category or '')[:200],
                src_subcategory=str(tax.get('subcategory') or '')[:200], src_condition=mr.condition or '',
                upc=clean_upc(ids.get('upc')), item_number=str(ids.get('item_number') or '')[:100],
            ))
    for x in lines:
        x.title = x.src_title[:300]
        x.brand = x.src_brand
        x.model = x.src_model
        x.qty = x.src_qty
        x.sources = {'title': 'manifest', 'brand': 'manifest', 'model': 'manifest', 'qty': 'manifest'}
    PrepLine.objects.bulk_create(lines, batch_size=500)
    run.load_info = {'source': source, 'headers': headers, 'columns': cols, 'lines': len(lines)}
    run.steps = {'load': {'state': 'open'}}
    run.save()
    PrepAction.objects.create(
        run=run, step='load', kind=PrepAction.KIND_RULE, name='load', label='Read the manifest',
        status=PrepAction.STATUS_APPLIED, line_count=len(lines), changed_count=len(lines),
        seconds=round(time.monotonic() - started, 2), created_by=run.created_by,
    )
    return run
