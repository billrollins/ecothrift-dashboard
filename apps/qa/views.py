"""Data QA in Dash (data_platform Phase 3): the latest run, a check's history, and Run now. Superuser only."""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.qa.checks import by_id
from apps.qa.models import QAFinding, QARun
from apps.qa.services import runner


def _run_payload(run: QARun) -> dict:
    findings = []
    for f in run.findings.all():
        check = by_id(f.check_id)
        findings.append({
            'check_id': f.check_id, 'title': f.title, 'severity': f.severity, 'stage': check.stage if check else '',
            'handling': check.handling if check else '', 'count': f.count, 'previous': f.previous, 'delta': f.delta,
            'sample': f.sample, 'error': f.error, 'fix_kind': check.fix_kind if check else '',
        })
    return {
        'id': run.pk, 'started_at': run.started_at, 'finished_at': run.finished_at, 'error': run.error,
        'triage': run.triage, 'triage_model': run.triage_model, 'findings': findings,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def latest(request):
    run = QARun.objects.filter(finished_at__isnull=False).first()
    running = QARun.objects.filter(finished_at__isnull=True, started_at__gt=timezone.now() - runner.STALE).exists()  # a killed run stops counting
    return Response({'run': _run_payload(run) if run else None, 'running': running})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def history(request, check_id: str):
    rows = QAFinding.objects.filter(check_id=check_id, run__finished_at__isnull=False).select_related('run') \
        .order_by('-run__started_at')[:30]
    return Response([{'day': r.run.started_at.date().isoformat(), 'count': r.count} for r in rows][::-1])


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def run_now(request):
    started = runner.start()
    return Response({'started': started is not None}, status=status.HTTP_202_ACCEPTED)
