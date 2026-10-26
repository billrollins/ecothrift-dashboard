"""The two AI calls for keys, both through the router under the purpose KEYS (Settings > AI picks the model).

1. `read_metrics`: one key photo in, the key's metrics out (type, keyway, head shape, brand, stamped code, cuts).
2. `pick_match`: the new photo and a numbered 3x3 grid of the closest logged keys in, "which number, or NO" out.

Both are small (one photo or two, a short forced tool answer) and land in AIUsage like every routed call. The photos
are never written to a log.
"""
from __future__ import annotations

import base64
import time

KEYS_PURPOSE = 'KEYS'
AI_FEATURE = 'keys'
AI_IMAGE_EDGE = 1280
KEY_TYPES = ('house', 'padlock', 'cabinet', 'car', 'mailbox', 'safe', 'other')


class KeyAIError(Exception):
    pass


def image_block(raw: bytes, edge: int = AI_IMAGE_EDGE) -> dict:
    """A photo as an image block for the router (JPEG, long side `edge`)."""
    from apps.inventory.services.receiving_photos import _open_image, _resize_max_edge, encode_jpeg

    img = _resize_max_edge(_open_image(raw), edge)
    data = base64.b64encode(encode_jpeg(img, quality=88)).decode('ascii')
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': data}}


READ_SYSTEM = (
    'You read one photo of a metal key lying on white photo paper, shot close up. Report what you can see; '
    'leave a field blank (or null) when you cannot read it. Never guess a stamped code. '
    'key_type: house (pin tumbler door key), padlock, cabinet (desk, file, furniture), car, mailbox, safe, or other. '
    'keyway: the blank or keyway, e.g. KW1 (Kwikset), SC1 (Schlage), M1 (Master), Y1 (Yale), only when the shape, '
    'grooves or stamp make it likely. head_shape: a few words, e.g. "Kwikset kidney", "Schlage round", "square", '
    '"rounded rectangle with hole". brand: the name stamped on the head. stamped_code: any number or code stamped on '
    'it (e.g. "DO NOT DUPLICATE 123"). cut_count: how many cuts (valleys) on the blade, 0 when you cannot count '
    'them. cut_depths: the depth of each '
    'cut from the head (bow) to the tip, 0 = shallowest, 9 = deepest, only when you can read every cut. '
    'is_key: false when the photo does not show a key.'
)

READ_TOOL = {
    'name': 'key_metrics',
    'description': 'The metrics read from one key photo.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'is_key': {'type': 'boolean'},
            'key_type': {'type': 'string', 'enum': list(KEY_TYPES)},
            'keyway': {'type': 'string'},
            'head_shape': {'type': 'string'},
            'brand': {'type': 'string'},
            'stamped_code': {'type': 'string'},
            # One plain type: Gemini rejects a type list such as ["integer", "null"].
            'cut_count': {'type': 'integer', 'description': '0 when you cannot count them.'},
            'cut_depths': {'type': 'array', 'items': {'type': 'integer'}},
        },
        'required': ['is_key', 'key_type'],
    },
}

MATCH_SYSTEM = (
    'The first photo is one key. The second image is a grid of up to 9 logged keys, each numbered 1 to 9 in its '
    'corner. Does any of them match the first key exactly: the same blade, the same cuts in the same order, the same '
    'head? Lighting, angle and scale can differ. Answer with the number, or NO when none is the same key.'
)

MATCH_TOOL = {
    'name': 'key_match',
    'description': 'Which numbered key matches, or NO.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'answer': {'type': 'string', 'description': 'A number 1 to 9, or NO.'},
            'reason': {'type': 'string', 'description': 'One short sentence.'},
        },
        'required': ['answer'],
    },
}


def _call(*, system: str, content: list[dict], tool: dict, detail: str):
    from apps.core.ai_config import ai_effort, ai_model
    from apps.core.services.ai_usage_log import log_ai_usage
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

    model_id = ai_model(KEYS_PURPOSE)
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model_id, system=system, messages=[{'role': 'user', 'content': content}],
            tools=[tool], tool_name=tool['name'], max_tokens=1500, effort=ai_effort(KEYS_PURPOSE),
            timeout=60.0, log_source=AI_FEATURE, log_purpose=KEYS_PURPOSE, log_detail=detail,
        )
    except (LLMAPIError, LLMConfigError) as exc:
        log_ai_usage(AI_FEATURE, model_id, purpose=KEYS_PURPOSE, duration_ms=int((time.monotonic() - started) * 1000),
                     detail=detail, success=False, error=str(exc)[:500])
        raise KeyAIError('The AI could not read this photo. Try again.') from exc
    raw = result.tool_input
    if raw is None:
        from apps.inventory.services.category_taxonomy import extract_json_object

        try:
            raw = extract_json_object(result.text or '')
        except Exception:  # noqa: BLE001 - nothing usable came back
            raise KeyAIError('The AI answer was not usable. Try again.')
    return raw, result.model_used


def _text(raw, limit: int) -> str:
    return ' '.join(str(raw or '').split())[:limit]


def clean_metrics(raw: dict) -> dict:
    """The AI's answer cut to the Key fields: known type, trimmed text, digits 0-9 for depths."""
    key_type = _text(raw.get('key_type'), 20).lower()
    depths = []
    for d in raw.get('cut_depths') or []:
        try:
            n = int(d)
        except (TypeError, ValueError):
            depths = []
            break
        depths.append(min(9, max(0, n)))
    try:
        cut_count = int(raw.get('cut_count')) if raw.get('cut_count') is not None else None
    except (TypeError, ValueError):
        cut_count = None
    if cut_count is not None and not 0 < cut_count <= 12:
        cut_count = None
    if depths and cut_count is None:
        cut_count = len(depths)
    return {
        'is_key': raw.get('is_key') is not False,
        'key_type': key_type if key_type in KEY_TYPES else '',
        'keyway': _text(raw.get('keyway'), 40).upper(),
        'head_shape': _text(raw.get('head_shape'), 40),
        'brand': _text(raw.get('brand'), 60),
        'stamped_code': _text(raw.get('stamped_code'), 60),
        'cut_count': cut_count,
        'cut_depths': '-'.join(str(d) for d in depths)[:60],
    }


def read_metrics(raw_photo: bytes) -> tuple[dict, str]:
    """Call 1: the metrics of the key in this photo. Returns (clean metrics, model used)."""
    raw, model = _call(
        system=READ_SYSTEM, content=[{'type': 'text', 'text': 'Read this key.'}, image_block(raw_photo)],
        tool=READ_TOOL, detail='Read a key photo',
    )
    return clean_metrics(raw if isinstance(raw, dict) else {}), model


def parse_answer(raw: dict, count: int) -> int | None:
    """The match number (1..count), or None for NO or anything unusable."""
    answer = str((raw or {}).get('answer') or '').strip().upper().rstrip('.')
    if answer.startswith('#'):
        answer = answer[1:]
    if answer.isdigit() and 1 <= int(answer) <= count:
        return int(answer)
    return None


def pick_match(query_photo: bytes, grid_jpeg: bytes, count: int) -> tuple[int | None, str, str]:
    """Call 2: which of the `count` numbered keys in the grid is the photo's key. Returns (number or None, reason,
    model used)."""
    raw, model = _call(
        system=MATCH_SYSTEM,
        content=[
            {'type': 'text', 'text': f'Key photo, then the grid of {count} numbered keys. Does any match?'},
            image_block(query_photo),
            image_block(grid_jpeg, edge=1500),
        ],
        tool=MATCH_TOOL, detail=f'Match a key against {count}',
    )
    raw = raw if isinstance(raw, dict) else {}
    return parse_answer(raw, count), _text(raw.get('reason'), 300), model
