"""Dev only: a full set of hiring test data, with dates relative to today, so every hiring page has something on it.

    python manage.py seed_hiring_demo           # (re)build it: clears the old seed first
    python manage.py seed_hiring_demo --clear   # remove it

Everything it makes uses the email domain ``seed.example.test`` (the clean-up finds it by that), and it sends no
email. It refuses to run unless DEBUG is on, so it never touches production. Run it again after copying production
data into dev, and it is all back.

What it makes (open roles from the careers file):

- applicants in every stage: New, Reviewed (with a red must-have), Contacted (with an interview link),
  Interview scheduled (tomorrow-ish), Interviewed (scorecard: Hire), Offer (an open offer), Not now, and one practice run;
- three hires (Dash users with the Employee role and no password; show them the Set password code to sign in as one):
  - started 3 days ago: onboarding in progress, a few items ticked;
  - started 31 days ago: most of onboarding done, the 30-day check-in overdue;
  - started 92 days ago: onboarding done, the 30 and 60-day check-ins signed, the 90-day check-in due.
"""
from __future__ import annotations

import base64
from datetime import datetime, time, timedelta
from unittest import mock

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

DOMAIN = 'seed.example.test'


def _signature() -> str:
    import pymupdf

    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 260, 80), 0)
    pix.clear_with(255)
    for x in range(20, 240):
        pix.set_pixel(x, 40 + (x % 23) - 11, (25, 35, 70))
        pix.set_pixel(x, 41 + (x % 23) - 11, (25, 35, 70))
    return 'data:image/png;base64,' + base64.b64encode(pix.tobytes('png')).decode()


def _next_weekday(day, hour: int):
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return timezone.make_aware(datetime.combine(day, time(hour, 0)), timezone.get_current_timezone())


class Command(BaseCommand):
    help = 'Dev only: build (or --clear) hiring test data on the seed.example.test domain.'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Remove the seed data and stop.')

    def handle(self, *args, clear: bool, **options):
        if not settings.DEBUG:
            raise CommandError('This is for a dev database (DEBUG on). It will not run against production.')
        removed = self.clear()
        self.stdout.write(f'Removed {removed} seed people.')
        if clear:
            return
        # No email leaves while seeding, whatever the mail settings are.
        with mock.patch('apps.hiring.emails.send', return_value=True), transaction.atomic():
            made = self.build()
        self.stdout.write(self.style.SUCCESS(f'Seeded hiring test data: {made}.'))

    # ── Clear ───────────────────────────────────────────────────────────────

    def clear(self) -> int:
        from django.core.files.storage import default_storage

        from apps.accounts.models import User
        from apps.hiring.models import Application, CheckIn, HandbookSignature, I9File, Onboarding

        def drop(s3):
            if s3 is None:
                return
            try:
                default_storage.delete(s3.key)
            except Exception:
                pass
            s3.delete()

        from apps.texting.models import TextConsent, TextMessage

        users = list(User.objects.filter(email__iendswith='@' + DOMAIN))
        apps = list(Application.objects.filter(email__iendswith='@' + DOMAIN))
        refs = [f'hiring.application:{a.pk}' for a in apps]
        TextMessage.objects.filter(ref__in=refs).delete()
        TextConsent.objects.filter(ref__in=refs).delete()
        files = []
        for row in CheckIn.objects.filter(user__in=users):
            files += [row.manager_signature, row.employee_signature, row.signed_pdf]
        for row in HandbookSignature.objects.filter(user__in=users):
            files += [row.signature, row.signed_pdf]
        for row in I9File.objects.filter(record__user__in=users):
            files.append(row.file)
        for app in apps:
            files.append(app.resume)
            for offer in app.offers.all():
                files += [offer.signature, offer.signed_pdf]
        with transaction.atomic():
            CheckIn.objects.filter(user__in=users).delete()
            HandbookSignature.objects.filter(user__in=users).delete()
            I9File.objects.filter(record__user__in=users).delete()
            Onboarding.objects.filter(user__in=users).delete()
            for app in apps:
                app.delete()
            for user in users:
                user.delete()
        for s3 in files:
            drop(s3)
        return len(apps) + len(users)

    # ── Build ───────────────────────────────────────────────────────────────

    def build(self) -> str:
        from apps.accounts.models import User
        from apps.hiring import careers, checkins, interviews, offers, onboarding, services
        from apps.hiring.models import Application, Interview, Job, OnboardingTask

        jobs = list(Job.objects.filter(status=Job.STATUS_OPEN).order_by('sort_order')) or list(Job.objects.all())
        if not jobs:
            raise CommandError('There are no roles. Add one in People → Jobs first.')
        by = User.objects.filter(is_superuser=True, is_active=True).order_by('pk').first()
        manager = (jobs[0].hiring_manager or by)
        today = timezone.localdate()
        questions = services.form_questions()

        def applicant(first, last, job, *, stage='new', days_ago=0, raw=None, rating=None, source='web', texts_ok=False):
            raw = services.practice_fill(form_questions=questions, jobs=[job], raw=raw or {})
            raw.setdefault('why_us', f'I like what Eco-Thrift does. ({first})')
            answers, _, red = services.build_answers(form_questions=questions, jobs=[job], raw=raw)
            # 555-01xx numbers are set aside for fiction: never a real phone.
            app = services.create_application(
                first_name=first, last_name=last, email=f'{first.lower()}.{last.lower()}@{DOMAIN}',
                phone=f'402-555-01{len(first) + len(last):02d}', jobs=[job], answers=answers, red_flags=red,
                source=source, note='Seed data (seed_hiring_demo)', sms_consent=texts_ok,
            )
            if texts_ok:  # ticked the text box: the consent record and the held confirmation text
                from apps.hiring import texts

                texts.record_opt_in(app)
            when = timezone.now() - timedelta(days=days_ago, hours=2)
            Application.objects.filter(pk=app.pk).update(created_at=when)
            if stage != 'new':
                app.stage, app.stage_changed_at = stage, when + timedelta(hours=3)
                app.save(update_fields=['stage', 'stage_changed_at'])
            if rating:
                services.set_rating(app, rating, by=by)
            return app

        def interview(app, job, start, *, done=False):
            row = Interview.objects.create(
                application=app, job=job, start=start, end=start + timedelta(minutes=30), interviewer=manager,
                place=careers.load_setting()['interviews']['place'], booked_by=Interview.BY_APPLICANT,
            )
            if done:
                stage = app.stage
                interviews.save_scorecard(row, {
                    'answers': [{'key': q['key'], 'rating': 4, 'note': 'Good answer.'}
                                for q in list(job.interview_questions or [])[:3] if isinstance(q, dict) and q.get('key')],
                    'overall': 'hire', 'lead_potential': 'maybe', 'notes': 'Friendly, asked good questions.',
                }, by=manager, done=True)
                if stage == 'offer':  # a hire: keep the stage the seed set
                    Application.objects.filter(pk=app.pk).update(stage=stage)
            return row

        def hire(first, last, job, *, started_days_ago):
            app = applicant(first, last, job, stage='offer', days_ago=started_days_ago + 14, rating=4)
            interview(app, job, timezone.now() - timedelta(days=started_days_ago + 10), done=True)
            offer, _, _ = offers.make(app, {'job': job.pk, 'pay_rate': '15.00',
                                            'start_date': (today + timedelta(days=1)).isoformat()}, by=by, send=False)
            offers.sign(offer, name=f'{first} {last}', signature=_signature(), acks=[True] * len(offer.acknowledgments),
                        consent=True, ip='127.0.0.1', user_agent='seed_hiring_demo')
            start = today - timedelta(days=started_days_ago)
            type(offer).objects.filter(pk=offer.pk).update(start_date=start)
            app.refresh_from_db()
            services.create_employee(app, by=by, request=None, pay_rate='15.00', start_date=start, position=job.title)
            app.refresh_from_db()
            row, _ = onboarding.start(user=app.employee_user, by=by, start_date=start, manager=manager, job=job,
                                      application=app, send_email=False)
            return app, row

        def tick(row, keys):
            for task in row.tasks.filter(key__in=keys):
                if task.kind == 'count':
                    onboarding.set_task(task, by=by, status=OnboardingTask.STATUS_DONE, data={'count': 2, 'size': 'L'})
                elif task.kind in ('tick',):
                    onboarding.set_task(task, by=by, status=OnboardingTask.STATUS_DONE)
                else:
                    onboarding.set_task(task, by=by, status=OnboardingTask.STATUS_SKIPPED, note='Seed data')

        def sign_checkin(c, *, going_well, rating):
            form = checkins.form_of(c)
            checkins.save(c, answers={
                'questions': {q['key']: going_well if q['key'] == 'going_well' else 'Seed answer.'
                              for q in form['questions']},
                'areas': {a: {'rating': rating, 'note': ''} for a in form['areas']},
            }, employee_comments='Glad to be here.')
            checkins.sign(c, manager_name=(manager.full_name if manager else 'Manager'), manager_signature=_signature(),
                          employee_name=c.user.full_name, employee_signature=_signature(), acknowledged=True, by=by,
                          ip='127.0.0.1', user_agent='seed_hiring_demo')

        j = lambda i: jobs[i % len(jobs)]  # noqa: E731

        # Applicants in every stage
        applicant('Avery', 'Newman', j(0), days_ago=0)
        applicant('Blake', 'Reviewer', j(1), stage='reviewed', days_ago=2, raw={'lifting': 'no'}, rating=3)
        casey = applicant('Casey', 'Contacted', j(2), stage='contacted', days_ago=4, texts_ok=True)
        interviews.ensure_link(casey)
        drew = applicant('Drew', 'Booked', j(0), stage='interview_scheduled', days_ago=5, texts_ok=True)
        interviews.ensure_link(drew)
        booked = interview(drew, j(0), _next_weekday(today + timedelta(days=1), 10))
        from apps.hiring import texts

        texts.send(drew, 'interview_booked', values=texts.interview_values(booked))  # held until texting is live
        emery = applicant('Emery', 'Interviewed', j(1), stage='interviewed', days_ago=8, rating=4, texts_ok=True)
        interview(emery, j(1), timezone.now() - timedelta(days=2), done=True)
        finley = applicant('Finley', 'Offered', j(0), stage='interviewed', days_ago=10, rating=5)
        interview(finley, j(0), timezone.now() - timedelta(days=4), done=True)
        offers.make(finley, {'job': j(0).pk, 'pay_rate': '16.00', 'start_date': (today + timedelta(days=7)).isoformat()},
                    by=by, send=False)
        gray = applicant('Gray', 'Notnow', j(2), stage='reviewed', days_ago=6, raw={'transportation': 'no'})
        services.mark_not_now(gray, reason='must_have', note='No ride to the store.', send=False, subject='', body='',
                              by=by)
        services.create_practice(job=j(1), first_name='Practice', email='', by=by)

        # Three hires at different points
        _, harper = hire('Harper', 'Hired', j(0), started_days_ago=3)
        tick(harper, ['quickbooks_added', 'time_clock', 'team_intro', 'shirts'])
        _, jordan = hire('Jordan', 'Thirty', j(1), started_days_ago=31)
        tick(jordan, ['quickbooks_added', 'i9_section1', 'quickbooks_setup', 'time_clock', 'team_intro', 'shirts',
                      'trained', 'new_hire_report', 'i9_section2', 'handbook', 'kiosk_badge', 'schedule'])
        _, morgan = hire('Morgan', 'Ninety', j(2), started_days_ago=92)
        for c in morgan.checkins.filter(day__lt=90).order_by('day'):
            sign_checkin(c, going_well=f'Settled in well by day {c.day}.', rating='Doing well')
        tick(morgan, [t.key for t in morgan.tasks.all()])

        # The practice run is made by Dash itself; give it the seed domain so --clear finds it.
        Application.objects.filter(is_practice=True, first_name='Practice', email='').update(
            email=f'practice.applicant@{DOMAIN}')
        return (f'{Application.objects.filter(email__iendswith="@" + DOMAIN).count()} applicants, '
                f'3 hires with onboarding and check-ins')
