"""AI Create for me - structure proposal + xAI Grok Imagine background.

Structure: LLM proposes a validated ``definition`` JSON (variables + elements).
Image: xAI ``/v1/images/generations`` returns base64 for user approval; S3 upload
happens only after the client calls the existing background endpoint.
"""
from __future__ import annotations

import json
import logging
import math
import re
from typing import Any

from django.conf import settings

from apps.core.ai_config import ai_effort, ai_model
from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

from .definition import (
    ALLOWED_ALIGN,
    ALLOWED_ECC,
    ALLOWED_FONTS,
    ALLOWED_INCREMENT_FORMATS,
    ALLOWED_TYPES,
    ALLOWED_VAR_KINDS,
    MAX_ELEMENTS,
    MAX_VARIABLES,
    DefinitionError,
    validate_definition,
)

logger = logging.getLogger(__name__)

# Nearest-match targets for xAI aspect_ratio (width:height).
_ASPECT_TARGETS: list[tuple[str, float]] = [
    ('1:1', 1.0),
    ('3:2', 1.5),
    ('2:3', 2 / 3),
    ('4:3', 4 / 3),
    ('3:4', 0.75),
    ('16:9', 16 / 9),
    ('9:16', 9 / 16),
    ('2:1', 2.0),
    ('1:2', 0.5),
]

_STRUCTURE_SYSTEM = f"""You design monochrome thermal-print label templates for a thrift store.
Return ONLY a JSON object (no markdown) with this exact shape:
{{
  "variables": [
    {{"key": "snake_case", "name": "Human Name", "kind": "text", "default": ""}},
    {{"key": "price", "name": "Price", "kind": "increment",
      "default_start": "1", "default_step": "1", "format": one of {list(ALLOWED_INCREMENT_FORMATS)}}}
  ],
  "elements": [
    {{"type": "text", "variable": "key" OR "literal": "fixed", "x_pct": 0-100, "y_pct": 0-100,
      "font": one of {list(ALLOWED_FONTS)}, "size_pt": 4-200, "align": one of {list(ALLOWED_ALIGN)}, "bold": false}},
    {{"type": "qr", "variable"|"literal", "x_pct", "y_pct", "w_pct", "h_pct", "ecc": one of {list(ALLOWED_ECC)}}},
    {{"type": "barcode", "variable"|"literal", "x_pct", "y_pct", "w_pct", "h_pct", "show_text": true|false}}
  ]
}}
Rules:
- Max {MAX_VARIABLES} variables, {MAX_ELEMENTS} elements.
- Variable keys: lowercase letter then [a-z0-9_], max 40 chars.
- Variable kinds only: {list(ALLOWED_VAR_KINDS)}. Prefer kind "text" unless the brief needs a per-copy sequence.
- Each element must set exactly one of variable or literal.
- Element types only: {list(ALLOWED_TYPES)}.
- Positions are percentages of label width/height; keep text readable; leave margins.
- Prefer arial for body text; use QR/barcode only when the brief needs scannable codes.
- Design for black-on-white thermal labels (no color).
"""


class LabelAIError(Exception):
    """User-facing AI Create failure (maps to HTTP 400/503)."""

    def __init__(self, message: str, *, status: int = 400):
        super().__init__(message)
        self.status = status


def aspect_ratio_for_inches(width_in: float, height_in: float) -> str:
    """Map label inches to the nearest xAI ``aspect_ratio`` string."""
    if width_in <= 0 or height_in <= 0:
        return 'auto'
    ratio = width_in / height_in
    best_name, best_dist = 'auto', math.inf
    for name, target in _ASPECT_TARGETS:
        dist = abs(math.log(ratio) - math.log(target))
        if dist < best_dist:
            best_name, best_dist = name, dist
    return best_name


def _parse_json_object(text: str) -> dict[str, Any]:
    text = (text or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find('{')
        end = text.rfind('}')
        if start < 0 or end <= start:
            raise ValueError('Could not parse JSON object from model response')
        data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError('Model response JSON must be an object')
    return data


def propose_structure(
    *,
    brief: str,
    width_in: float,
    height_in: float,
) -> dict:
    """Propose a validated definition from a user brief. Retries once on parse/validation failure."""
    brief = (brief or '').strip()
    if not brief:
        raise LabelAIError('brief is required.')
    if len(brief) > 2000:
        raise LabelAIError('brief is too long (max 2000 characters).')

    model_id = ai_model('LABEL_STRUCTURE')
    user_msg = (
        f'Label size: {width_in}" × {height_in}" (width × height).\n'
        f'Design brief:\n{brief}\n'
        'Return only the JSON definition object.'
    )

    last_err: str | None = None
    for attempt in range(2):
        retry_note = ''
        if last_err:
            retry_note = (
                f'\n\nPrevious attempt failed validation: {last_err}\n'
                'Fix the JSON and return a valid definition only.'
            )
        try:
            result = llm_complete(
                model_id=model_id,
                system=_STRUCTURE_SYSTEM,
                user=user_msg + retry_note,
                temperature=0.2,
                max_tokens=4096,
                effort=ai_effort('LABEL_STRUCTURE'),
                log_source='label_ai_structure',
                log_detail='propose_structure',
            )
        except LLMConfigError as exc:
            raise LabelAIError(str(exc), status=503) from exc
        except LLMAPIError as exc:
            status = 503 if exc.retryable or exc.kind in ('auth', 'connection', 'rate_limit') else 400
            raise LabelAIError(str(exc), status=status) from exc

        try:
            raw = _parse_json_object(result.text)
            return validate_definition(raw)
        except (ValueError, json.JSONDecodeError, DefinitionError) as exc:
            last_err = str(exc)
            logger.info('label AI structure attempt %s failed: %s', attempt + 1, last_err)

    raise LabelAIError(f'Could not produce a valid definition: {last_err}')


def _image_prompt(*, brief: str, width_in: float, height_in: float, aspect: str) -> str:
    return (
        'Create a monochrome (black and white only) background graphic for a thermal '
        f'label printer. Label size approximately {width_in}" wide by {height_in}" tall '
        f'(aspect {aspect}). High contrast, simple shapes, no fine gray gradients, '
        'no photographic realism, leave clear empty space for overlaid text and barcodes. '
        f'Design brief: {brief}'
    )


def generate_background_image(
    *,
    brief: str,
    width_in: float,
    height_in: float,
) -> dict[str, str]:
    """Make the background picture with the LABEL_IMAGE model; return b64 for client approval (no S3 write)."""
    brief = (brief or '').strip()
    if not brief:
        raise LabelAIError('brief is required.')
    if len(brief) > 2000:
        raise LabelAIError('brief is too long (max 2000 characters).')

    from apps.core.services.image_router import ImageError, generate_image

    model_id = ai_model('LABEL_IMAGE')
    aspect = aspect_ratio_for_inches(float(width_in), float(height_in))
    prompt = _image_prompt(
        brief=brief,
        width_in=float(width_in),
        height_in=float(height_in),
        aspect=aspect,
    )
    # Any image model in Settings > AI (xAI, OpenAI or Google) through the house image router (Dash #195); the
    # call is logged at the model's per-image price.
    try:
        out = generate_image(model_id, prompt, aspect=aspect, log_source='label_ai_image', log_purpose='LABEL_IMAGE',
                             log_detail=f'{aspect} {width_in}x{height_in} in')
    except ImageError as exc:
        raise LabelAIError(str(exc), status=exc.status) from exc
    b64 = out['b64']
    return {
        'image_b64': b64,
        'content_type': out['content_type'],
        'prompt_used': prompt,
        'aspect_ratio': aspect,
        'model': model_id,
    }
