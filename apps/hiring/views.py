"""Staff API for People → Applicants and People → Jobs (Manager and Admin)."""
from __future__ import annotations

import json
import logging
from datetime import date

from django.db.models import Count, Q
from django.http import Http404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin
from apps.core.files import stream_s3
from apps.hiring import careers, services
from apps.hiring.files import save_resume, validate_resume
from apps.hiring.models import Application, Job
from apps.hiring.serializers import (
    ApplicationDetailSerializer, ApplicationListSerializer, JobSerializer,
)

logger = logging.getLogger(__name__)


def _ids(raw) -> list[int]:
    if raw in (None, ''):
        return []
    if isinstance(raw, list):
        values = raw
    else:
        values = str(raw).replace(' ', '').split(',')
    out = []
    for value in values:
        try:
            out.append(int(value))
        except (TypeError, ValueError):
            continue
    return out


class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [IsManagerOrAdmin]
    serializer_class = JobSerializer
    pagination_class = None

    def get_queryset(self):
        return Job.objects.annotate(application_count=Count('applications', distinct=True))

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        job = self.get_object()
        if job.applications.exists():
            return Response({'detail': 'People applied for this role. Close it instead of deleting it.'},
                            status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


class ApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsManagerOrAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_serializer_class(self):
        return ApplicationDetailSerializer if self.action != 'list' else ApplicationListSerializer

    def _filtered(self, *, with_stage: bool):
        params = self.request.query_params
        qs = Application.objects.all()
        job = params.get('job')
        if job:
            qs = qs.filter(jobs__slug=job) if not job.isdigit() else qs.filter(jobs__id=int(job))
        q = (params.get('q') or '').strip()
        if q:
            digits = ''.join(ch for ch in q if ch.isdigit())
            cond = Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
            if len(digits) >= 3:
                cond |= Q(phone_digits__contains=digits)
            parts = q.split()
            if len(parts) >= 2:
                cond |= Q(first_name__icontains=parts[0], last_name__icontains=parts[-1])
            qs = qs.filter(cond)
        flag = params.get('flag')
        if flag == 'red':
            qs = qs.filter(red_flags__gt=0)
        elif flag == 'green':
            qs = qs.filter(red_flags=0)
        if with_stage:
            stage = params.get('stage')
            if stage == 'open':
                qs = qs.exclude(stage__in=[Application.STAGE_HIRED, Application.STAGE_NOT_NOW])
            elif stage:
                qs = qs.filter(stage=stage)
        return qs.distinct()

    def get_queryset(self):
        if self.action == 'list':
            ordering = self.request.query_params.get('ordering') or '-created_at'
            allowed = {'created_at', '-created_at', 'rating', '-rating', 'last_name', '-last_name',
                       'stage_changed_at', '-stage_changed_at', 'red_flags', '-red_flags'}
            if ordering not in allowed:
                ordering = '-created_at'
            return self._filtered(with_stage=True).prefetch_related('jobs').order_by(ordering, '-id')
        return Application.objects.select_related('resume', 'employee_user__employee').prefetch_related(
            'jobs', 'events__by',
        )

    @action(detail=False, methods=['get'])
    def counts(self, request):
        rows = self._filtered(with_stage=False).values('stage').annotate(n=Count('id', distinct=True))
        counts = {key: 0 for key, _ in Application.STAGE_CHOICES}
        for row in rows:
            counts[row['stage']] = row['n']
        counts['open'] = sum(v for k, v in counts.items() if k not in (Application.STAGE_HIRED, Application.STAGE_NOT_NOW))
        counts['all'] = sum(v for k, v in counts.items() if k not in ('open',))
        return Response({'counts': counts, 'stages': [{'key': k, 'label': l} for k, l in Application.STAGE_CHOICES],
                         'reasons': [{'key': k, 'label': l} for k, l in Application.NOT_NOW_REASONS]})

    def create(self, request, *args, **kwargs):
        """Add an applicant by hand: a walk-in, a paper application, or an emailed resume."""
        data = request.data
        first_name = (data.get('first_name') or '').strip()
        if not first_name:
            return Response({'first_name': 'First name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        jobs = list(Job.objects.filter(id__in=_ids(data.get('jobs'))))
        if not jobs:
            return Response({'jobs': 'Pick at least one role.'}, status=status.HTTP_400_BAD_REQUEST)
        source = data.get('source') or Application.SOURCE_WALK_IN
        if source not in dict(Application.SOURCE_CHOICES):
            source = Application.SOURCE_OTHER
        upload = request.FILES.get('resume')
        resume = None
        if upload:
            error = validate_resume(upload)
            if error:
                return Response({'resume': error}, status=status.HTTP_400_BAD_REQUEST)
            resume = save_resume(upload, user=request.user)
        application = services.create_application(
            first_name=first_name,
            last_name=data.get('last_name') or '',
            email=data.get('email') or '',
            phone=data.get('phone') or '',
            jobs=jobs,
            answers=[],
            red_flags=0,
            resume=resume,
            source=source,
            by=request.user,
            note=(data.get('note') or '').strip()[:4000] or None,
        )
        return Response(ApplicationDetailSerializer(self._fresh(application)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        application = self.get_object()
        changed = []
        for field in ('first_name', 'last_name', 'email', 'phone'):
            if field in request.data:
                value = (request.data.get(field) or '').strip()
                if field == 'first_name' and not value:
                    return Response({'first_name': 'First name is required.'}, status=status.HTTP_400_BAD_REQUEST)
                if field == 'email':
                    value = value.lower()
                if getattr(application, field) != value:
                    setattr(application, field, value)
                    changed.append(field)
                    if field == 'phone':
                        application.phone_digits = services.digits_of(value)
        if 'jobs' in request.data:
            jobs = list(Job.objects.filter(id__in=_ids(request.data.get('jobs'))))
            if not jobs:
                return Response({'jobs': 'Pick at least one role.'}, status=status.HTTP_400_BAD_REQUEST)
            if set(j.pk for j in jobs) != set(application.jobs.values_list('id', flat=True)):
                application.jobs.set(jobs)
                changed.append('roles')
        if changed:
            application.save()
            services._event(application, 'edit', by=request.user, text='Changed ' + ', '.join(changed))
        return Response(ApplicationDetailSerializer(self._fresh(application)).data)

    def _fresh(self, application):
        return self.get_queryset().get(pk=application.pk) if self.action != 'list' else application

    @action(detail=True, methods=['post'])
    def stage(self, request, pk=None):
        application = self.get_object()
        services.set_stage(application, request.data.get('stage') or '', by=request.user,
                           note=request.data.get('note') or '')
        return Response(ApplicationDetailSerializer(self._fresh(application)).data)

    @action(detail=True, methods=['post'])
    def note(self, request, pk=None):
        application = self.get_object()
        services.add_note(application, request.data.get('text') or '', by=request.user)
        return Response(ApplicationDetailSerializer(self._fresh(application)).data)

    @action(detail=True, methods=['post'])
    def rating(self, request, pk=None):
        application = self.get_object()
        services.set_rating(application, request.data.get('rating'), by=request.user)
        return Response(ApplicationDetailSerializer(self._fresh(application)).data)

    @action(detail=True, methods=['get'], url_path='not-now-draft')
    def not_now_draft(self, request, pk=None):
        application = self.get_object()
        reason = request.query_params.get('reason') or 'other'
        return Response(services.not_now_draft(application, reason))

    @action(detail=True, methods=['post'], url_path='not-now')
    def not_now(self, request, pk=None):
        application = self.get_object()
        data = request.data
        send = data.get('send') in (True, 'true', '1', 1)
        services.mark_not_now(
            application, reason=data.get('reason') or '', note=data.get('note') or '', send=send,
            subject=data.get('subject') or '', body=data.get('body') or '', by=request.user,
        )
        return Response(ApplicationDetailSerializer(self._fresh(application)).data)

    @action(detail=True, methods=['get', 'post'], parser_classes=[MultiPartParser, FormParser])
    def resume(self, request, pk=None):
        application = self.get_object()
        if request.method == 'POST':
            upload = request.FILES.get('resume')
            error = validate_resume(upload)
            if error:
                return Response({'resume': error}, status=status.HTTP_400_BAD_REQUEST)
            application.resume = save_resume(upload, user=request.user)
            application.save(update_fields=['resume', 'updated_at'])
            services._event(application, 'edit', by=request.user, text=f'Resume added ({upload.name})')
            return Response(ApplicationDetailSerializer(self._fresh(application)).data)
        if not application.resume_id:
            raise Http404('No resume.')
        return stream_s3(application.resume, as_attachment=request.query_params.get('download') == '1')

    @action(detail=True, methods=['post'], url_path='create-employee')
    def create_employee(self, request, pk=None):
        application = self.get_object()
        data = request.data
        start = None
        if data.get('start_date'):
            try:
                start = date.fromisoformat(str(data.get('start_date')))
            except ValueError:
                return Response({'start_date': 'Use a date like 2026-10-12.'}, status=status.HTTP_400_BAD_REQUEST)
        department = data.get('department')
        result = services.create_employee(
            application, by=request.user, request=request, pay_rate=data.get('pay_rate'), start_date=start,
            position=data.get('position') or '', department=int(department) if str(department or '').isdigit() else None,
            employment_type=data.get('employment_type') or 'part_time',
        )
        return Response({**result, 'application': ApplicationDetailSerializer(self._fresh(application)).data},
                        status=status.HTTP_201_CREATED)


# ── The careers file ────────────────────────────────────────────────────────


def careers_brief() -> str:
    never = '\n'.join(f'  - {item}' for item in careers.NEVER_ASK)
    return f"""You are editing Eco-Thrift's careers file (format {careers.FORMAT}).
Eco-Thrift is a small thrift and liquidation store at 8425 West Center Road, Omaha, Nebraska.
Its mission: Another Chance for Everything and Everyone.

Return the WHOLE file (every key, even the ones you did not change) as YAML or JSON, and nothing else.

The parts:
- public: true shows ecothrift.us/careers; false hides it.
- page: the careers page text (headline, roles_line, intro as a list of paragraphs, hours_line, pay, what_we_ask, apply_note, photo_url).
- form.questions: the questions every applicant answers. Name, phone, email, the roles, the resume and the
  text-message consent are fixed fields; do not add them as questions.
- email: from (blank = the store mailbox), reply_to, notify (who gets an alert per application),
  review_day, reply_days, and the emails: received (auto-reply), alert (to the owner), not_now
  (default, withdrew, position_closed, no_show). Email placeholders: {{first_name}} {{last_name}} {{roles}}
  {{phone}} {{email}} {{review_day}} {{reply_days}}; the alert also has {{flags}} and {{dash_link}}.
- jobs: one entry per role. slug (stable, lowercase), title, status (draft | open | paused | closed),
  tagline, summary, duties (list), schedule, hours, employment_type (full_time | part_time | full_or_part),
  pay_min, pay_max (numbers; pay_max is never shown publicly), pay_text (what the page says about pay),
  questions (role questions, shown when the applicant ticks this role), interview_questions, sort_order.

A question is: key (snake_case, stable), label, type (yes_no | text | long_text | number | choice | multi |
date | time), required (true/false), options (for choice and multi), help (optional),
must_be (yes or no, only on yes_no questions; a different answer shows a red flag to staff),
flag_label (short name for that flag), after_roles (true = shown after the role questions).

Never ask about:
{never}

Write plainly: short sentences, warm, direct. Keep the owner's voice ("we're a small team with a big dream").
Keep keys and slugs that already exist unless the request says to change them.
"""


@api_view(['GET', 'PUT'])
@permission_classes([IsManagerOrAdmin])
def careers_view(request):
    if request.method == 'PUT':
        result = careers.check_doc(request.data.get('doc') if isinstance(request.data, dict) else None)
        if not result['ok']:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        careers.apply_doc(result['doc'], user=request.user)
    return Response({
        'doc': careers.export_doc(),
        'brief': careers_brief(),
        'preview_key': careers.preview_key(),
        'sms_consent_text': careers.SMS_CONSENT_TEXT,
        'reasons': [{'key': k, 'label': l} for k, l in Application.NOT_NOW_REASONS],
    })


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def careers_check(request):
    result = careers.check_doc(request.data.get('doc') if isinstance(request.data, dict) else None)
    changes = careers.summarize_changes(careers.export_doc(), result['doc']) if result['ok'] else []
    return Response({**result, 'changes': changes})


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def careers_public(request):
    setting = careers.set_public(bool(request.data.get('public')), user=request.user)
    return Response({'public': setting['public']})


def _json_from(text: str):
    text = (text or '').strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1] if '\n' in text else ''
        text = text.rsplit('```', 1)[0]
    start, end = text.find('{'), text.rfind('}')
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except ValueError:
        return None


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def careers_ai_draft(request):
    """Draft with AI: the model returns the whole file as JSON. Nothing is saved here."""
    from apps.core.services.llm_router import llm_chat_text

    ask = (request.data.get('request') or '').strip()
    if not ask:
        return Response({'detail': 'Say what you want written or changed.'}, status=status.HTTP_400_BAD_REQUEST)
    current = json.dumps(careers.export_doc(), indent=2, default=str)
    system = careers_brief() + '\nReturn JSON only (no YAML, no prose), the whole file.'
    user = f'The current file:\n{current}\n\nWhat to do:\n{ask[:4000]}'
    try:
        text, model = llm_chat_text(purpose='HIRING_CAREERS', system=system, user=user, max_tokens=8000,
                                    timeout=180, log_source='hiring.careers_ai_draft')
    except Exception as exc:
        logger.exception('Careers AI draft failed')
        return Response({'detail': f'The AI did not answer: {exc}'}, status=status.HTTP_502_BAD_GATEWAY)
    doc = _json_from(text)
    if doc is None:
        return Response({'detail': 'The AI answer was not a file. Try again or rephrase.', 'text': text[:4000]},
                        status=status.HTTP_502_BAD_GATEWAY)
    result = careers.check_doc(doc)
    changes = careers.summarize_changes(careers.export_doc(), result['doc']) if result['ok'] else []
    return Response({**result, 'raw': doc, 'changes': changes, 'model': model})
