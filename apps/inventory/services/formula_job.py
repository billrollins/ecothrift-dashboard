"""The AI picks the manifest formulas as soon as a manifest is uploaded (intake_updates Phase 5).

It replaces manifest templates. Every way a manifest reaches an order (upload on the order, won → PO from Buying, the
intake test reset) calls ``start``. The upload does not wait: the call runs in a thread inside the web process, the
same way as the AI cleanup job (``ai_cleanup_job.py``).

- **State and result live on the order:** ``PurchaseOrder.ai_formulas`` holds the status (``running`` / ``done`` /
  ``failed``), the formulas (``mappings``: target, formula, reasoning, confidence), the model used, when it finished,
  and the attempts. A new upload starts it again.
- **A failed call is retried** (``ATTEMPTS`` tries, with waits). After that the status is ``failed`` and Preprocessing
  fills in the built-in column-name guesses, so Standardize is never blocked.
- **It survives a restart:** the thread writes a heartbeat. A poll (``status``) that finds a running job with a stale
  heartbeat starts it again in the process that got the poll.
- **Model and effort** come from Settings → AI, purpose **Preprocessing suggest** (``PREPROCESSING_SUGGEST``).
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any

from django.db import close_old_connections, connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.inventory.models import PurchaseOrder

logger = logging.getLogger(__name__)

ATTEMPTS = 3
RETRY_WAITS = (5, 20)
# One model call may take a while; no heartbeat for this long means the thread is gone.
STALE_SECONDS = 240
SAMPLE_ROWS = 10


def _now() -> str:
    return timezone.now().isoformat()


def _fresh_db() -> None:
    """A thread starts with no usable connection of its own. (Tests replace this.)"""
    close_old_connections()


def _release_db() -> None:
    """A thread must give its connection back when it ends. (Tests replace this.)"""
    connections.close_all()


def _spawn(order_id: int, token: str) -> None:
    threading.Thread(target=_run, args=(order_id, token), name=f'ai-formulas-{order_id}', daemon=True).start()


def read(order_id: int) -> dict[str, Any]:
    value = PurchaseOrder.objects.filter(pk=order_id).values_list('ai_formulas', flat=True).first()
    return dict(value) if isinstance(value, dict) else {}


def _write(order_id: int, token: str | None, **changes) -> dict[str, Any] | None:
    """Change the state. With ``token``, only if this run still owns it (a newer upload replaces it)."""
    with transaction.atomic():
        row = PurchaseOrder.objects.select_for_update().filter(pk=order_id).values('ai_formulas').first()
        if row is None:
            return None
        state = dict(row['ai_formulas']) if isinstance(row['ai_formulas'], dict) else {}
        if token is not None and state.get('token') != token:
            return None
        state.update(changes)
        PurchaseOrder.objects.filter(pk=order_id).update(ai_formulas=state)
        return state


def _is_stale(state: dict[str, Any]) -> bool:
    beat = parse_datetime(str(state.get('heartbeat_at') or ''))
    return beat is None or (timezone.now() - beat).total_seconds() > STALE_SECONDS


def start(order_id: int) -> dict[str, Any] | None:
    """Start (or start again) the AI formula job for this order's manifest. Runs after the upload commits."""
    token = uuid.uuid4().hex
    state = {
        'status': 'running', 'token': token, 'mappings': [], 'model': '', 'error': '',
        'attempts': 0, 'restarts': 0, 'started_at': _now(), 'heartbeat_at': _now(), 'finished_at': None,
    }
    PurchaseOrder.objects.filter(pk=order_id).update(ai_formulas=state)
    transaction.on_commit(lambda: _spawn(order_id, token))
    return state


def public(state: dict[str, Any] | None) -> dict[str, Any]:
    out = {k: v for k, v in (state or {}).items() if k != 'token'}
    out.setdefault('status', 'none')
    return out


def status(order: PurchaseOrder, *, heal: bool = True) -> dict[str, Any]:
    """The job's state for the page. A running job whose thread died is started again here."""
    state = read(order.pk)
    if heal and state.get('status') == 'running' and _is_stale(state):
        token = uuid.uuid4().hex
        healed = None
        with transaction.atomic():
            row = PurchaseOrder.objects.select_for_update().filter(pk=order.pk).values('ai_formulas').first()
            current = dict(row['ai_formulas']) if row and isinstance(row['ai_formulas'], dict) else {}
            # Another process may have restarted it while this one waited for the lock.
            if current.get('status') == 'running' and _is_stale(current):
                current.update(token=token, heartbeat_at=_now(), restarts=int(current.get('restarts') or 0) + 1)
                PurchaseOrder.objects.filter(pk=order.pk).update(ai_formulas=current)
                healed = current
            state = current
        if healed is not None:
            logger.warning('formula_job order=%s restarted after a stale heartbeat', order.pk)
            transaction.on_commit(lambda: _spawn(order.pk, token))
    return public(state)


def done_mappings(order: PurchaseOrder) -> list[dict[str, str]]:
    """The AI's formulas as ``{target, formula}`` when the job is done; empty otherwise."""
    state = order.ai_formulas if isinstance(order.ai_formulas, dict) else {}
    if state.get('status') != 'done':
        return []
    return [{'target': m['target'], 'formula': m['formula']} for m in state.get('mappings') or []
            if isinstance(m, dict) and m.get('target') and m.get('formula')]


def _run(order_id: int, token: str) -> None:
    _fresh_db()
    try:
        last_error = ''
        for attempt in range(1, ATTEMPTS + 1):
            if _write(order_id, token, heartbeat_at=_now(), attempts=attempt) is None:
                return  # a newer upload took over
            try:
                order = PurchaseOrder.objects.get(pk=order_id)
                mappings, model_used = suggest(order)
            except Exception as exc:  # noqa: BLE001 - every failure is retried, then reported
                last_error = str(exc)[:500]
                logger.warning('formula_job order=%s attempt %s failed: %s', order_id, attempt, last_error)
                if attempt < ATTEMPTS:
                    time.sleep(RETRY_WAITS[min(attempt - 1, len(RETRY_WAITS) - 1)])
                continue
            _write(order_id, token, status='done', mappings=mappings, model=model_used, error='',
                   finished_at=_now(), heartbeat_at=_now())
            return
        _write(order_id, token, status='failed', error=last_error or 'The AI did not answer.',
               finished_at=_now(), heartbeat_at=_now())
    finally:
        _release_db()


def suggest(order: PurchaseOrder) -> tuple[list[dict[str, Any]], str]:
    """One AI call: the manifest's headers and first rows in, a formula per standard field out."""
    from apps.core.ai_config import ai_model
    from apps.core.services.llm_router import llm_chat_tool_input, suggest_mappings_tools
    from apps.inventory.manifest_standard_fields import manifest_field_metadata_payload

    preview = order.manifest_preview or {}
    headers = list(preview.get('headers') or [])
    if not headers:
        raise ValueError('The manifest has no headers; upload it again.')
    samples = [r.get('raw') for r in (preview.get('rows') or [])[:SAMPLE_ROWS]
               if isinstance(r, dict) and isinstance(r.get('raw'), dict)]

    flat = [f"- {c['key']}: {c['label']} ({'required' if c['required'] else 'optional'})" for c in manifest_field_metadata_payload()['flat']]
    buckets = []
    for bid, b in manifest_field_metadata_payload()['buckets'].items():
        keys = ', '.join(b['suggested_keys']) if b['suggested_keys'] else '(none listed - any ^[a-z][a-z0-9_]*$ sub-key)'
        buckets.append(f'  - {bid}.<subkey>: {b["label"]}; suggested_keys (hints only): {keys}')
    system = (
        'You are an assistant for a thrift store that processes liquidation manifests. '
        'Given CSV column headers and sample rows, suggest formula expressions to map '
        'raw CSV columns into standardized fields.\n\n'
        'Targets are either FLAT keys (see list below) or DOTTED `bucket.subkey` JSON buckets.\n'
        'The four bucket prefixes are fixed: identifiers, taxonomy, specifications, tracking. '
        'Sub-key strings must match the regex ^[a-z][a-z0-9_]*$. suggested_keys lists are autocomplete '
        'hints only, not a whitelist; prefer them when the column obviously matches '
        '(e.g. UPC column → identifiers.upc), otherwise emit a sensible custom sub-key.\n'
        + '\n'.join(buckets)
        + '\n\nFlat fields:\n' + '\n'.join(flat)
        + '\n\nFormula syntax:\n'
        '- Column references: [COLUMN_NAME] (exact header name from the CSV)\n'
        '- Functions: UPPER(expr), LOWER(expr), TITLE(expr), TRIM(expr), '
        'REPLACE(expr, "find", "replace"), CONCAT(expr, ...), LEFT(expr, n), RIGHT(expr, n)\n'
        '- String concatenation: expr + " " + expr\n'
        '- String literals: "quoted text"\n\n'
        'Field-specific hints:\n'
        '- title: the product name a shopper would read; never a SKU or a category alone.\n'
        '- quantity: units on the line (a "Qty" or "Units" column).\n'
        '- unit_retail (per-unit MSRP): prefer a vendor-stated **unit** retail column such as '
        '"Unit Retail" or "MSRP". Avoid extended line totals (e.g. "Ext. Retail") when a unit column exists.\n'
        '- identifiers.upc: map barcode / UPC columns here, not a separate flat upc.\n'
        '- taxonomy.category: map department/category text here.\n\n'
        'Omit targets you cannot infer. Use TRIM() liberally. '
        'You MUST respond only by calling the suggest_mappings tool with valid JSON input.'
    )
    user = '\n'.join([f'CSV Headers: {json.dumps(headers)}']
                     + ([f'Sample rows (first {len(samples)}):'] if samples else [])
                     + [json.dumps(s) for s in samples])
    tool_input, model_used = llm_chat_tool_input(
        purpose='PREPROCESSING_SUGGEST',
        model_override=ai_model('PREPROCESSING_SUGGEST'),
        system=system,
        user=user,
        tool_name='suggest_mappings',
        tools=suggest_mappings_tools(),
        temperature=0.0,
        max_tokens=4096,
        log_source='ai_formula_job',
        log_detail=f'order={order.pk} formulas on upload',
    )
    out = []
    for s in tool_input.get('suggestions') or []:
        if isinstance(s, dict) and s.get('target') and s.get('formula'):
            out.append({k: s[k] for k in ('target', 'formula', 'reasoning', 'confidence') if s.get(k)})
    if not out:
        raise ValueError('The AI returned no formulas.')
    return out, model_used
