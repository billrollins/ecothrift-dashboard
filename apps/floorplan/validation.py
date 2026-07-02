"""Server-side validation of plan JSON documents.

Guards against clearly malformed documents so a buggy or malicious client
cannot corrupt saved plans. Intentionally lenient about unknown extra keys
(forward compatibility); strict about structure and coordinate sanity.
"""
import json

from rest_framework import serializers

from .models import CURRENT_SCHEMA_VERSION

MAX_DOCUMENT_BYTES = 1_000_000
# Coordinates/dimensions in inches. 100,000 in ~ 1.5 miles: generous sanity cap.
MAX_COORD = 100_000
COLLECTION_KEYS = ('elements', 'zones', 'paths', 'labels', 'infoBlocks')
MAX_OBJECTS = 5000


def _err(msg):
    raise serializers.ValidationError({'data': msg, 'code': 'invalid_document'})


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _check_coord(value, context):
    if not _is_num(value) or abs(value) > MAX_COORD:
        _err(f'Invalid numeric value in {context}.')


def validate_plan_document(doc):
    """Validate a plan document. Raises DRF ValidationError on failure."""
    if not isinstance(doc, dict):
        _err('Plan document must be a JSON object.')

    if doc.get('schema_version') != CURRENT_SCHEMA_VERSION:
        _err(
            f'Unsupported schema_version {doc.get("schema_version")!r}; '
            f'expected {CURRENT_SCHEMA_VERSION}.'
        )

    try:
        size = len(json.dumps(doc))
    except (TypeError, ValueError):
        _err('Plan document is not JSON-serializable.')
    if size > MAX_DOCUMENT_BYTES:
        _err(f'Plan document too large ({size} bytes; max {MAX_DOCUMENT_BYTES}).')

    plan_settings = doc.get('settings')
    if not isinstance(plan_settings, dict):
        _err('settings must be an object.')
    for key in ('planWidth', 'planHeight'):
        value = plan_settings.get(key)
        if not _is_num(value) or value <= 0 or value > MAX_COORD:
            _err(f'settings.{key} must be a positive number.')

    total = 0
    for key in COLLECTION_KEYS:
        items = doc.get(key)
        if not isinstance(items, list):
            _err(f'{key} must be a list.')
        total += len(items)
        for i, obj in enumerate(items):
            if not isinstance(obj, dict):
                _err(f'{key}[{i}] must be an object.')
            if not isinstance(obj.get('id'), str) or not obj['id']:
                _err(f'{key}[{i}] is missing a string id.')
            if key == 'paths':
                points = obj.get('points')
                if not isinstance(points, list) or not points:
                    _err(f'paths[{i}].points must be a non-empty list.')
                for pt in points:
                    if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                        _err(f'paths[{i}] has a malformed point.')
                    _check_coord(pt[0], f'paths[{i}].points')
                    _check_coord(pt[1], f'paths[{i}].points')
            else:
                _check_coord(obj.get('x'), f'{key}[{i}].x')
                _check_coord(obj.get('y'), f'{key}[{i}].y')
                for dim in ('w', 'h'):
                    if dim in obj:
                        _check_coord(obj[dim], f'{key}[{i}].{dim}')

    if total > MAX_OBJECTS:
        _err(f'Plan contains too many objects ({total}; max {MAX_OBJECTS}).')

    return doc
