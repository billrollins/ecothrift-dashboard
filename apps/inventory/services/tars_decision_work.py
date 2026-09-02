"""Validation and authoritative economics for TARS Phase 1 decision work."""

from __future__ import annotations

import copy
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from django.utils import timezone

from apps.inventory.services.tars_purchase import parts_cost_for_grade


SCHEMA_VERSION = 1
CATALOG_VERSION = 'phase1-mvp-v1'
EFFECTIVE_LABOR_RATE = Decimal('19.80')

TEST_RESULTS = {'pass', 'fail', 'unknown', 'not_applicable', 'skipped'}
TESTED_STATUSES = {'not_tested', 'partially_tested', 'tested'}
STOP_OUT_RESPONSES = {'unanswered', 'clear', 'blocked'}
SALE_STATES = {'tested', 'untested', 'as_is', 'broken', 'parts_only', 'salvage'}
ACTIONS = {'test', 'assemble', 'repair', 'salvage'}

MAX_TESTS = 30
MAX_UNKNOWNS = 30
MAX_OUTCOMES = 20
MAX_TEXT = 2_000
MAX_SHORT_TEXT = 300
MAX_ID = 80

_SAFE_ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$')

# Phase 1 stays deliberately universal. Category-specific catalogs belong in Phase 2.
UNIVERSAL_TEST_CATALOG: dict[str, dict[str, str]] = {
    'visual_identity_condition': {
        'name': 'Identity and visible condition',
        'guidance': 'Confirm identity and record visible decision-changing condition.',
    },
    'basic_function': {
        'name': 'Basic function',
        'guidance': 'Run the shortest practical check when it can change the path.',
    },
    'included_components': {
        'name': 'Included components',
        'guidance': 'Record missing parts only when they change grade, disclosure, or next action.',
    },
    'elec_turns_on': {
        'name': 'Turns on',
        'guidance': 'Has power path, can test, and powers on.',
    },
    'elec_visual_inspection': {
        'name': 'Passes visual inspection',
        'guidance': 'Cosmetic damage, parts damage, completeness, accessories, box, manual.',
    },
    'elec_primary_function': {
        'name': 'Verify primary function',
        'guidance': 'Primary use case works enough to support the sale path.',
    },
    'universal_completeness': {
        'name': 'Completeness check',
        'guidance': 'Required parts / accessories present for the intended grade.',
    },
}

# Mirror the Phase 1 frontend catalog so client-supplied economics cannot
# reintroduce a path blocked by a mandatory stop-out.
MANDATORY_STOP_OUT_CATALOG: dict[str, dict[str, Any]] = {
    'legal_prohibited_sale': {
        'name': 'Legal / prohibited sale',
        'blockedActions': {'test', 'assemble', 'repair'},
        'blockedSaleStates': {'tested', 'untested', 'as_is', 'broken', 'parts_only'},
    },
    'handling_stop': {
        'name': 'Handling stop',
        'blocksAllSelections': True,
    },
    'truthful_disclosure': {
        'name': 'Truthful disclosure',
        'blockedSaleStates': {'tested', 'untested', 'as_is', 'broken', 'parts_only'},
    },
}

MINIMUM_HANDLING_MINUTES: dict[str, Decimal] = {
    'untested': Decimal('5'),
    'as_is': Decimal('5'),
    'salvage': Decimal('3'),
}


class DecisionWorkValidationError(ValueError):
    """Invalid Phase 1 decision-work input."""


def decision_catalog() -> dict[str, Any]:
    return {
        'schemaVersion': SCHEMA_VERSION,
        'catalogVersion': CATALOG_VERSION,
        'tests': [
            {'id': test_id, **copy.deepcopy(config)}
            for test_id, config in UNIVERSAL_TEST_CATALOG.items()
        ],
        'stopOuts': [
            {'id': stop_id, 'name': config['name']}
            for stop_id, config in MANDATORY_STOP_OUT_CATALOG.items()
        ],
        'effectiveLaborRate': float(EFFECTIVE_LABOR_RATE),
        'minimumHandlingMinutes': {
            key: float(value) for key, value in MINIMUM_HANDLING_MINUTES.items()
        },
    }


def _text(value: Any, *, field: str, limit: int = MAX_TEXT, required: bool = False) -> str:
    text = str(value or '').strip()
    if required and not text:
        raise DecisionWorkValidationError(f'{field} is required.')
    if len(text) > limit:
        raise DecisionWorkValidationError(f'{field} exceeds {limit} characters.')
    return text


def _identifier(value: Any, *, field: str, required: bool = True) -> str:
    identifier = _text(value, field=field, limit=MAX_ID, required=required)
    if identifier and not _SAFE_ID.fullmatch(identifier):
        raise DecisionWorkValidationError(
            f'{field} may contain only letters, numbers, dot, underscore, colon, and hyphen.',
        )
    return identifier


def _decimal(value: Any, *, field: str, minimum: Decimal = Decimal('0')) -> Decimal:
    try:
        amount = Decimal(str(value if value not in (None, '') else 0))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise DecisionWorkValidationError(f'{field} must be a number.') from exc
    if not amount.is_finite() or amount < minimum:
        raise DecisionWorkValidationError(f'{field} must be at least {minimum}.')
    return amount


def _money(value: Decimal) -> float:
    return float(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def _number(value: Decimal, places: str = '0.0001') -> float:
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def _user_id(user) -> int | None:
    if user is None or not getattr(user, 'is_authenticated', False):
        return None
    return getattr(user, 'pk', None)


def _normalize_test(entry: Any, index: int) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise DecisionWorkValidationError(f'decisionWork.tests[{index}] must be an object.')

    catalog_id = _identifier(
        entry.get('catalogTestId'),
        field=f'decisionWork.tests[{index}].catalogTestId',
        required=False,
    )
    item_id = _identifier(
        entry.get('id'),
        field=f'decisionWork.tests[{index}].id',
    )
    if catalog_id and catalog_id not in UNIVERSAL_TEST_CATALOG:
        raise DecisionWorkValidationError(f'Unknown catalog test id: {catalog_id}.')

    name = _text(
        entry.get('name') or UNIVERSAL_TEST_CATALOG.get(catalog_id, {}).get('name'),
        field=f'decisionWork.tests[{index}].name',
        limit=MAX_SHORT_TEXT,
        required=True,
    )
    raw_result = entry.get('result')
    result = None
    if raw_result not in (None, ''):
        result = _text(
            raw_result,
            field=f'decisionWork.tests[{index}].result',
            limit=32,
        ).lower()
    if result is not None and result not in TEST_RESULTS:
        raise DecisionWorkValidationError(
            f'decisionWork.tests[{index}].result must be one of {sorted(TEST_RESULTS)}.',
        )
    return {
        'id': item_id,
        'catalogTestId': catalog_id or None,
        'packId': _identifier(
            entry.get('packId'),
            field=f'decisionWork.tests[{index}].packId',
            required=False,
        ) or None,
        'name': name,
        'prompt': _text(
            entry.get('prompt'),
            field=f'decisionWork.tests[{index}].prompt',
        ),
        'relevant': bool(entry.get('relevant', False)),
        'result': result,
        'evidence': _text(
            entry.get('evidence'),
            field=f'decisionWork.tests[{index}].evidence',
        ),
        'checklist': (
            entry.get('checklist')
            if isinstance(entry.get('checklist'), dict)
            else {}
        ),
        'createdAt': _text(
            entry.get('createdAt'),
            field=f'decisionWork.tests[{index}].createdAt',
            limit=80,
        ),
        'updatedAt': _text(
            entry.get('updatedAt'),
            field=f'decisionWork.tests[{index}].updatedAt',
            limit=80,
        ),
    }


def _normalize_unknown(entry: Any, index: int) -> dict[str, Any]:
    if isinstance(entry, str):
        return {
            'id': f'unknown-{index + 1}',
            'description': _text(entry, field=f'decisionWork.unknowns[{index}]', required=True),
            'decisionImpact': '',
            'resolved': False,
            'resolution': '',
            'createdAt': '',
            'updatedAt': '',
        }
    if not isinstance(entry, dict):
        raise DecisionWorkValidationError(f'decisionWork.unknowns[{index}] must be an object.')
    return {
        'id': _identifier(
            entry.get('id') or f'unknown-{index + 1}',
            field=f'decisionWork.unknowns[{index}].id',
        ),
        'description': _text(
            entry.get('description'),
            field=f'decisionWork.unknowns[{index}].description',
        ),
        'decisionImpact': _text(
            entry.get('decisionImpact'),
            field=f'decisionWork.unknowns[{index}].decisionImpact',
        ),
        'resolved': bool(entry.get('resolved', False)),
        'resolution': _text(
            entry.get('resolution'),
            field=f'decisionWork.unknowns[{index}].resolution',
        ),
        'createdAt': _text(
            entry.get('createdAt'),
            field=f'decisionWork.unknowns[{index}].createdAt',
            limit=80,
        ),
        'updatedAt': _text(
            entry.get('updatedAt'),
            field=f'decisionWork.unknowns[{index}].updatedAt',
            limit=80,
        ),
    }


def _normalize_stop_out(raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    responses_raw = raw.get('responses') or []
    if not isinstance(responses_raw, list):
        raise DecisionWorkValidationError('decisionWork.stopOut.responses must be a list.')
    if len(responses_raw) > len(MANDATORY_STOP_OUT_CATALOG):
        raise DecisionWorkValidationError('decisionWork contains too many stop-out responses.')
    responses: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, entry in enumerate(responses_raw):
        if not isinstance(entry, dict):
            raise DecisionWorkValidationError(
                f'decisionWork.stopOut.responses[{index}] must be an object.',
            )
        stop_id = _identifier(
            entry.get('stopOutId'),
            field=f'decisionWork.stopOut.responses[{index}].stopOutId',
        )
        if stop_id not in MANDATORY_STOP_OUT_CATALOG:
            raise DecisionWorkValidationError(f'Unknown mandatory stop-out id: {stop_id}.')
        if stop_id in seen:
            raise DecisionWorkValidationError('Mandatory stop-out ids must be unique.')
        seen.add(stop_id)
        normalized = _text(
            entry.get('response') or 'unanswered',
            field=f'decisionWork.stopOut.responses[{index}].response',
            limit=32,
        ).lower()
        if normalized not in STOP_OUT_RESPONSES:
            raise DecisionWorkValidationError(
                f'Stop-out response must be one of {sorted(STOP_OUT_RESPONSES)}.',
            )
        responses.append({
            'stopOutId': stop_id,
            'response': normalized,
            'notes': _text(
                entry.get('notes'),
                field=f'decisionWork.stopOut.responses[{index}].notes',
            ),
            'respondedAt': _text(
                entry.get('respondedAt'),
                field=f'decisionWork.stopOut.responses[{index}].respondedAt',
                limit=80,
            ) or None,
        })

    triggered = sorted(
        entry['stopOutId'] for entry in responses if entry['response'] == 'blocked'
    )
    return {
        'responses': responses,
        'blocked': bool(triggered),
        'blockedStopOutIds': triggered,
    }


def _normalize_condition(raw: Any, decision: dict[str, Any]) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    tested_status = _text(
        raw.get('testedStatus') or decision.get('testedStatus'),
        field='decisionWork.condition.testedStatus',
        limit=32,
    ).lower()
    if tested_status == 'untested':
        tested_status = 'not_tested'
    if tested_status and tested_status not in TESTED_STATUSES:
        raise DecisionWorkValidationError(
            f'decisionWork.condition.testedStatus must be one of {sorted(TESTED_STATUSES)}.',
        )
    completeness = _text(
        raw.get('completeness') or decision.get('completeness'),
        field='decisionWork.condition.completeness',
        limit=64,
    ).lower()
    if completeness and completeness not in {'unknown', 'complete', 'incomplete', 'not_applicable'}:
        raise DecisionWorkValidationError(
            'decisionWork.condition.completeness must be unknown, complete, incomplete, or not_applicable.',
        )
    evidence = _text(
        raw.get('evidence')
        or raw.get('conditionEvidence')
        or decision.get('conditionEvidence'),
        field='decisionWork.condition.evidence',
    )
    return {
        'currentGrade': _text(
            raw.get('currentGrade'),
            field='decisionWork.condition.currentGrade',
            limit=64,
        ) or None,
        'condition': _text(
            raw.get('condition'),
            field='decisionWork.condition.condition',
            limit=MAX_SHORT_TEXT,
        ),
        'testedStatus': tested_status,
        'completeness': completeness or 'unknown',
        'evidence': evidence,
    }


def _order_total(session: dict[str, Any], order: dict[str, Any]) -> Decimal:
    parts = {
        str(part.get('id')): part
        for part in (session.get('parts') or [])
        if isinstance(part, dict) and part.get('id') not in (None, '')
    }
    overrides = order.get('partQtyOverrides')
    overrides = overrides if isinstance(overrides, dict) else {}
    subtotal = Decimal('0')
    for part_id in order.get('partIds') or []:
        part = parts.get(str(part_id))
        if not part:
            continue
        actual = _decimal(part.get('unitPriceActual'), field='part.unitPriceActual')
        estimate = _decimal(part.get('unitPriceEstimate'), field='part.unitPriceEstimate')
        unit = actual if actual > 0 else estimate
        override = _decimal(overrides.get(part_id), field='order.partQtyOverrides')
        qty = override if override > 0 else _decimal(part.get('qty') or 1, field='part.qty')
        subtotal += unit * max(qty, Decimal('1'))
    return subtotal + sum(
        _decimal(order.get(key), field=f'order.{key}')
        for key in ('shipping', 'tax', 'fees')
    )


def _attached_order_cost(session: dict[str, Any], order_ids: list[str]) -> Decimal:
    selected = set(order_ids)
    total = Decimal('0')
    seen: set[str] = set()
    for order in session.get('orders') or []:
        if not isinstance(order, dict):
            continue
        order_id = str(order.get('id') or '')
        if order_id not in selected or order_id in seen:
            continue
        seen.add(order_id)
        total += _order_total(session, order)
    return total


def _outcome_block_reason(
    stop_out: dict[str, Any],
    *,
    action: str,
    sale_state: str,
) -> str:
    responses = {
        entry.get('stopOutId'): entry.get('response')
        for entry in stop_out.get('responses') or []
        if isinstance(entry, dict)
    }
    for stop_id, config in MANDATORY_STOP_OUT_CATALOG.items():
        response = responses.get(stop_id, 'clear')
        # Soft stop-outs: unanswered counts as clear.
        if response in ('unanswered', 'clear', None, ''):
            continue
        if response != 'blocked':
            continue
        if (
            config.get('blocksAllSelections')
            or action in config.get('blockedActions', set())
            or sale_state in config.get('blockedSaleStates', set())
        ):
            return f"{config['name']} blocks this path."
    return ''


def _normalize_outcome(
    entry: Any,
    index: int,
    *,
    job,
    session: dict[str, Any],
    stop_out: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise DecisionWorkValidationError(f'decisionWork.outcomes[{index}] must be an object.')

    grade = _text(
        entry.get('grade'),
        field=f'decisionWork.outcomes[{index}].grade',
        limit=64,
        required=True,
    )
    grade_values = job.grade_values if isinstance(job.grade_values, dict) else {}
    if grade not in grade_values:
        raise DecisionWorkValidationError(f'Outcome grade {grade!r} is not in job.grade_values.')
    grade_value = _decimal(grade_values.get(grade), field=f'job.grade_values.{grade}')

    sale_state = _text(
        entry.get('saleState') or entry.get('sale_state') or 'tested',
        field=f'decisionWork.outcomes[{index}].saleState',
        limit=64,
        required=True,
    ).lower()
    if sale_state not in SALE_STATES:
        raise DecisionWorkValidationError(
            f'decisionWork.outcomes[{index}].saleState must be one of {sorted(SALE_STATES)}.',
        )
    action = _text(
        entry.get('action'),
        field=f'decisionWork.outcomes[{index}].action',
        limit=64,
        required=True,
    ).lower()
    if action not in ACTIONS:
        raise DecisionWorkValidationError(
            f'decisionWork.outcomes[{index}].action must be one of {sorted(ACTIONS)}.',
        )
    outcome_id = _identifier(
        entry.get('id') or f'{grade}:{sale_state}',
        field=f'decisionWork.outcomes[{index}].id',
    )

    plan = (session.get('gradePlans') or {}).get(grade) or {}
    if not isinstance(plan, dict):
        plan = {}
    raw_minutes = entry.get('estimatedMinutes')
    if raw_minutes in (None, ''):
        raw_minutes = _decimal(plan.get('estimateHours'), field=f'gradePlans.{grade}.estimateHours') * 60
    estimated_minutes = _decimal(
        raw_minutes,
        field=f'decisionWork.outcomes[{index}].estimatedMinutes',
    )
    minimum = MINIMUM_HANDLING_MINUTES.get(sale_state, Decimal('1'))
    effective_minutes = max(estimated_minutes, minimum)

    raw_order_ids = plan.get('orderIds') or []
    if not isinstance(raw_order_ids, list):
        raise DecisionWorkValidationError(
            f'decisionWork.outcomes[{index}].orderIds must be a list.',
        )
    order_ids = [
        _identifier(value, field=f'decisionWork.outcomes[{index}].orderIds')
        for value in raw_order_ids[:50]
    ]
    if len(raw_order_ids) > 50:
        raise DecisionWorkValidationError('An outcome may attach at most 50 orders.')

    from apps.inventory.services.restoration_parts import committed_parts_cost_for_grade

    expected_parts_cost = committed_parts_cost_for_grade(job, grade)
    if expected_parts_cost <= Decimal('0'):
        expected_parts_cost = parts_cost_for_grade(session, grade)
    labor_cost = EFFECTIVE_LABOR_RATE * effective_minutes / Decimal('60')
    contribution = grade_value - expected_parts_cost - labor_cost
    score = contribution / effective_minutes

    viable = bool(entry.get('viable', True))
    block_reason = _outcome_block_reason(
        stop_out,
        action=action,
        sale_state=sale_state,
    )

    economics = {
        'processorValue': _money(grade_value),
        'partsAndOrdersCost': _money(expected_parts_cost),
        'laborCost': _money(labor_cost),
        'estimatedMinutes': _number(estimated_minutes, '0.01'),
        'scoredMinutes': _number(effective_minutes, '0.01'),
        'contribution': _money(contribution),
        'contributionPerLaborMinute': _number(score),
        'viable': viable,
        'blocked': bool(block_reason),
        'exclusionReason': (
            _text(
                entry.get('nonviableReason'),
                field=f'decisionWork.outcomes[{index}].nonviableReason',
            )
            if not viable
            else block_reason
        ),
    }
    return {
        'id': outcome_id,
        'grade': grade,
        'saleState': sale_state,
        'action': action,
        'viable': viable,
        'nonviableReason': _text(
            entry.get('nonviableReason'),
            field=f'decisionWork.outcomes[{index}].nonviableReason',
        ),
        'estimatedMinutes': _number(estimated_minutes, '0.01'),
        'estimatedAt': _text(
            entry.get('estimatedAt'),
            field=f'decisionWork.outcomes[{index}].estimatedAt',
            limit=80,
        ) or None,
        'estimatedById': entry.get('estimatedById') if isinstance(entry.get('estimatedById'), int) else None,
        '_economics': economics,
    }


def _normalize_selection(raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    grade = _text(raw.get('grade'), field='decisionWork.selection.grade', limit=64)
    action = _text(raw.get('action'), field='decisionWork.selection.action', limit=64).lower()
    if action and action not in ACTIONS:
        raise DecisionWorkValidationError(
            f'decisionWork.selection.action must be one of {sorted(ACTIONS)}.',
        )
    sale_state = _text(
        raw.get('saleState') or raw.get('sale_state'),
        field='decisionWork.selection.saleState',
        limit=64,
    ).lower()
    if sale_state and sale_state not in SALE_STATES:
        raise DecisionWorkValidationError(
            f'decisionWork.selection.saleState must be one of {sorted(SALE_STATES)}.',
        )
    selected_by = raw.get('selectedById')
    return {
        'outcomeId': _identifier(
            raw.get('outcomeId'),
            field='decisionWork.selection.outcomeId',
            required=False,
        ) or None,
        'grade': grade or None,
        'action': action or None,
        'saleState': sale_state or None,
        'reason': _text(raw.get('reason'), field='decisionWork.selection.reason'),
        'overrideReason': _text(
            raw.get('overrideReason'),
            field='decisionWork.selection.overrideReason',
        ),
        'selectedAt': _text(
            raw.get('selectedAt'),
            field='decisionWork.selection.selectedAt',
            limit=80,
        ) or None,
        'selectedById': selected_by if isinstance(selected_by, int) else None,
    }


def _normalize_override(raw: Any, *, user, now) -> dict[str, Any]:
    if isinstance(raw, str):
        raw = {'reason': raw}
    raw = raw if isinstance(raw, dict) else {}
    reason = _text(raw.get('reason'), field='decisionWork.override.reason')
    if not reason:
        return {}
    user_id = _user_id(user)
    if user_id is None:
        # Existing stamped identity remains valid for imported/recovery sessions.
        user_id = raw.get('recordedById') or raw.get('updatedById') or raw.get('byId')
    if user_id in (None, ''):
        raise DecisionWorkValidationError('decisionWork override requires updater identity.')
    return {
        'reason': reason,
        'recordedAt': now.isoformat(),
        'recordedById': int(user_id),
    }


def decision_work_progress(_decision: dict[str, Any]) -> dict[str, Any]:
    """Progress is informational only - it never gates finish."""

    return {
        'missing': [],
        'complete': True,
        'completedCount': 0,
        'requiredCount': 0,
    }


def normalize_decision_work(
    raw: Any,
    *,
    job,
    session: dict[str, Any],
    user=None,
    now=None,
) -> dict[str, Any]:
    """Validate and normalize one nested ``work_session.decisionWork`` object."""

    if not isinstance(raw, dict):
        raise DecisionWorkValidationError('decisionWork must be an object.')
    now = now or timezone.now()
    schema_version = raw.get('schemaVersion', SCHEMA_VERSION)
    if schema_version != SCHEMA_VERSION:
        raise DecisionWorkValidationError(f'Unsupported decisionWork schemaVersion: {schema_version}.')
    catalog_version = raw.get('catalogVersion', CATALOG_VERSION)
    if catalog_version != CATALOG_VERSION:
        raise DecisionWorkValidationError(f'Unsupported decisionWork catalogVersion: {catalog_version}.')

    tests_raw = raw.get('tests') or []
    if not isinstance(tests_raw, list):
        raise DecisionWorkValidationError('decisionWork.tests must be a list.')
    if len(tests_raw) > MAX_TESTS:
        raise DecisionWorkValidationError(f'decisionWork supports at most {MAX_TESTS} tests.')
    tests = [_normalize_test(entry, index) for index, entry in enumerate(tests_raw)]
    if len({entry['id'] for entry in tests}) != len(tests):
        raise DecisionWorkValidationError('decisionWork test ids must be unique.')

    unknowns_raw = raw.get('unknowns') or []
    if not isinstance(unknowns_raw, list):
        raise DecisionWorkValidationError('decisionWork.unknowns must be a list.')
    if len(unknowns_raw) > MAX_UNKNOWNS:
        raise DecisionWorkValidationError(f'decisionWork supports at most {MAX_UNKNOWNS} unknowns.')
    unknowns = [_normalize_unknown(entry, index) for index, entry in enumerate(unknowns_raw)]
    if len({entry['id'] for entry in unknowns}) != len(unknowns):
        raise DecisionWorkValidationError('decisionWork unknown ids must be unique.')

    stop_out = _normalize_stop_out(raw.get('stopOut'))
    condition = _normalize_condition(raw.get('condition'), raw)
    outcomes_raw = raw.get('outcomes') or []
    if not isinstance(outcomes_raw, list):
        raise DecisionWorkValidationError('decisionWork.outcomes must be a list.')
    if len(outcomes_raw) > MAX_OUTCOMES:
        raise DecisionWorkValidationError(
            f'decisionWork supports at most {MAX_OUTCOMES} viable outcomes.',
        )
    outcomes = [
        _normalize_outcome(
            entry,
            index,
            job=job,
            session=session,
            stop_out=stop_out,
        )
        for index, entry in enumerate(outcomes_raw)
    ]
    if len({entry['id'] for entry in outcomes}) != len(outcomes):
        raise DecisionWorkValidationError('decisionWork outcome ids must be unique.')

    viable_ranked = sorted(
        (
            entry
            for entry in outcomes
            if entry['viable'] and not entry['_economics']['blocked']
        ),
        key=lambda entry: (
            entry['_economics']['contributionPerLaborMinute'],
            entry['_economics']['contribution'],
        ),
        reverse=True,
    )
    recommendation = {
        'outcomeId': None,
        'grade': None,
        'saleState': None,
        'action': None,
        'contributionPerLaborMinute': None,
        'reason': 'No viable, unblocked path is available.',
        'generatedAt': now.isoformat(),
    }
    if viable_ranked:
        best = viable_ranked[0]
        recommendation = {
            'outcomeId': best['id'],
            'grade': best['grade'],
            'saleState': best['saleState'],
            'action': best['action'],
            'contributionPerLaborMinute': best['_economics']['contributionPerLaborMinute'],
            'reason': (
                'Highest restoration contribution per labor minute '
                f"({best['_economics']['contribution']:.2f} contribution over "
                f"{best['_economics']['scoredMinutes']:.2f} minutes)."
            ),
            'generatedAt': now.isoformat(),
        }

    selection = _normalize_selection(raw.get('selection'))
    override = _normalize_override(selection.get('overrideReason'), user=user, now=now)
    if override:
        selection['overrideRecordedAt'] = override['recordedAt']
        selection['overrideRecordedById'] = override['recordedById']
    user_id = _user_id(user)
    previous_timestamps = raw.get('timestamps') if isinstance(raw.get('timestamps'), dict) else {}
    created_at = previous_timestamps.get('createdAt') or now.isoformat()
    handoff_raw = raw.get('handoff') if isinstance(raw.get('handoff'), dict) else {}
    for test in tests:
        test['createdAt'] = test['createdAt'] or now.isoformat()
        test['updatedAt'] = test['updatedAt'] or now.isoformat()
    for unknown in unknowns:
        unknown['createdAt'] = unknown['createdAt'] or now.isoformat()
        unknown['updatedAt'] = unknown['updatedAt'] or now.isoformat()

    normalized = {
        'schemaVersion': SCHEMA_VERSION,
        'catalogVersion': CATALOG_VERSION,
        'handoff': {
            'acknowledged': bool(handoff_raw.get('acknowledged', False)),
            'acknowledgedAt': _text(
                handoff_raw.get('acknowledgedAt'),
                field='decisionWork.handoff.acknowledgedAt',
                limit=80,
            ) or None,
            'contextSummary': _text(
                handoff_raw.get('contextSummary'),
                field='decisionWork.handoff.contextSummary',
            ),
            'correctionNotes': _text(
                handoff_raw.get('correctionNotes'),
                field='decisionWork.handoff.correctionNotes',
            ),
        },
        'stopOut': stop_out,
        'condition': condition,
        'tests': tests,
        'unknowns': unknowns,
        'outcomes': [
            {key: value for key, value in entry.items() if key != '_economics'}
            for entry in outcomes
        ],
        'economics': {
            'effectiveLaborRate': float(EFFECTIVE_LABOR_RATE),
            'candidates': [
                {
                    'outcomeId': entry['id'],
                    'grade': entry['grade'],
                    'saleState': entry['saleState'],
                    **entry['_economics'],
                }
                for entry in outcomes
            ],
            'evaluatedAt': now.isoformat(),
        },
        'recommendation': recommendation,
        'selection': selection,
        'timestamps': {
            'createdAt': created_at,
            'updatedAt': now.isoformat(),
            'completedAt': previous_timestamps.get('completedAt'),
            'updatedById': user_id or previous_timestamps.get('updatedById'),
        },
    }
    normalized['progress'] = decision_work_progress(normalized)
    return normalized


def strip_bench_plan_odds(session: dict[str, Any]) -> bool:
    """Keep only parts and minutes on each bench-plan estimate. Returns True if anything changed."""

    plan = session.get('benchPlan')
    if not isinstance(plan, dict):
        return False
    estimates = plan.get('estimates')
    if not isinstance(estimates, dict):
        return False
    cleaned: dict[str, Any] = {}
    changed = False
    for grade, estimate in estimates.items():
        if not isinstance(estimate, dict):
            changed = True
            continue
        kept: dict[str, Any] = {}
        parts = estimate.get('parts')
        minutes = estimate.get('minutes')
        if isinstance(parts, (int, float)) and not isinstance(parts, bool):
            kept['parts'] = parts
        if isinstance(minutes, (int, float)) and not isinstance(minutes, bool):
            kept['minutes'] = minutes
        cleaned[str(grade)] = kept
        if estimate != kept:
            changed = True
    if changed:
        plan['estimates'] = cleaned
    return changed


def normalize_work_session(
    raw_session: Any,
    *,
    job,
    user=None,
) -> dict[str, Any]:
    """Preserve existing session keys; strip bench-plan odds; normalize ``decisionWork``."""

    if not isinstance(raw_session, dict):
        raise DecisionWorkValidationError('work_session must be an object.')
    session = copy.deepcopy(raw_session)
    strip_bench_plan_odds(session)
    if 'decisionWork' not in session:
        return session
    session['decisionWork'] = normalize_decision_work(
        session['decisionWork'],
        job=job,
        session=session,
        user=user,
    )
    selection = session['decisionWork'].get('selection') or {}
    selected_grade = str(selection.get('grade') or '').strip()
    if selected_grade:
        session['selectedGrade'] = selected_grade
    return session

