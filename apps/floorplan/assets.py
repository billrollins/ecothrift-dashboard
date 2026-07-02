"""Upload validation and sanitization for floorplan image assets.

Accepts SVG, PNG, and JPEG uploads. SVG content is parsed and re-serialized
with scripts, event handlers, foreignObject, and external references stripped
so stored markup is safe to inline in the editor. Raster images are verified
with Pillow. The sanitized result is returned as a data URI string.
"""
import base64
import io
import re
import xml.etree.ElementTree as ET

from rest_framework import serializers

MAX_ASSET_BYTES = 512 * 1024

ALLOWED_CONTENT_TYPES = {
    'image/svg+xml',
    'image/png',
    'image/jpeg',
}

SVG_NS = 'http://www.w3.org/2000/svg'
XLINK_NS = 'http://www.w3.org/1999/xlink'

# Elements that can execute code or pull in arbitrary content.
_FORBIDDEN_TAGS = {'script', 'foreignObject', 'iframe', 'embed', 'object', 'animate', 'set'}
_HREF_ATTRS = ('href', f'{{{XLINK_NS}}}href')


def _err(msg):
    raise serializers.ValidationError({'file': msg, 'code': 'invalid_asset'})


def _local_tag(el):
    return el.tag.rsplit('}', 1)[-1] if isinstance(el.tag, str) else ''


def _sanitize_svg(raw: bytes) -> bytes:
    if b'<!ENTITY' in raw or b'<!DOCTYPE' in raw:
        _err('SVG files with DOCTYPE/entity declarations are not allowed.')
    try:
        root = ET.fromstring(raw.decode('utf-8'))
    except (ET.ParseError, UnicodeDecodeError):
        _err('File is not a valid SVG document.')
    if _local_tag(root) != 'svg':
        _err('File is not an SVG image.')

    def clean(el):
        for child in list(el):
            if _local_tag(child) in _FORBIDDEN_TAGS:
                el.remove(child)
                continue
            clean(child)
        for attr in list(el.attrib):
            local = attr.rsplit('}', 1)[-1]
            value = el.attrib[attr]
            if local.lower().startswith('on'):
                del el.attrib[attr]
            elif attr in _HREF_ATTRS and not value.startswith('#') and not value.startswith('data:image/'):
                # External references (http, file, javascript:, ...) are dropped
                del el.attrib[attr]
            elif 'javascript:' in value.lower() or re.search(r'url\s*\(\s*[\'"]?\s*(https?|javascript):', value, re.I):
                del el.attrib[attr]

    clean(root)
    ET.register_namespace('', SVG_NS)
    ET.register_namespace('xlink', XLINK_NS)
    return ET.tostring(root, encoding='utf-8')


def _verify_raster(raw: bytes, expected_format: str):
    from PIL import Image
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if img.format != expected_format:
                _err(f'File content does not match its type (expected {expected_format}).')
    except Exception:
        _err('File is not a valid image.')


def sanitize_asset_upload(uploaded_file):
    """Validate an uploaded file and return (data_uri, content_type).

    Raises DRF ValidationError on any problem.
    """
    content_type = (uploaded_file.content_type or '').split(';')[0].strip().lower()
    if content_type == 'image/jpg':
        content_type = 'image/jpeg'
    if content_type not in ALLOWED_CONTENT_TYPES:
        _err('Only SVG, PNG, and JPEG files are allowed.')

    raw = uploaded_file.read()
    if len(raw) > MAX_ASSET_BYTES:
        _err(f'File too large ({len(raw)} bytes; max {MAX_ASSET_BYTES}).')
    if not raw:
        _err('File is empty.')

    if content_type == 'image/svg+xml':
        raw = _sanitize_svg(raw)
        if len(raw) > MAX_ASSET_BYTES:
            _err('File too large after processing.')
    elif content_type == 'image/png':
        _verify_raster(raw, 'PNG')
    else:
        _verify_raster(raw, 'JPEG')

    encoded = base64.b64encode(raw).decode('ascii')
    return f'data:{content_type};base64,{encoded}', content_type
