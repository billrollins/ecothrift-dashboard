"""Merge one vendor into another, then delete the old one (intake_updates Phase 3: ``TGT`` into ``TRGET``).

Every row that points at the old vendor moves to the new one. The tables are found from the ``Vendor`` model's own
relations, so a table added later is moved too. Vendor product refs that clash on vendor item number are merged:
times seen are added, and the newest cost and date are kept. The old vendor is deleted only after a re-count shows
nothing points at it. Everything moved is recorded so the merge can be undone.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.inventory.models import PurchaseOrder, Vendor, VendorProductRef

REF_FIELDS = ('vendor_item_number', 'vendor_description', 'last_unit_cost', 'times_seen', 'last_seen_date', 'product_id')
VENDOR_FIELDS = ('name', 'code', 'vendor_type', 'contact_name', 'contact_email', 'contact_phone', 'address', 'notes',
                 'is_active', 'created_at')


def _relations():
    """(label, model, field name) for every table with a key to Vendor."""
    out = []
    for rel in Vendor._meta.related_objects:
        if rel.many_to_many:
            continue
        model = rel.related_model
        out.append((f'{model._meta.app_label}.{model.__name__}', model, rel.field.name))
    return sorted(out, key=lambda r: r[0])


def counts(code: str) -> dict[str, int]:
    """Rows pointing at the vendor with this code, per table, plus order caches still naming it."""
    vendor = Vendor.objects.filter(code=code).first()
    out: dict[str, int] = {}
    for label, model, field in _relations():
        out[label] = model.objects.filter(**{field: vendor}).count() if vendor else 0
    out['PurchaseOrder.vendor_code_cache'] = PurchaseOrder.objects.filter(vendor_code_cache=code).count()
    return out


def _clashes(old: Vendor, new: Vendor) -> list[tuple[VendorProductRef, VendorProductRef]]:
    new_refs = {r.vendor_item_number: r for r in VendorProductRef.objects.filter(vendor=new)}
    return [(r, new_refs[r.vendor_item_number]) for r in VendorProductRef.objects.filter(vendor=old).order_by('pk')
            if r.vendor_item_number in new_refs]


def preview(old_code: str, new_code: str) -> dict[str, Any]:
    old = Vendor.objects.filter(code=old_code).first()
    new = Vendor.objects.filter(code=new_code).first()
    if new is None:
        raise ValueError(f'Vendor {new_code} does not exist.')
    if old is None:
        return {'old': None, 'new': {'id': new.id, 'code': new.code, 'name': new.name}, 'counts': {}, 'clashes': 0}
    return {
        'old': {'id': old.id, 'code': old.code, 'name': old.name, 'is_active': old.is_active},
        'new': {'id': new.id, 'code': new.code, 'name': new.name},
        'counts': counts(old_code),
        'clashes': len(_clashes(old, new)),
    }


def _refresh_orders(ids: list[int]) -> None:
    for po in PurchaseOrder.objects.filter(pk__in=ids).only('id', 'vendor_id', 'order_number', 'description'):
        po.refresh_cached_vendor_fields()
        PurchaseOrder.objects.filter(pk=po.pk).update(
            vendor_name_cache=po.vendor_name_cache,
            vendor_code_cache=po.vendor_code_cache,
            search_text=po.rebuild_search_text(),
        )


@transaction.atomic
def merge(old_code: str, new_code: str) -> dict[str, Any]:
    """Move everything from ``old_code`` to ``new_code`` and delete ``old_code``. Returns the undo record."""
    old = Vendor.objects.select_for_update().filter(code=old_code).first()
    new = Vendor.objects.select_for_update().get(code=new_code)
    if old is None:
        return {'skipped': f'No vendor {old_code}; nothing to merge.'}
    if old.pk == new.pk:
        raise ValueError('A vendor cannot be merged into itself.')

    merged_refs = []
    for src, dst in _clashes(old, new):
        merged_refs.append({
            'deleted': {'id': src.id, **{f: _plain(getattr(src, f)) for f in REF_FIELDS}},
            'kept_id': dst.id,
            'kept_before': {f: _plain(getattr(dst, f)) for f in REF_FIELDS},
        })
        src_newer = bool(src.last_seen_date) and (not dst.last_seen_date or src.last_seen_date > dst.last_seen_date)
        newer, older = (src, dst) if src_newer else (dst, src)
        VendorProductRef.objects.filter(pk=dst.pk).update(
            times_seen=(dst.times_seen or 0) + (src.times_seen or 0),
            last_unit_cost=newer.last_unit_cost if newer.last_unit_cost is not None else older.last_unit_cost,
            last_seen_date=newer.last_seen_date,
        )
        src.delete()

    moved: dict[str, list[int]] = {}
    for label, model, field in _relations():
        ids = list(model.objects.filter(**{field: old}).values_list('pk', flat=True))
        if ids:
            model.objects.filter(pk__in=ids).update(**{field: new})
        moved[label] = ids
    order_ids = moved.get('inventory.PurchaseOrder', [])
    _refresh_orders(order_ids)

    left = {k: v for k, v in counts(old_code).items() if v}
    if left:
        raise RuntimeError(f'Rows still point at {old_code} after the move: {left}. Nothing was changed.')
    vendor_record = {'id': old.id, **{f: _plain(getattr(old, f)) for f in VENDOR_FIELDS}}
    old.delete()
    return {
        'old': vendor_record,
        'new_id': new.id,
        'moved': moved,
        'merged_refs': merged_refs,
        'moved_counts': {k: len(v) for k, v in moved.items()},
        'refs_merged': len(merged_refs),
    }


@transaction.atomic
def undo(record: dict[str, Any]) -> dict[str, Any]:
    """Put the old vendor back with its id, move its rows back and restore merged refs."""
    if not record or 'old' not in record:
        return {'skipped': 'Nothing to undo.'}
    info = dict(record['old'])
    vid = info.pop('id')
    created_at = info.pop('created_at', None)
    old, _ = Vendor.objects.update_or_create(pk=vid, defaults=info)
    if created_at:
        Vendor.objects.filter(pk=vid).update(created_at=created_at)
    rels = {label: (model, field) for label, model, field in _relations()}
    back = {}
    for label, ids in (record.get('moved') or {}).items():
        if label in rels and ids:
            model, field = rels[label]
            back[label] = model.objects.filter(pk__in=ids).update(**{field: old})
    for m in record.get('merged_refs') or []:
        VendorProductRef.objects.filter(pk=m['kept_id']).update(
            times_seen=m['kept_before']['times_seen'],
            last_unit_cost=m['kept_before']['last_unit_cost'],
            last_seen_date=m['kept_before']['last_seen_date'],
        )
        d = dict(m['deleted'])
        rid = d.pop('id')
        seen = d.pop('last_seen_date')
        VendorProductRef.objects.create(pk=rid, vendor=old, **d)
        VendorProductRef.objects.filter(pk=rid).update(last_seen_date=seen)
    _refresh_orders((record.get('moved') or {}).get('inventory.PurchaseOrder', []))
    return {'restored_vendor': old.code, 'moved_back': back, 'refs_restored': len(record.get('merged_refs') or [])}


def _plain(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    return str(value)
