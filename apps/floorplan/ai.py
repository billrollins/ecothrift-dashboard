"""Floorplan AI: build an element SVG and propose plan adjustments.

Both tools return a proposal and save nothing. The person applies it in the
editor. Every call is one attempt with a 25 s budget so the request finishes
inside Heroku's 30 s router limit.
"""
from __future__ import annotations

import json
import math
import re
import secrets

from django.db.models import Q
from rest_framework import serializers

from apps.core.services.ai_catalog import resolve_run_choice
from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

from .assets import sanitize_svg_markup
from .models import CURRENT_SCHEMA_VERSION, FloorPlanAsset, FloorPlanElementKind
from .serializers import HEX_COLOR_RE, MAX_KIND_DIM, MIN_KIND_DIM
from .validation import validate_plan_document

FLOORPLAN_AI_TIMEOUT_SECONDS = 25.0
SVG_MAX_TOKENS = 6000
ADJUST_MAX_TOKENS = 8000
MAX_INSTRUCTION_CHARS = 2000
MAX_NOTES_CHARS = 1000
MAX_LAYERS_CHARS = 200_000
MAX_PROMPT_ASSETS = 300
MAX_OPS = 200
TRUNCATED_STOP_REASONS = ('max_tokens', 'length', 'MAX_TOKENS', 'model_context_window_exceeded')
TIMEOUT_MESSAGE = (
    'The model did not answer within 25 seconds. '
    'Pick a faster model or a lower effort and try again.'
)

COLLECTIONS = ('elements', 'zones', 'paths', 'labels', 'infoBlocks')
ADDABLE = ('elements', 'zones', 'labels', 'paths')
ID_PREFIX = {'elements': 'el', 'zones': 'zn', 'paths': 'pa', 'labels': 'lb', 'infoBlocks': 'ib'}
NOUN = {'elements': 'element', 'zones': 'zone', 'paths': 'path', 'labels': 'label', 'infoBlocks': 'info block'}
EDITABLE_FIELDS = {
    'elements': {'kind', 'x', 'y', 'w', 'h', 'rotation', 'label', 'active', 'image',
                 'labelHidden', 'locked', 'flipH', 'flipV'},
    'zones': {'label', 'x', 'y', 'w', 'h', 'color', 'opacity', 'locked'},
    'labels': {'text', 'x', 'y', 'fontSize', 'color', 'locked'},
    'paths': {'points', 'stroke', 'width', 'locked'},
    'infoBlocks': {'x', 'y', 'w', 'h', 'locked'},
}
ADD_DEFAULTS = {
    'elements': {'rotation': 0, 'label': '', 'active': True},
    'zones': {'label': '', 'w': 96, 'h': 96, 'color': '#4caf50', 'opacity': 0.25},
    'labels': {'text': 'Label', 'fontSize': 12, 'color': '#263238'},
    'paths': {'stroke': '#37474f', 'width': 2},
}
ALLOWED_SETTINGS_KEYS = ('planWidth', 'planHeight', 'snap')
ROTATIONS = (0, 90, 180, 270)
INFO_BLOCK_TYPES = ('titleBlock', 'notes', 'legend', 'northArrow', 'scaleBar')
TEXT_FIELDS = {
    'elements': ('label',),
    'zones': ('label', 'color'),
    'labels': ('text', 'color'),
    'paths': ('stroke',),
}
BOOL_FIELDS = ('locked', 'labelHidden', 'flipH', 'flipV', 'active')


class FloorplanAIError(Exception):
    """User-facing failure. ``status`` is the HTTP status to return."""

    def __init__(self, message: str, *, status: int = 400):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------------------
# shared helpers

def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _fmt(number: float) -> str:
    return str(int(number)) if float(number).is_integer() else f'{number:.2f}'.rstrip('0').rstrip('.')


def _validation_message(exc: serializers.ValidationError) -> str:
    detail = getattr(exc, 'detail', None)
    if isinstance(detail, dict):
        for key in ('data', 'file'):
            if key in detail:
                value = detail[key]
                if isinstance(value, list):
                    value = value[0] if value else ''
                return str(value)
    return str(exc)


def _reject_constant(name):
    raise ValueError(f'The model reply contains {name}, which is not a number.')


def parse_json_object(text: str) -> dict:
    """Parse a JSON object from model text; tolerates ``` fences and stray prose."""
    text = (text or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    try:
        data = json.loads(text, parse_constant=_reject_constant)
    except json.JSONDecodeError:
        start = text.find('{')
        end = text.rfind('}')
        if start < 0 or end <= start:
            raise ValueError('Could not find a JSON object in the model reply.') from None
        data = json.loads(text[start:end + 1], parse_constant=_reject_constant)
    if not isinstance(data, dict):
        raise ValueError('The model reply must be a JSON object.')
    return data


def _call_model(*, purpose, model, effort, system, user, max_tokens, log_detail):
    try:
        model_id, run_effort = resolve_run_choice(purpose, model, effort)
    except ValueError as exc:
        raise FloorplanAIError(str(exc), status=400) from exc
    try:
        result = llm_complete(
            model_id=model_id,
            system=system,
            user=user,
            max_tokens=max_tokens,
            temperature=None,
            timeout=FLOORPLAN_AI_TIMEOUT_SECONDS,
            max_retries=0,
            effort=run_effort,
            log_source='floorplan_ai',
            log_detail=log_detail,
        )
    except LLMConfigError as exc:
        raise FloorplanAIError(str(exc), status=503) from exc
    except LLMAPIError as exc:
        text = str(exc)
        lowered = text.lower()
        if exc.kind == 'connection' and ('timed out' in lowered or 'timeout' in lowered):
            raise FloorplanAIError(TIMEOUT_MESSAGE, status=504) from exc
        status = 503 if exc.kind in ('auth', 'connection', 'rate_limit') else 400
        raise FloorplanAIError(f'The AI service refused the request: {text[:300]}', status=status) from exc
    reason = str(result.stop_reason or '')
    if reason in TRUNCATED_STOP_REASONS:
        raise FloorplanAIError(
            'The model ran out of room before finishing. Try a lower effort or a different model.',
            status=422,
        )
    if reason == 'refusal':
        raise FloorplanAIError('The model declined this request.', status=422)
    if not (result.text or '').strip():
        raise FloorplanAIError('The model returned an empty answer. Try again.', status=422)
    return result


# ---------------------------------------------------------------------------
# Build SVG

SVG_SYSTEM_PROMPT = """You draw SVG symbols for a retail store floorplan editor (top-down view).

OUTPUT FORMAT
- Return ONLY one SVG document that starts with <svg and ends with </svg>.
- No markdown, no code fences, no words before or after.

COORDINATE SYSTEM
- Top-down floor plan (bird's-eye). Not an elevation, not 3D, not perspective.
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H"> where W is the footprint width and H is the footprint depth in inches from the brief.
- The editor stretches the drawing to fill the footprint exactly, so the viewBox must be exactly 0 0 W H.
- Origin is top-left and y points down. Keep all geometry inside x 0..W and y 0..H.
- Design for rotation 0 with the customer-facing edge at the bottom unless the notes say otherwise.

HOUSE STYLE
- Background: a rect at x="0.5" y="0.5" with width W minus 1 and height H minus 1, fill set to the base fill color from the brief, fill-opacity="0.35", stroke="#37474f", stroke-width="1".
- Detail lines: stroke="#37474f" with stroke-width between 0.5 and 0.75.
- Outer border lines: stroke="#263238" with stroke-width between 1 and 1.2.
- Flat fills only, 2 to 5 colors. No gradients, shadows, patterns, or filters.
- The symbol must stay recognizable when drawn about 1 inch wide on screen.

ALLOWED MARKUP
- Only these elements: svg, g, rect, line, polyline, polygon, circle, ellipse, path.
- Put fill, stroke, and stroke-width as attributes on each shape.
- Never use: script, style, text, defs, use, image, foreignObject, iframe, embed, object, animate, set, filter, DOCTYPE, ENTITY, event attributes such as onclick or onload, or any href.

SEMANTICS
- Draw one fixture or architectural element as seen from above.
- No room context, floor texture, dimensions, labels, or scale bars.

EXAMPLE (a 48 x 144 inch gondola with base fill #7986cb):
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 144" width="48" height="144">
  <rect x="0.5" y="0.5" width="47" height="143" fill="#7986cb" fill-opacity="0.35" stroke="#37474f" stroke-width="1"/>
  <rect x="1" y="1" width="46" height="3" fill="#5c6bc0" stroke="#37474f" stroke-width="0.5"/>
  <rect x="1" y="140" width="46" height="3" fill="#5c6bc0" stroke="#37474f" stroke-width="0.5"/>
  <rect x="4" y="70" width="40" height="4" fill="#5c6bc0"/>
  <line x1="4" y1="72" x2="44" y2="72" stroke="#37474f" stroke-width="0.75"/>
  <line x1="10" y1="6" x2="10" y2="69" stroke="#37474f" stroke-width="0.6"/>
  <line x1="24" y1="6" x2="24" y2="69" stroke="#37474f" stroke-width="0.6"/>
  <line x1="38" y1="6" x2="38" y2="69" stroke="#37474f" stroke-width="0.6"/>
  <line x1="10" y1="75" x2="10" y2="138" stroke="#37474f" stroke-width="0.6"/>
  <line x1="24" y1="75" x2="24" y2="138" stroke="#37474f" stroke-width="0.6"/>
  <line x1="38" y1="75" x2="38" y2="138" stroke="#37474f" stroke-width="0.6"/>
  <line x1="0.5" y1="0.5" x2="0.5" y2="143.5" stroke="#263238" stroke-width="1.2"/>
  <line x1="47.5" y1="0.5" x2="47.5" y2="143.5" stroke="#263238" stroke-width="1.2"/>
  <line x1="0.5" y1="0.5" x2="47.5" y2="0.5" stroke="#263238" stroke-width="1.2"/>
  <line x1="0.5" y1="143.5" x2="47.5" y2="143.5" stroke="#263238" stroke-width="1.2"/>
</svg>
"""

SVG_USER_TEMPLATE = (
    'Element: {label}\n'
    'Category: {category}\n'
    'Footprint: {w} x {d} inches (width x depth, top-down). Use viewBox="0 0 {w} {d}".\n'
    'Base fill color: {fill}\n'
    'Notes from the store owner:\n'
    '{notes}\n'
    '\n'
    'Output the SVG only.'
)

_SVG_OPEN_RE = re.compile(r'<svg\b', re.IGNORECASE)
_VIEWBOX_RE = re.compile(r'viewBox\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_SVG_NS_ATTRS = ('xmlns="http://www.w3.org/2000/svg"', "xmlns='http://www.w3.org/2000/svg'")


def extract_svg(text: str) -> str:
    """Cut the <svg ...>...</svg> block out of a reply and make sure it has the SVG xmlns."""
    raw = str(text or '')
    match = _SVG_OPEN_RE.search(raw)
    end = raw.lower().rfind('</svg>')
    if not match or end < match.start():
        raise FloorplanAIError('The model did not return an SVG. Try again.', status=422)
    markup = raw[match.start():end + len('</svg>')]
    head = markup[:markup.find('>')]
    if not any(attr in head for attr in _SVG_NS_ATTRS):
        markup = '<svg xmlns="http://www.w3.org/2000/svg"' + markup[4:]
    return markup


def _ensure_viewbox(markup: str, width: float, depth: float) -> str:
    head = markup[:markup.find('>')]
    match = _VIEWBOX_RE.search(head)
    if not match:
        return markup[:4] + f' viewBox="0 0 {_fmt(width)} {_fmt(depth)}"' + markup[4:]
    parts = match.group(1).replace(',', ' ').split()
    try:
        vw, vh = float(parts[2]), float(parts[3])
    except (IndexError, ValueError):
        raise FloorplanAIError('The SVG has a broken viewBox. Try again.', status=422) from None
    if vw <= 0 or vh <= 0 or abs((vw / vh) / (width / depth) - 1) > 0.02:
        raise FloorplanAIError(
            f'The SVG shape ({_fmt(vw)} x {_fmt(vh)}) does not match '
            f'{_fmt(width)} x {_fmt(depth)}. Try again.',
            status=422,
        )
    return markup


def _dimension(value, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise FloorplanAIError(f'{name} must be a number of inches.') from None
    if not math.isfinite(number) or number < MIN_KIND_DIM or number > MAX_KIND_DIM:
        raise FloorplanAIError(f'{name} must be between {MIN_KIND_DIM} and {MAX_KIND_DIM} inches.')
    return number


def generate_kind_svg(*, label, width, depth, category=None, fill_color=None, notes=None,
                      model=None, effort=None) -> dict:
    """Return {svg_data_uri, model_used, width, depth}. Saves nothing."""
    label = str(label or '').strip()
    if not label:
        raise FloorplanAIError('Name is required.')
    if len(label) > 128:
        raise FloorplanAIError('Name is too long (max 128 characters).')
    width_in = _dimension(width, 'Width')
    depth_in = _dimension(depth, 'Depth')
    category = str(category or '').strip()[:64] or 'Misc'
    fill = str(fill_color or '').strip().lower() or '#9e9e9e'
    if not HEX_COLOR_RE.match(fill):
        raise FloorplanAIError('Base color must look like #9e9e9e.')
    notes = str(notes or '').strip()
    if len(notes) > MAX_NOTES_CHARS:
        raise FloorplanAIError(f'Notes are too long (max {MAX_NOTES_CHARS} characters).')

    user_msg = SVG_USER_TEMPLATE.format(
        label=label, category=category, w=_fmt(width_in), d=_fmt(depth_in), fill=fill,
        notes=notes or '(none)',
    )
    result = _call_model(
        purpose='FLOORPLAN_SVG', model=model, effort=effort, system=SVG_SYSTEM_PROMPT,
        user=user_msg, max_tokens=SVG_MAX_TOKENS, log_detail=f'generate_svg {label[:60]}',
    )
    markup = _ensure_viewbox(extract_svg(result.text), width_in, depth_in)
    try:
        data_uri = sanitize_svg_markup(markup)
    except serializers.ValidationError as exc:
        raise FloorplanAIError(
            f'The SVG did not pass the safety check: {_validation_message(exc)}', status=422,
        ) from exc
    return {
        'svg_data_uri': data_uri,
        'model_used': result.model_used,
        'width': width_in,
        'depth': depth_in,
    }


# ---------------------------------------------------------------------------
# Adjust plan

ADJUST_SYSTEM_PROMPT = """You edit a retail store floorplan. You get the current plan as JSON and one instruction from a store manager.

Reply with ONLY one JSON object. No markdown, no code fences, no words before or after. Shape:
{"notes": "one short sentence about what you changed", "ops": [ ... ], "settings": { ... }}

UNITS AND AXES
- All numbers are inches. x grows to the right, y grows down.
- (x, y) is the top-left corner of an object's unrotated box. w is width, h is depth.
- The plan is settings.planWidth wide and settings.planHeight deep.
- rotation is one of 0, 90, 180, 270 (clockwise about the box center).

OPS (applied in order)
- {"op": "add", "collection": C, "object": {...}} where C is elements, zones, labels, or paths. Never include "id"; the server assigns it.
- {"op": "update", "collection": C, "id": "<existing id>", "changes": {...}} where C is elements, zones, labels, paths, or infoBlocks. Only include fields that change.
- {"op": "delete", "collection": C, "id": "<existing id>"} where C is elements, zones, labels, paths, or infoBlocks.

FIELDS YOU MAY SET
- elements: kind, x, y, w, h, rotation, label, active, image, labelHidden, locked, flipH, flipV
- zones: label, x, y, w, h, color, opacity, locked
- labels: text, x, y, fontSize, color, locked
- paths: points (a list of [x, y] pairs), stroke, width, locked
- infoBlocks (update only): x, y, w, h, locked

RULES
- elements.kind must be one of the slugs in AVAILABLE KINDS. Never invent a kind.
- elements.image, when set, must be one of the ids in AVAILABLE IMAGES.
- A new element needs kind, x, and y. w and h default to the kind's size.
- Keep everything inside the plan. Do not stack new objects on top of existing ones unless asked.
- Change only what the instruction asks for.
- If the instruction cannot be done, return "ops": [] and explain why in notes.
- "settings" is optional. It may only contain planWidth, planHeight, and snap.
"""


def _validate_sent_document(document) -> dict:
    if not isinstance(document, dict):
        raise FloorplanAIError('document must be a JSON object.')
    base = {'schema_version': CURRENT_SCHEMA_VERSION, 'settings': document.get('settings')}
    for coll in COLLECTIONS:
        base[coll] = document.get(coll)
    try:
        validate_plan_document(base)
    except serializers.ValidationError as exc:
        raise FloorplanAIError(
            f'The plan sent for AI adjust is not valid: {_validation_message(exc)}',
        ) from exc
    base['settings'] = dict(base['settings'])
    for coll in COLLECTIONS:
        base[coll] = [dict(obj) for obj in base[coll]]
    return base


def _adjust_user_message(instruction: str, base: dict, kinds: list, assets: list) -> str:
    kind_lines = '\n'.join(f'{k} | {lbl} | {_fmt(w)} x {_fmt(h)}' for k, lbl, w, h in kinds) or '(none)'
    asset_lines = '\n'.join(f'{aid} | {name}' for aid, name in assets) or '(none)'
    plan = {'settings': {k: base['settings'].get(k) for k in ALLOWED_SETTINGS_KEYS}}
    plan.update({coll: base[coll] for coll in COLLECTIONS})
    return (
        'INSTRUCTION\n' + instruction + '\n\n'
        'AVAILABLE KINDS (slug | label | default w x h in inches)\n' + kind_lines + '\n\n'
        'AVAILABLE IMAGES (id | name)\n' + asset_lines + '\n\n'
        'CURRENT PLAN\n' + json.dumps(plan, separators=(',', ':'))
    )


def _new_id(coll: str, used: set) -> str:
    while True:
        candidate = f'{ID_PREFIX[coll]}_ai{secrets.token_hex(4)}'
        if candidate not in used:
            return candidate


def _index_of(items: list, obj_id) -> int | None:
    for idx, obj in enumerate(items):
        if obj.get('id') == obj_id:
            return idx
    return None


def apply_ops(before: dict, ops, kind_sizes: dict) -> dict:
    """Apply model ops to copies of the layers. Raises ValueError with a readable message."""
    if ops is None:
        ops = []
    if not isinstance(ops, list):
        raise ValueError('"ops" must be a list.')
    if len(ops) > MAX_OPS:
        raise ValueError(f'Too many changes ({len(ops)}; max {MAX_OPS}).')
    out = {coll: [dict(obj) for obj in before[coll]] for coll in COLLECTIONS}
    used_ids = {obj['id'] for coll in COLLECTIONS for obj in out[coll]}
    for n, op in enumerate(ops, start=1):
        if not isinstance(op, dict):
            raise ValueError(f'Change {n} is not an object.')
        kind = op.get('op')
        coll = op.get('collection')
        if coll not in COLLECTIONS:
            raise ValueError(f'Change {n} has an unknown collection {coll!r}.')
        if kind == 'add':
            if coll not in ADDABLE:
                raise ValueError(f'Change {n}: {coll} cannot be added.')
            obj = op.get('object')
            if not isinstance(obj, dict) or not obj:
                raise ValueError(f'Change {n}: "object" must be a non-empty object.')
            extra = set(obj) - EDITABLE_FIELDS[coll]
            if extra:
                raise ValueError(f'Change {n} sets fields that are not allowed: {sorted(extra)}.')
            new = {**ADD_DEFAULTS.get(coll, {}), **{k: v for k, v in obj.items() if v is not None}}
            if coll == 'elements':
                size = kind_sizes.get(new['kind']) if isinstance(new.get('kind'), str) else None
                if size:
                    new.setdefault('w', size[0])
                    new.setdefault('h', size[1])
            new['id'] = _new_id(coll, used_ids)
            used_ids.add(new['id'])
            out[coll].append(new)
        elif kind == 'update':
            idx = _index_of(out[coll], op.get('id'))
            if idx is None:
                raise ValueError(f'Change {n} points at {coll} id {op.get("id")!r}, which does not exist.')
            changes = op.get('changes')
            if not isinstance(changes, dict) or not changes:
                raise ValueError(f'Change {n}: "changes" must be a non-empty object.')
            extra = set(changes) - EDITABLE_FIELDS[coll]
            if extra:
                raise ValueError(f'Change {n} sets fields that are not allowed: {sorted(extra)}.')
            updated = dict(out[coll][idx])
            for key, value in changes.items():
                if value is None:
                    updated.pop(key, None)
                else:
                    updated[key] = value
            out[coll][idx] = updated
        elif kind == 'delete':
            idx = _index_of(out[coll], op.get('id'))
            if idx is None:
                raise ValueError(f'Change {n} points at {coll} id {op.get("id")!r}, which does not exist.')
            out[coll].pop(idx)
        else:
            raise ValueError(f'Change {n} has an unknown op {kind!r}.')
    return out


def _settings_patch(current: dict, patch) -> dict:
    if patch is None or patch == {}:
        return {}
    if not isinstance(patch, dict):
        raise ValueError('"settings" must be an object.')
    extra = set(patch) - set(ALLOWED_SETTINGS_KEYS)
    if extra:
        raise ValueError(
            f'"settings" may only change {", ".join(ALLOWED_SETTINGS_KEYS)} '
            f'(got {", ".join(sorted(extra))}).'
        )
    out = {}
    for key, value in patch.items():
        if not _is_number(value) or value <= 0:
            raise ValueError(f'settings.{key} must be a positive number.')
        if current.get(key) != value:
            out[key] = value
    return out


def _check_one(coll: str, obj: dict, allowed_kinds: set, allowed_images: set) -> None:
    name = f'{NOUN[coll]} {obj.get("id")}'
    if coll in ('elements', 'zones', 'infoBlocks'):
        for dim in ('w', 'h'):
            if not _is_number(obj.get(dim)) or obj[dim] <= 0:
                raise ValueError(f'{name} needs a positive {dim}.')
    if coll == 'elements':
        if not isinstance(obj.get('kind'), str) or obj['kind'] not in allowed_kinds:
            raise ValueError(f'{name} uses unknown kind {obj.get("kind")!r}.')
        if obj.get('rotation') not in ROTATIONS:
            raise ValueError(f'{name} rotation must be 0, 90, 180, or 270.')
        image = obj.get('image')
        if image is not None and (not _is_int(image) or image not in allowed_images):
            raise ValueError(f'{name} points at image {image!r}, which does not exist.')
        if not isinstance(obj.get('label', ''), str):
            raise ValueError(f'{name} label must be text.')
        if not isinstance(obj.get('active', True), bool):
            raise ValueError(f'{name} active must be true or false.')
    elif coll == 'zones':
        opacity = obj.get('opacity')
        if not _is_number(opacity) or opacity < 0 or opacity > 1:
            raise ValueError(f'{name} opacity must be between 0 and 1.')
        if not isinstance(obj.get('color'), str):
            raise ValueError(f'{name} color must be text.')
    elif coll == 'labels':
        if not isinstance(obj.get('text'), str) or not obj['text'].strip():
            raise ValueError(f'{name} needs text.')
        if not _is_number(obj.get('fontSize')) or obj['fontSize'] <= 0:
            raise ValueError(f'{name} needs a positive fontSize.')
    elif coll == 'paths':
        if not _is_number(obj.get('width')) or obj['width'] <= 0:
            raise ValueError(f'{name} needs a positive width.')
    elif coll == 'infoBlocks':
        if obj.get('type') not in INFO_BLOCK_TYPES:
            raise ValueError(f'{name} has an unknown type.')
    # Wrong value types would crash the editor after Apply.
    for key in TEXT_FIELDS.get(coll, ()):
        if key in obj and not isinstance(obj[key], str):
            raise ValueError(f'{name} {key} must be text.')
    for key in BOOL_FIELDS:
        if key in obj and not isinstance(obj[key], bool):
            raise ValueError(f'{name} {key} must be true or false.')


def check_objects(before: dict, after: dict, allowed_kinds: set, allowed_images: set) -> None:
    """Rules validate_plan_document does not cover. Only new or changed objects are checked."""
    seen = set()
    for coll in COLLECTIONS:
        for obj in after[coll]:
            if obj['id'] in seen:
                raise ValueError(f'Id {obj["id"]!r} is used twice.')
            seen.add(obj['id'])
    for coll in COLLECTIONS:
        old = {obj['id']: obj for obj in before[coll]}
        for obj in after[coll]:
            if old.get(obj['id']) == obj:
                continue
            _check_one(coll, obj, allowed_kinds, allowed_images)


def _describe(coll: str, obj: dict) -> str:
    if coll == 'elements':
        name = obj.get('label') or obj.get('kind') or ''
    elif coll == 'zones':
        name = obj.get('label') or ''
    elif coll == 'labels':
        name = obj.get('text') or ''
    else:
        name = ''
    return f'"{name}" ({obj.get("id")})' if name else f'({obj.get("id")})'


def summarize(before: dict, after: dict) -> dict:
    counts = {}
    lines = []
    for coll in COLLECTIONS:
        old = {obj['id']: obj for obj in before[coll]}
        new = {obj['id']: obj for obj in after[coll]}
        added = [i for i in new if i not in old]
        removed = [i for i in old if i not in new]
        changed = [i for i in new if i in old and new[i] != old[i]]
        counts[coll] = {'added': len(added), 'changed': len(changed), 'removed': len(removed)}
        for i in added:
            lines.append(f'Added {NOUN[coll]} {_describe(coll, new[i])}')
        for i in changed:
            keys = sorted(k for k in set(old[i]) | set(new[i]) if old[i].get(k) != new[i].get(k))
            lines.append(f'Changed {NOUN[coll]} {_describe(coll, new[i])}: {", ".join(keys)}')
        for i in removed:
            lines.append(f'Removed {NOUN[coll]} {_describe(coll, old[i])}')
    return {'counts': counts, 'lines': lines[:100], 'more': max(0, len(lines) - 100)}


def propose_adjustment(*, plan, instruction, document, model=None, effort=None) -> dict:
    """Return {layers, settings_patch, summary, notes, model_used}. Saves nothing."""
    text = str(instruction or '').strip()
    if not text:
        raise FloorplanAIError('Say what to change.')
    if len(text) > MAX_INSTRUCTION_CHARS:
        raise FloorplanAIError(f'Instruction is too long (max {MAX_INSTRUCTION_CHARS} characters).')
    base = _validate_sent_document(document)
    layers_json = json.dumps({coll: base[coll] for coll in COLLECTIONS}, separators=(',', ':'))
    if len(layers_json) > MAX_LAYERS_CHARS:
        raise FloorplanAIError('This plan is too big for AI adjust. Edit it by hand or split it.')

    kinds = list(
        FloorPlanElementKind.objects.filter(is_active=True)
        .order_by('category', 'sort_order', 'id')
        .values_list('kind', 'label', 'default_w', 'default_h')
    )
    asset_qs = FloorPlanAsset.objects.filter(is_active=True).filter(
        Q(location_id=plan.location_id) | Q(location__isnull=True),
    )
    assets = list(asset_qs.order_by('name').values_list('id', 'name')[:MAX_PROMPT_ASSETS])

    result = _call_model(
        purpose='FLOORPLAN_ADJUST', model=model, effort=effort, system=ADJUST_SYSTEM_PROMPT,
        user=_adjust_user_message(text, base, kinds, assets), max_tokens=ADJUST_MAX_TOKENS,
        log_detail=f'ai_adjust plan={plan.pk}',
    )
    try:
        reply = parse_json_object(result.text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise FloorplanAIError('The model did not return valid JSON. Try again.', status=422) from exc

    before = {coll: base[coll] for coll in COLLECTIONS}
    kind_sizes = {k: (w, h) for k, _lbl, w, h in kinds}
    try:
        after = apply_ops(before, reply.get('ops'), kind_sizes)
        settings_patch = _settings_patch(base['settings'], reply.get('settings'))
    except ValueError as exc:
        raise FloorplanAIError(f'The AI suggestion broke a rule: {exc}', status=422) from exc

    merged = {
        'schema_version': CURRENT_SCHEMA_VERSION,
        'settings': {**base['settings'], **settings_patch},
        **after,
    }
    try:
        validate_plan_document(merged)
    except serializers.ValidationError as exc:
        raise FloorplanAIError(
            f'The AI suggestion broke a rule: {_validation_message(exc)}', status=422,
        ) from exc

    allowed_kinds = {k for k, _lbl, _w, _h in kinds} | {str(e.get('kind')) for e in before['elements']}
    allowed_images = set(asset_qs.values_list('id', flat=True)) | {
        e.get('image') for e in before['elements'] if _is_int(e.get('image'))
    }
    try:
        check_objects(before, after, allowed_kinds, allowed_images)
    except ValueError as exc:
        raise FloorplanAIError(f'The AI suggestion broke a rule: {exc}', status=422) from exc

    return {
        'layers': after,
        'settings_patch': settings_patch,
        'summary': summarize(before, after),
        'notes': str(reply.get('notes') or '').strip()[:500],
        'model_used': result.model_used,
    }
