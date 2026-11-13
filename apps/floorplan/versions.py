"""Floor plan versions (#130, Bill 2026-11-13).

The owner makes a plan Current and can unset it again; each stretch of being Current is a ``FloorPlanCurrentPeriod``.
Replacing the Current plan never moves pins: the old plan keeps its pins as a past version, and the new plan gets a
copy. When the two plans differ in size the owner lines the old pins up first (scale + move), and the copies are
placed through that transform.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from .models import FloorPlan, FloorPlanCurrentPeriod, MapPin

# Same room a pin may have outside the drawn plan as MapPinSerializer allows (a sign on the outside wall).
PIN_MARGIN = 240
# Sizes closer than this (inches) count as the same size: no alignment step.
SAME_SIZE_TOLERANCE = 0.5


class AlignRequired(Exception):
    """The new plan's size differs from the plan the pins come from, and no alignment was given."""


class BadTransform(ValueError):
    pass


@dataclass(frozen=True)
class Transform:
    scale: float = 1.0
    dx: float = 0.0
    dy: float = 0.0

    def apply(self, x: float, y: float) -> tuple[float, float]:
        return x * self.scale + self.dx, y * self.scale + self.dy

    def as_dict(self) -> dict:
        return {'scale': self.scale, 'dx': self.dx, 'dy': self.dy}

    @property
    def is_identity(self) -> bool:
        return self.scale == 1 and self.dx == 0 and self.dy == 0


def parse_transform(raw) -> Transform | None:
    """``{scale, dx, dy}`` from a request body, or None when not given."""
    if raw in (None, '', {}):
        return None
    if not isinstance(raw, dict):
        raise BadTransform('The alignment must be {scale, dx, dy}.')
    try:
        scale = float(raw.get('scale', 1))
        dx = float(raw.get('dx', 0))
        dy = float(raw.get('dy', 0))
    except (TypeError, ValueError):
        raise BadTransform('Scale and move must be numbers.')
    if not all(math.isfinite(v) for v in (scale, dx, dy)):
        raise BadTransform('Scale and move must be numbers.')
    if not (0.01 <= scale <= 100):
        raise BadTransform('Scale must be between 1% and 10,000%.')
    if abs(dx) > 100_000 or abs(dy) > 100_000:
        raise BadTransform('That move is off the map.')
    return Transform(scale, dx, dy)


def plan_size(plan: FloorPlan) -> tuple[float, float]:
    settings_ = (plan.data or {}).get('settings') or {}
    return float(settings_.get('planWidth') or 0), float(settings_.get('planHeight') or 0)


def same_size(a: FloorPlan, b: FloorPlan) -> bool:
    (aw, ah), (bw, bh) = plan_size(a), plan_size(b)
    return abs(aw - bw) <= SAME_SIZE_TOLERANCE and abs(ah - bh) <= SAME_SIZE_TOLERANCE


def pin_source(plan: FloorPlan) -> FloorPlan | None:
    """The plan whose pins carry over when ``plan`` becomes Current: the location's Current plan, else the plan that
    was Current most recently (the owner may have unset it first)."""
    current = (
        FloorPlan.objects.filter(location_id=plan.location_id, is_current=True, is_active=True)
        .exclude(pk=plan.pk).first()
    )
    if current:
        return current
    last = (
        FloorPlanCurrentPeriod.objects.filter(plan__location_id=plan.location_id, plan__is_active=True)
        .exclude(plan_id=plan.pk).select_related('plan').order_by('-started_at', '-id').first()
    )
    return last.plan if last else None


def preview(plan: FloorPlan) -> dict:
    """What Make current would do, for the owner's dialog."""
    source = pin_source(plan)
    own_pins = plan.pins.count()
    width, height = plan_size(plan)
    source_pins = source.pins.count() if source else 0
    copies = bool(source and own_pins == 0 and source_pins)
    sized_alike = bool(source and same_size(plan, source))
    return {
        'already_current': plan.is_current,
        'width': width,
        'height': height,
        'own_pins': own_pins,
        'source': None if not source else {
            'id': source.id,
            'name': source.name,
            'is_current': source.is_current,
            'width': plan_size(source)[0],
            'height': plan_size(source)[1],
            'pins': source_pins,
        },
        'copies_pins': copies,
        'same_size': sized_alike,
        'needs_align': copies and not sized_alike,
    }


def _close_periods(plan: FloorPlan, user, now) -> None:
    FloorPlanCurrentPeriod.objects.filter(plan=plan, ended_at__isnull=True).update(ended_at=now, ended_by=user)


def _pins(n: int) -> str:
    return f'{n} pin' if n == 1 else f'{n} pins'


_NOT_COPIED = {'id', 'plan_id', 'x', 'y', 'created_by_id', 'created_at', 'updated_at'}


def _copy_pins(source: FloorPlan, target: FloorPlan, transform: Transform, user) -> tuple[int, int]:
    """Copy every pin of ``source`` onto ``target`` through ``transform``. Returns (copied, put at the edge)."""
    width, height = plan_size(target)
    width = width or 100_000
    height = height or 100_000
    copies, clamped = [], 0
    for pin in source.pins.all():
        x, y = transform.apply(pin.x, pin.y)
        cx = min(max(x, -PIN_MARGIN), width + PIN_MARGIN)
        cy = min(max(y, -PIN_MARGIN), height + PIN_MARGIN)
        if (cx, cy) != (x, y):
            clamped += 1
        # Every other field comes along as it is (layer, name, note, ref, and any field added later, such as a status).
        fields = {
            f.attname: getattr(pin, f.attname)
            for f in MapPin._meta.concrete_fields
            if f.attname not in _NOT_COPIED
        }
        copies.append(MapPin(**fields, plan=target, x=round(cx, 2), y=round(cy, 2), created_by=user))
    MapPin.objects.bulk_create(copies)
    return len(copies), clamped


def make_current(plan: FloorPlan, user, transform: Transform | None = None) -> dict:
    """Make ``plan`` its location's Current plan. Returns ``{changed, message, pins_copied}``.

    The plan that was Current stays as a past version with its own pins. When ``plan`` has no pins yet, it gets a copy
    of the pins of the plan that was Current (through ``transform``); a size difference needs a transform.
    """
    with transaction.atomic():
        plan = FloorPlan.objects.select_for_update().get(pk=plan.pk)
        if plan.is_current:
            return {'changed': False, 'pins_copied': 0, 'message': f'“{plan.name}” is already the Current plan. Nothing changed.'}
        previous = list(
            FloorPlan.objects.select_for_update()
            .filter(location_id=plan.location_id, is_current=True).exclude(pk=plan.pk)
        )
        source = pin_source(plan)
        own_pins = plan.pins.count()
        copied = clamped = 0
        used = None
        if source and own_pins == 0 and source.pins.exists():
            if transform is None and not same_size(plan, source):
                raise AlignRequired()
            used = transform or Transform()
            copied, clamped = _copy_pins(source, plan, used, user)

        now = timezone.now()
        for old in previous:
            _close_periods(old, user, now)
            old.is_current = False
            old.save(update_fields=['is_current'])
        plan.is_current = True
        plan.save(update_fields=['is_current'])
        FloorPlanCurrentPeriod.objects.create(
            plan=plan, started_at=now, started_by=user, pins_copied=copied,
            transform=used.as_dict() if used and not used.is_identity else {},
        )

    parts = [f'“{plan.name}” is now the Current plan.']
    for old in previous:
        n = old.pins.count()
        parts.append(f'“{old.name}” is kept as a past version' + (f' with its {_pins(n)}.' if n else '.'))
    if copied:
        how = ''
        if used and not used.is_identity:
            how = f' (scaled {used.scale * 100:g}%, moved {used.dx:g}" across and {used.dy:g}" down)'
        parts.append(f'{_pins(copied)} copied over from “{source.name}”{how}.')
        if clamped:
            parts.append(f'{_pins(clamped)} landed off the plan and were set at its edge.')
    elif own_pins:
        parts.append(f'It keeps its own {_pins(own_pins)}.')
    elif not previous and not source:
        parts.append('It has no pins yet.')
    return {'changed': True, 'pins_copied': copied, 'message': ' '.join(parts)}


def unset_current(plan: FloorPlan, user) -> dict:
    """The plan stops being Current; the store map shows no plan until another is made Current."""
    with transaction.atomic():
        plan = FloorPlan.objects.select_for_update().get(pk=plan.pk)
        if not plan.is_current:
            return {'changed': False, 'message': f'“{plan.name}” is not the Current plan. Nothing changed.'}
        _close_periods(plan, user, timezone.now())
        plan.is_current = False
        plan.save(update_fields=['is_current'])
    n = plan.pins.count()
    kept = f'; it keeps its {_pins(n)} as a past version' if n else ''
    return {
        'changed': True,
        'message': (
            f'“{plan.name}” is no longer the Current plan{kept}. '
            'The store map shows no plan until you make one Current.'
        ),
    }


def end_current_on_delete(plan: FloorPlan, user) -> None:
    """A deleted plan is never Current; its open period closes."""
    _close_periods(plan, user, timezone.now())
