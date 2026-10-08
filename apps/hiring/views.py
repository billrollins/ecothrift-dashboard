"""Staff API for People → Applicants and People → Jobs (Manager and Admin)."""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta

from django.db.models import Count, Prefetch, Q
from django.http import Http404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin
from apps.core.files import stream_s3
from apps.hiring import careers, compose, services
from apps.hiring.files import save_resume, validate_resume
from apps.hiring.models import Application, Interview, InterviewTime, Job
from apps.hiring.serializers import (
    ApplicationDetailSerializer, ApplicationListSerializer, InterviewSerializer, InterviewTimeSerializer, JobSerializer,
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
        return (Job.objects.annotate(application_count=Count('applications', distinct=True))
                .select_related('hiring_manager').prefetch_related('interviewers'))

    def perform_create(self, serializer):
        job = serializer.save(updated_by=self.request.user)
        # A new role starts with the default hiring manager and interviewers (careers file "defaults").
        defaults = careers.load_setting()['defaults']
        staff = careers.staff_users()
        if 'hiring_manager' not in self.request.data and defaults.get('hiring_manager'):
            job.hiring_manager = staff.filter(email__iexact=defaults['hiring_manager']).first()
            job.save(update_fields=['hiring_manager'])
        if 'interviewers' not in self.request.data and defaults.get('interviewers'):
            job.interviewers.set(staff.filter(email__in=[e.lower() for e in defaults['interviewers']]))

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
            from apps.hiring.models import Offer

            return self._filtered(with_stage=True).prefetch_related(
                'jobs',
                Prefetch('interviews', to_attr='scheduled_interviews',
                         queryset=Interview.objects.filter(status=Interview.STATUS_SCHEDULED).order_by('start')),
                Prefetch('offers', to_attr='newest_offers', queryset=Offer.objects.order_by('-created_at', '-id')),
            ).order_by(ordering, '-id')
        return Application.objects.select_related('resume', 'employee_user__employee').prefetch_related(
            'jobs', 'events__by',
        )

    @action(detail=False, methods=['get'])
    def counts(self, request):
        # order_by() drops the default -created_at, which would otherwise split each stage into one row per time.
        rows = self._filtered(with_stage=False).order_by().values('stage').annotate(n=Count('id', distinct=True))
        counts = {key: 0 for key, _ in Application.STAGE_CHOICES}
        for row in rows:
            counts[row['stage']] = row['n']
        counts['open'] = sum(v for k, v in counts.items() if k not in (Application.STAGE_HIRED, Application.STAGE_NOT_NOW))
        counts['all'] = sum(v for k, v in counts.items() if k not in ('open',))
        return Response({'counts': counts, 'stages': [{'key': k, 'label': l} for k, l in Application.STAGE_CHOICES],
                         'reasons': [{'key': k, 'label': l} for k, l in Application.NOT_NOW_REASONS],
                         'practice': Application.objects.filter(is_practice=True).count()})

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

    @action(detail=True, methods=['post'], url_path='texts-stop')
    def texts_stop(self, request, pk=None):
        """They asked not to be texted: recorded like a STOP (house standard texting.md)."""
        from apps.hiring import texts

        application = self.get_object()
        texts.stop(application, by=request.user)
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

    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        """Interview link: email it (send=true) or just make it to copy and text (send=false)."""
        from apps.hiring import interviews as interview_service

        application = self.get_object()
        send = request.data.get('send') in (True, 'true', '1', 1)
        if send and application.email:
            # Make the private link before any review, so the link they read is the link that goes out.
            interview_service.ensure_link(application)

        def act():
            result = interview_service.invite(application, by=request.user, send=send)
            return Response({**result, 'application': ApplicationDetailSerializer(self._fresh(application)).data})

        return compose.run(request, act, skip_allowed=False)

    @action(detail=True, methods=['post'], url_path='offer-preview')
    def offer_preview(self, request, pk=None):
        """The letter as it would be sent with these terms (nothing saved)."""
        from apps.hiring import offers

        return Response(offers.preview(self.get_object(), request.data))

    @action(detail=True, methods=['post'])
    def offer(self, request, pk=None):
        """Make an offer: freeze the letter, email the link (send=true) or just return it to copy."""
        from apps.hiring import offers
        from apps.hiring.serializers import OfferSerializer

        application = self.get_object()
        send = request.data.get('send') in (True, 'true', '1', 1)

        def act():
            offer, link, sent = offers.make(application, request.data, by=request.user, send=send)
            return Response({'offer': OfferSerializer(offer).data, 'link': link, 'sent': sent,
                             'application': ApplicationDetailSerializer(self._fresh(application)).data},
                            status=status.HTTP_201_CREATED)

        return compose.run(request, act, skip_allowed=False)

    @action(detail=False, methods=['post'])
    def practice(self, request):
        """Practice run: a mock applicant (placeholders for anything left out); the usual first emails, tagged [Practice]."""
        data = request.data
        job_id = str(data.get('job') or '')
        job = Job.objects.filter(pk=int(job_id)).first() if job_id.isdigit() else None
        application = services.create_practice(
            job=job, first_name=data.get('first_name') or '', last_name=data.get('last_name') or '',
            email=data.get('email') or '', phone=data.get('phone') or '', by=request.user,
        )
        return Response(ApplicationDetailSerializer(self._fresh(application)).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='practice-clear')
    def practice_clear(self, request):
        """Delete every practice applicant with their interviews, offers and files."""
        return Response({'deleted': services.clear_practice()})

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

        def act():
            result = services.create_employee(
                application, by=request.user, request=request, pay_rate=data.get('pay_rate'), start_date=start,
                position=data.get('position') or '',
                department=int(department) if str(department or '').isdigit() else None,
                employment_type=data.get('employment_type') or 'part_time',
            )
            # Usually straight on to onboarding: the checklist, and the first-day email when asked.
            result['onboarding'] = None
            result['first_day_sent'] = False
            if data.get('start_onboarding') in (True, 'true', '1', 1):
                from apps.hiring.onboarding_views import start_from_request

                application.refresh_from_db()
                onboarding, sent = start_from_request(
                    {'application': application.pk, 'start_date': data.get('start_date'),
                     'start_time': data.get('start_time'), 'send_email': data.get('send_first_day')}, by=request.user)
                result['onboarding'], result['first_day_sent'] = onboarding.pk, sent
            return Response({**result, 'application': ApplicationDetailSerializer(self._fresh(application)).data},
                            status=status.HTTP_201_CREATED)

        # The first-day email is reviewed first (a preview makes nothing: it is all rolled back).
        return compose.run(request, act)


# ── Interviews ──────────────────────────────────────────────────────────────


class InterviewViewSet(viewsets.ReadOnlyModelViewSet):
    """People → Interviews. Booking goes through the service (open times, emails, stage moves)."""

    permission_classes = [IsManagerOrAdmin]
    serializer_class = InterviewSerializer
    pagination_class = None

    def get_queryset(self):
        from django.utils import timezone

        qs = (Interview.objects.select_related('application', 'job', 'interviewer', 'scored_by')
              .prefetch_related('application__jobs'))
        params = self.request.query_params
        if params.get('application'):
            qs = qs.filter(application_id=params['application'])
        when = params.get('when') or ''
        now = timezone.now()
        if when == 'today':
            qs = qs.filter(start__date=timezone.localdate()).exclude(status=Interview.STATUS_CANCELLED)
        elif when == 'upcoming':
            qs = qs.filter(start__gte=now, status=Interview.STATUS_SCHEDULED)
        elif when == 'past':
            qs = qs.filter(start__lt=now).order_by('-start')[:100]
        return qs

    def _out(self, interview, status_code=status.HTTP_200_OK):
        fresh = self.get_queryset().model.objects.select_related('application', 'job', 'interviewer').get(pk=interview.pk)
        return Response(InterviewSerializer(fresh).data, status=status_code)

    def create(self, request, *args, **kwargs):
        """Staff book for an applicant (for example on the phone): same open times as the link."""
        from apps.hiring import interviews as service

        application = Application.objects.filter(pk=request.data.get('application')).first()
        if application is None:
            return Response({'application': 'Pick an applicant.'}, status=status.HTTP_400_BAD_REQUEST)
        interviewer = None
        if request.data.get('interviewer'):
            interviewer = careers.staff_users().filter(pk=request.data.get('interviewer')).first()

        if not application.booking_token:
            # Their emails carry a change / cancel link; made before any review so the link shown is the one sent.
            service.ensure_link(application)

        def act():
            interview = service.book(application, request.data.get('start'), by=request.user, interviewer=interviewer)
            return self._out(interview, status.HTTP_201_CREATED)

        return compose.run(request, act)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        from apps.hiring import interviews as service

        interview = self.get_object()
        if interview.status != Interview.STATUS_SCHEDULED:
            return Response({'detail': 'Only a scheduled interview can move.'}, status=status.HTTP_400_BAD_REQUEST)

        def act():
            service.book(interview.application, request.data.get('start'), by=request.user)
            return self._out(interview)

        return compose.run(request, act)

    @action(detail=True, methods=['post'])
    def interviewer(self, request, pk=None):
        from apps.hiring import interviews as service

        interview = self.get_object()
        person = None
        if request.data.get('interviewer'):
            person = careers.staff_users().filter(pk=request.data.get('interviewer')).first()
            if person is None:
                return Response({'interviewer': 'Pick a staff member.'}, status=status.HTTP_400_BAD_REQUEST)
        service.set_interviewer(interview, person, by=request.user)
        return self._out(interview)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        from apps.hiring import interviews as service

        interview = self.get_object()

        def act():
            service.cancel(interview, by=request.user,
                           notify=request.data.get('notify', True) not in (False, 'false', 0))
            return self._out(interview)

        return compose.run(request, act)

    @action(detail=True, methods=['post'], url_path='no-show')
    def no_show(self, request, pk=None):
        from apps.hiring import interviews as service

        service.mark_no_show(self.get_object(), by=request.user)
        return self._out(self.get_object())

    @action(detail=True, methods=['post'])
    def scorecard(self, request, pk=None):
        from apps.hiring import interviews as service

        interview = self.get_object()
        done = request.data.get('done') in (True, 'true', '1', 1)
        service.save_scorecard(interview, request.data, by=request.user, done=done)
        return self._out(interview)

    @action(detail=False, methods=['get'], url_path='open-times')
    def open_times(self, request):
        from apps.hiring import interviews as service

        exclude = Interview.objects.filter(pk=request.query_params.get('exclude')).first() \
            if request.query_params.get('exclude') else None
        return Response({'times': _time_rows(service.open_times(exclude=exclude)), 'settings': service.config()})


def _time_rows(times) -> list[dict]:
    from django.utils import timezone

    rows = []
    for start, end in times:
        local = timezone.localtime(start)
        hour = local.strftime('%I').lstrip('0') or '12'
        rows.append({
            'start': start.isoformat(), 'end': end.isoformat(),
            'day': f'{local.strftime("%A, %B")} {local.day}', 'date': local.date().isoformat(),
            'label': f'{hour}:{local.strftime("%M %p")}',
        })
    return rows


class OfferViewSet(viewsets.ReadOnlyModelViewSet):
    """Offers: resend, withdraw, and the signed PDF (private, streamed)."""

    permission_classes = [IsManagerOrAdmin]
    pagination_class = None

    def get_serializer_class(self):
        from apps.hiring.serializers import OfferSerializer
        return OfferSerializer

    def get_queryset(self):
        from apps.hiring.models import Offer

        qs = Offer.objects.select_related('application', 'supervisor', 'signed_pdf')
        if self.request.query_params.get('application'):
            qs = qs.filter(application_id=self.request.query_params['application'])
        return qs

    def _out(self, offer):
        from apps.hiring.serializers import OfferSerializer
        return Response(OfferSerializer(self.get_queryset().get(pk=offer.pk)).data)

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        from apps.hiring import offers

        offer = self.get_object()

        def act():
            sent = offers.resend(offer, by=request.user)
            return Response({'sent': sent, 'offer': self._out(offer).data})

        return compose.run(request, act, skip_allowed=False)

    @action(detail=True, methods=['post'])
    def withdraw(self, request, pk=None):
        from apps.hiring import offers

        offer = self.get_object()
        offers.withdraw(offer, by=request.user)
        return self._out(offer)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        offer = self.get_object()
        if not offer.signed_pdf_id:
            raise Http404('Not signed yet.')
        return stream_s3(offer.signed_pdf, as_attachment=request.query_params.get('download') == '1')


class InterviewTimeViewSet(viewsets.ModelViewSet):
    """Extra openings and blocked times."""

    permission_classes = [IsManagerOrAdmin]
    serializer_class = InterviewTimeSerializer
    pagination_class = None
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        from django.utils import timezone

        return InterviewTime.objects.filter(end__gte=timezone.now() - timedelta(days=1))

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ── The careers file ────────────────────────────────────────────────────────


def careers_brief() -> str:
    never = '\n'.join(f'  - {item}' for item in careers.NEVER_ASK)
    return f"""You are editing Eco-Thrift's careers file (format {careers.FORMAT}).
Eco-Thrift is a small thrift and liquidation store at 8425 West Center Road, Omaha, Nebraska.
Its mission: Another Chance for Everything and Everyone.

Return the WHOLE file (every key, even the ones you did not change) as YAML or JSON, and nothing else.

The parts:
- public: true shows ecothrift.us/careers; false hides it.
- page: the careers page text (headline, roles_line, intro as a list of paragraphs, hours_line, pay, what_we_ask,
  apply_note, growth (each area has a lead; strong people can step up), photo_url).
- form.questions: the questions every applicant answers. Name, phone, email, the roles, the resume and the
  text-message consent are fixed fields; do not add them as questions.
- email: from, reply_to (one address each) and notify (who gets an alert per application; a comma list),
  each from indexes.mailboxes only (retail@, bill_rollins@ and warehouse@ecothrift.us);
  review_day, reply_days, and the emails: received (auto-reply), alert (to the owner), not_now
  (default, withdrew, position_closed, no_show). Email placeholders: {{first_name}} {{last_name}} {{roles}}
  {{phone}} {{email}} {{review_day}} {{reply_days}}; the alert also has {{flags}} and {{dash_link}}.
- jobs: one entry per role. slug (stable, lowercase), title, status (draft | open | paused | closed),
  tagline (one line), summary ("About the role": 2-3 sentences, what it is and why it matters to the mission),
  duties ("What you'll do": 6-8 concrete bullets), success ("What great looks like": 3 bullets a strong
  performer hits, the kind of person who could grow into the area's lead), looking_for ("What we're looking for": 4-5 qualities
  and skills), nice_to_have (2-3 bullets), physical ("The physical side": the real physical demands, stated
  plainly, with "with or without accommodation" on lifting), works_with (one line, who they work with),
  schedule, hours, employment_type (full_time | part_time | full_or_part), pay_min, pay_max (numbers;
  pay_max is never shown publicly), pay_text (what the page says about pay), questions (role questions,
  shown when the applicant ticks this role), interview_questions, sort_order,
  department (a slug from indexes.departments, or ""), hiring_manager (a staff email from indexes.staff, or "";
  this person owns hiring for the role and gets an email for each new application), interviewers (a list of
  staff emails from indexes.staff: who sits in this role's interviews).
  A role page is about 250-300 words. No degree or "years of experience" requirements for hourly roles
  (pay is set by skill, not years on a resume). No corporate words (KPIs, liaison, stakeholders).
  Never invent pay, perks or benefits that are not already in the file.
  There is one location: the Canfield store, 8425 West Center Road, Omaha. Everyone works with Bill, the owner.

A question is: key (snake_case, stable), label, type (yes_no | text | long_text | number | choice | multi |
date | time), required (true/false), options (for choice and multi), help (optional),
must_be (yes or no, only on yes_no questions; a different answer shows a red flag to staff),
flag_label (short name for that flag), after_roles (true = shown after the role questions).

Never ask about:
{never}

Indexes: every value that points at something else (staff emails, department slugs, question types, job
statuses, employment types, the "not now" email keys) must come from "indexes". Never make one up. If what
you need is not there, leave that value as it is and say so in one line outside the JSON.

Write plainly: short sentences, warm, direct. Keep the owner's voice ("we're a small team with a big dream").
Keep keys and slugs that already exist unless the request says to change them.
"""


def ai_choices() -> dict:
    """The models in Settings > AI (active, text) and the hiring purpose's defaults, for the Ask AI dialog."""
    from apps.core.ai_config import ai_effort, ai_model
    from apps.core.models import AiAction, AiModel

    models = [{'slug': m.slug, 'label': m.label or m.slug, 'provider': m.provider}
              for m in AiModel.objects.filter(modality='text', status='active').order_by('provider', 'label', 'slug')]
    return {
        'purpose': 'HIRING_CAREERS',
        'default_model': ai_model('HIRING_CAREERS'),
        'default_effort': ai_effort('HIRING_CAREERS'),
        'models': models,
        'efforts': [key for key, _ in AiAction.EFFORT_CHOICES],
    }


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
        'indexes': careers.indexes(),
        'ai': ai_choices(),
    })


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def texts_log(request):
    """Phase 6: is texting live (and if not, what it waits on), and the applicant texts sent or held, newest first."""
    from apps.hiring import texts
    from apps.texting.models import TextMessage
    from apps.texting.service import waiting_on

    counts = dict(TextMessage.objects.filter(kind=texts.KIND).order_by().values_list('status').annotate(n=Count('id')))
    return Response({'waiting_on': waiting_on(), 'counts': counts, 'texts': texts.recent()})


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def careers_bundle(request):
    """Download for AI: instructions + indexes + the current careers file, in one JSON."""
    return Response(careers.bundle(careers_brief()))


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

@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def ai_start(request):
    """Start an AI edit in the background: kind = job | email | careers. Poll GET hiring/ai/<id>/."""
    from apps.hiring import ai
    from apps.hiring.models import HiringAiJob

    data = request.data if isinstance(request.data, dict) else {}
    kind = data.get('kind') or ''
    choices = ai_choices()
    model = (data.get('model') or '').strip()
    effort = (data.get('effort') or '').strip()
    if model and model not in {m['slug'] for m in choices['models']}:
        return Response({'detail': 'That model is not active in Settings > AI.'}, status=status.HTTP_400_BAD_REQUEST)
    if effort and effort not in choices['efforts']:
        return Response({'detail': 'Effort must be one of ' + ', '.join(choices['efforts']) + '.'},
                        status=status.HTTP_400_BAD_REQUEST)
    action = data.get('action') or 'polish'
    if action not in ai.ACTIONS:
        return Response({'detail': 'Unknown AI action.'}, status=status.HTTP_400_BAD_REQUEST)
    instruction = (data.get('instruction') or '').strip()[:2000]
    if action == 'custom' and not instruction:
        return Response({'detail': 'Say what to change.'}, status=status.HTTP_400_BAD_REQUEST)
    base = {'model': model, 'effort': effort, 'action': action, 'instruction': instruction}
    if kind == HiringAiJob.KIND_JOB:
        fields = data.get('fields') if isinstance(data.get('fields'), dict) else {}
        params = {**base, 'fields': fields}
    elif kind == HiringAiJob.KIND_EMAIL:
        key = data.get('key') or ''
        if key not in careers.TEMPLATE_KEYS:
            return Response({'detail': 'Unknown email.'}, status=status.HTTP_400_BAD_REQUEST)
        params = {**base, 'key': key, 'subject': data.get('subject') or '', 'body': data.get('body') or '',
                  'role_title': data.get('role_title') or ''}
    elif kind == HiringAiJob.KIND_CAREERS:
        ask = (data.get('request') or '').strip()
        if not ask:
            return Response({'detail': 'Say what you want written or changed.'}, status=status.HTTP_400_BAD_REQUEST)
        params = {**base, 'request': ask[:4000]}
    else:
        return Response({'detail': 'Unknown AI kind.'}, status=status.HTTP_400_BAD_REQUEST)
    job = ai.start(kind, params, user=request.user)
    return Response({'id': str(job.pk), 'status': job.status}, status=status.HTTP_202_ACCEPTED)


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def ai_status(request, job_id):
    from apps.hiring import ai
    from apps.hiring.models import HiringAiJob

    job = HiringAiJob.objects.filter(pk=job_id).first()
    if job is None:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    job = ai.poll(job)
    return Response({'id': str(job.pk), 'kind': job.kind, 'status': job.status, 'result': job.result,
                     'error': job.error, 'model': job.model})
