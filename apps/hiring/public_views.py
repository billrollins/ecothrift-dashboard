"""Public careers API for ecothrift.us/careers: the page, the roles, and Apply."""
from __future__ import annotations

import json
import logging
import time

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.hiring import careers, services
from apps.hiring.files import save_resume, validate_resume
from apps.hiring.models import Job
from apps.hiring.serializers import PublicJobSerializer

logger = logging.getLogger(__name__)

# A real person takes longer than this to fill the form; bots don't.
MIN_FILL_SECONDS = 4


class CareersReadThrottle(AnonRateThrottle):
    scope = 'hiring_read'
    rate = '120/hour'


class ApplyThrottle(AnonRateThrottle):
    scope = 'hiring_apply'
    rate = '8/hour'


def _key_matches(request, name: str) -> bool:
    key = request.query_params.get(name) or ''
    if not key and request.method == 'POST':
        key = request.data.get(name) or ''
    return bool(key) and key == careers.load_setting().get('preview_key')


def _practice(request) -> bool:
    """A practice link from Dash (?practice=<preview key>): blanks get placeholders; the applicant is Practice."""
    return _key_matches(request, 'practice')


def _visible(request) -> bool:
    return careers.is_public() or _key_matches(request, 'preview') or _practice(request)


def _client_ip(request) -> str | None:
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    return forwarded or request.META.get('REMOTE_ADDR') or None


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([CareersReadThrottle])
def careers_page(request):
    if not _visible(request):
        return Response({'public': False, 'jobs': []})
    setting = careers.load_setting()
    return Response({
        'public': True,
        'preview': not careers.is_public(),
        'practice': _practice(request),
        'page': setting['page'],
        'questions': setting['form']['questions'],
        'sms_consent_text': careers.SMS_CONSENT_TEXT,
        'jobs': PublicJobSerializer(services.public_job_list(), many=True).data,
    })


def _bad(errors: dict, message: str = 'Please fix the marked fields.'):
    return Response({'detail': message, 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ApplyThrottle])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def apply(request):
    data = request.data
    if (data.get('practice') or '') and not _practice(request):
        return Response({'detail': 'This practice link is out of date. Copy a new one from Dash (People → Applicants → '
                                   'Practice run).'}, status=status.HTTP_400_BAD_REQUEST)
    if not _visible(request):
        return Response({'detail': 'Applications are closed right now.'}, status=status.HTTP_404_NOT_FOUND)
    practice = _practice(request)

    # Bots: a hidden field people never see, and a form filled faster than a person can read it.
    # Both get a normal-looking success so they don't learn what tripped them.
    if (data.get('website') or '').strip():
        return Response({'ok': True, 'first_name': ''}, status=status.HTTP_201_CREATED)
    try:
        started_ms = int(data.get('started_at') or 0)
    except (TypeError, ValueError):
        started_ms = 0
    if started_ms and (time.time() - started_ms / 1000) < MIN_FILL_SECONDS and not practice:
        return Response({'ok': True, 'first_name': ''}, status=status.HTTP_201_CREATED)

    errors: dict[str, str] = {}
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    if not first_name:
        errors['first_name'] = 'Required.'
    if not last_name:
        errors['last_name'] = 'Required.'
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        errors['email'] = 'Enter an email address.'
    digits = ''.join(ch for ch in phone if ch.isdigit())
    if len(digits) < 10:
        errors['phone'] = 'Enter a phone number with area code.'

    if practice:
        # Anything left out gets a stand-in, so a practice run can go straight to Send.
        first_name = first_name or services.PRACTICE_FIRST
        last_name = last_name or services.PRACTICE_LAST
        if not email or '@' not in email or '.' not in email.split('@')[-1]:
            email = ''
        if len(digits) < 10:
            phone = services.PRACTICE_PHONE
        errors = {}

    slugs = data.getlist('roles') if hasattr(data, 'getlist') else (data.get('roles') or [])
    if isinstance(slugs, str):
        slugs = [s for s in slugs.split(',') if s]
    jobs = list(Job.objects.filter(status=Job.STATUS_OPEN, slug__in=slugs))
    if not jobs and practice:
        jobs = list(Job.objects.filter(status=Job.STATUS_OPEN)[:1])
    if not jobs:
        errors['roles'] = 'Pick at least one role.'

    raw_answers = data.get('answers') or '{}'
    if isinstance(raw_answers, str):
        try:
            raw_answers = json.loads(raw_answers)
        except ValueError:
            raw_answers = {}
    if not isinstance(raw_answers, dict):
        raw_answers = {}
    if practice:
        raw_answers = services.practice_fill(form_questions=services.form_questions(), jobs=jobs, raw=raw_answers)
    answers, answer_errors, red = services.build_answers(
        form_questions=services.form_questions(), jobs=jobs, raw=raw_answers,
    )
    errors.update({f'answers.{key}': message for key, message in answer_errors.items()})

    upload = request.FILES.get('resume')
    if upload:
        file_error = validate_resume(upload)
        if file_error:
            errors['resume'] = file_error
    if errors:
        return _bad(errors)

    sms_consent = str(data.get('sms_consent') or '').lower() in ('1', 'true', 'yes', 'on')
    with transaction.atomic():
        resume = save_resume(upload) if upload else None
        application = services.create_application(
            first_name=first_name, last_name=last_name, email=email, phone=phone, jobs=jobs, answers=answers,
            red_flags=red, sms_consent=sms_consent, resume=resume, ip=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''), practice=practice,
            note='Practice run (Careers page)' if practice else '',
        )
    services.send_first_touch(application)
    return Response({'ok': True, 'first_name': application.first_name}, status=status.HTTP_201_CREATED)


# ── The interview link (/careers/interview?t=…) ─────────────────────────────


class InterviewThrottle(AnonRateThrottle):
    scope = 'hiring_interview'
    rate = '120/hour'


_EXPIRED = ('This interview link has expired or is no longer active. Reply to the email we sent you, or call the '
            'store, and we will send a new one.')


def _interview_state(application) -> dict:
    from apps.hiring import interviews as service
    from apps.hiring.views import _time_rows

    current = service.current_interview(application)
    cfg = service.config()
    return {
        'ok': True,
        'practice': application.is_practice,
        'first_name': application.first_name,
        'roles': [j.title for j in application.jobs.all()],
        'length_minutes': cfg['length_minutes'],
        'place': cfg['place'],
        'interview': None if current is None else {
            'start': current.start.isoformat(),
            'end': current.end.isoformat(),
            'when': service.when_text(current.start),
            'interviewer': service.first_name(current.interviewer),
            'place': current.place or cfg['place'],
        },
        # Their own booking doesn't block other times, but isn't offered back as a choice either.
        'times': _time_rows([(s, e) for s, e in service.open_times(exclude=current)
                             if current is None or s != current.start]),
    }


def _token(request) -> str:
    return (request.query_params.get('t') or (request.data.get('t') if request.method == 'POST' else '') or '').strip()


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([InterviewThrottle])
def interview(request):
    """GET: who you are, your interview (if booked) and the open times. POST {t, start}: book or move it."""
    from apps.hiring import interviews as service

    application = service.application_for_token(_token(request))
    if application is None:
        return Response({'ok': False, 'detail': _EXPIRED}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'POST':
        service.book(application, request.data.get('start'))
    return Response(_interview_state(application))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([InterviewThrottle])
def interview_cancel(request):
    from apps.hiring import interviews as service

    application = service.application_for_token(_token(request))
    if application is None:
        return Response({'ok': False, 'detail': _EXPIRED}, status=status.HTTP_404_NOT_FOUND)
    current = service.current_interview(application)
    if current is not None:
        service.cancel(current)
    return Response(_interview_state(application))


# ── The offer link (/careers/offer?t=…) ─────────────────────────────────────


_OFFER_GONE = 'This offer link is not valid. Reply to the email we sent you, or call the store.'


def _offer_state(offer) -> dict:
    from apps.hiring.offers import date_text, money, time_text
    from apps.hiring.texts import consent_summary
    from apps.texting.service import digits

    phone = digits(offer.application.phone)
    # The optional text tick (T71): shown when there is a mobile number and their tick does not cover the first day.
    texts = None
    if phone and not consent_summary(phone)['first_day']:
        texts = {'wording': careers.SMS_CONSENT_TEXT, 'phone_last4': phone[-4:]}
    return {
        'texts': texts,
        'ok': True,
        'practice': offer.application.is_practice,
        'status': offer.status,
        'first_name': offer.application.first_name,
        'full_name': offer.application.full_name,
        'position': offer.position,
        'pay_rate': money(offer.pay_rate),
        'start': f'{date_text(offer.start_date)} at {time_text(offer.start_time)}',
        'respond_by': date_text(offer.respond_by),
        'subject': offer.letter_subject,
        'letter': offer.letter_text,
        'acknowledgments': offer.acknowledgments,
        'consent': offer.consent_text,
        'signer_name': offer.signer_name,
        'signed_at': offer.signed_at.isoformat() if offer.signed_at else None,
        'has_pdf': bool(offer.signed_pdf_id),
    }


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([InterviewThrottle])
def offer(request):
    from apps.hiring import offers

    found = offers.for_token(request.query_params.get('t') or '')
    if found is None or found.status == found.STATUS_WITHDRAWN:
        return Response({'ok': False, 'detail': _OFFER_GONE}, status=status.HTTP_404_NOT_FOUND)
    offers.mark_viewed(found)
    return Response(_offer_state(found))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ApplyThrottle])
@parser_classes([JSONParser])
def offer_sign(request):
    from apps.hiring import offers

    found = offers.for_token(request.data.get('t') or '')
    if found is None or found.status == found.STATUS_WITHDRAWN:
        return Response({'ok': False, 'detail': _OFFER_GONE}, status=status.HTTP_404_NOT_FOUND)
    signed = offers.sign(
        found, name=request.data.get('name') or '', signature=request.data.get('signature') or '',
        acks=request.data.get('acks') or [], consent=request.data.get('consent'), ip=_client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', ''), texts_consent=request.data.get('texts_consent'),
    )
    return Response(_offer_state(signed))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ApplyThrottle])
@parser_classes([JSONParser])
def offer_decline(request):
    from apps.hiring import offers

    found = offers.for_token(request.data.get('t') or '')
    if found is None or found.status == found.STATUS_WITHDRAWN:
        return Response({'ok': False, 'detail': _OFFER_GONE}, status=status.HTTP_404_NOT_FOUND)
    return Response(_offer_state(offers.decline(found, reason=request.data.get('reason') or '')))


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([InterviewThrottle])
def offer_pdf(request):
    """The new hire's own copy of the signed offer, while their link works."""
    from apps.core.files import stream_s3
    from apps.hiring import offers

    found = offers.for_token(request.query_params.get('t') or '')
    if found is None or not found.signed_pdf_id:
        return Response({'ok': False, 'detail': _OFFER_GONE}, status=status.HTTP_404_NOT_FOUND)
    return stream_s3(found.signed_pdf, as_attachment=True)
