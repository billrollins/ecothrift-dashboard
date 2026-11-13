"""Design Lab page checklist (Dash Update #134): the owner ticks each page's design steps on the Design Lab's Pages tab.

The page list and each page's type live in the front end (frontend/src/navigation/pageRegistry.ts); only the ticks are
kept here, in one AppSetting (``design_lab.page_checks``), so every change is in AppSettingHistory with who and when.
Value: ``{page_id: {"template": bool, "design": bool, "done": bool, "by": str, "at": iso}}``.
"""
import re

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from .models import AppSetting, AppSettingHistory

CHECKS_KEY = 'design_lab.page_checks'
STEPS = ('template', 'design', 'done')
PAGE_ID = re.compile(r'^[A-Za-z][A-Za-z0-9_-]{0,59}$')


def _checks(row) -> dict:
    return row.value if row and isinstance(row.value, dict) else {}


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def page_checks(request):
    """GET every page's ticks. PUT ``{"page": "receiving", "step": "design", "on": true}`` ticks or unticks one step;
    the steps stay in order (ticking one ticks the ones before it, unticking one unticks the ones after it)."""
    if request.method == 'GET':
        return Response({'checks': _checks(AppSetting.objects.filter(key=CHECKS_KEY).first())})

    page, step, on = request.data.get('page'), request.data.get('step'), request.data.get('on')
    if not isinstance(page, str) or not PAGE_ID.match(page) or step not in STEPS or not isinstance(on, bool):
        return Response({'detail': 'Send {"page": "<page id>", "step": "template" | "design" | "done", "on": true}.'},
                        status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        row, _ = AppSetting.objects.select_for_update().get_or_create(
            key=CHECKS_KEY,
            defaults={'value': {}, 'description': 'Design Lab: each page\'s design checklist (Admin > Design Lab > Pages).'},
        )
        old = _checks(row)
        checks = {k: dict(v) for k, v in old.items()}
        entry = {s: bool(checks.get(page, {}).get(s)) for s in STEPS}
        index = STEPS.index(step)
        for i, s in enumerate(STEPS):
            if on and i <= index:
                entry[s] = True
            if not on and i >= index:
                entry[s] = False
        entry['by'] = request.user.first_name or request.user.email
        entry['at'] = timezone.now().isoformat(timespec='seconds')
        checks[page] = entry
        AppSettingHistory.objects.create(key=CHECKS_KEY, old_value=old.get(page), new_value=entry, changed_by=request.user)
        row.value = checks
        row.updated_by = request.user
        row.save(update_fields=['value', 'updated_by', 'updated_at'])
    return Response({'checks': checks})
