"""AI help for hiring, run in the background (Heroku cuts a request off at 30 seconds; a model can take longer).

Three kinds of edit, each started from a button, never a chat:
- ``job``: one role's page sections, application question(s) and interview questions;
- ``email``: one email (subject and body);
- ``careers``: the whole careers file (the old Ask AI).

Each run is a ``HiringAiJob`` row. Dash starts it, then polls until it is done. Nothing here saves:
the result fills the editor, and the person presses Save.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from datetime import timedelta

from django.db import close_old_connections, connections
from django.utils import timezone

from apps.hiring import careers
from apps.hiring.models import HiringAiJob

logger = logging.getLogger(__name__)

PURPOSE = 'HIRING_CAREERS'
STALE_AFTER = timedelta(minutes=6)

ACTIONS = {
    'polish': 'Polish it: fix grammar and flow, tighten the wording, keep the meaning and about the same length.',
    'shorter': 'Make it shorter and punchier: cut about a third, keep every important point.',
    'fuller': 'Make it fuller: add concrete detail a good applicant would want to know, plain and honest, about a third longer.',
    'warmer': 'Make it warmer and more welcoming, still direct and honest.',
    'voice': ("Rewrite it in the owner's voice: short sentences, warm, direct, plain words, "
              "\"we're a small team with a big dream\". No corporate words."),
    'custom': 'Make the change described below.',
    # Interview questions (2026-10-12): the whole list, as a set.
    'review': ('Review the whole list: keep the strong questions, reword weak or vague ones, merge or drop repeats, '
               'and add what is missing to judge someone for this role.'),
}

JOB_TEXT_FIELDS = ('tagline', 'summary')
# Interview questions have their own list editor and AI (work_questions, 2026-10-12).
JOB_LIST_FIELDS = ('duties', 'success', 'looking_for', 'nice_to_have', 'physical', 'questions')

PLACEHOLDER = re.compile(r'\{([a-z_]+)\}')
ALL_PLACEHOLDERS = {
    'first_name', 'last_name', 'roles', 'phone', 'email', 'review_day', 'reply_days', 'flags', 'dash_link',
    'when', 'place', 'interviewer', 'link', 'link_days', 'length', 'applicant', 'action',
}
OFFER_PLACEHOLDERS = {
    'first_name', 'full_name', 'role', 'pay_rate', 'employment_type', 'start_date', 'start_time', 'schedule',
    'supervisor', 'respond_by', 'note', 'offer_date', 'signer_name', 'signer_title',
}


FIRST_DAY_PLACEHOLDERS = {'first_name', 'role', 'start_date', 'start_time', 'supervisor', 'place'}


def allowed_placeholders(key: str) -> set[str]:
    if key == 'first_day':
        return FIRST_DAY_PLACEHOLDERS
    if key == 'offer_letter':
        return OFFER_PLACEHOLDERS
    if key == 'offer_notice':
        return OFFER_PLACEHOLDERS | {'applicant', 'action', 'reason', 'dash_link', 'link'}
    if key.startswith('offer_'):
        return OFFER_PLACEHOLDERS | {'link'}
    if key in ('alert', 'interview_notice'):
        return ALL_PLACEHOLDERS
    return ALL_PLACEHOLDERS - {'flags', 'dash_link', 'applicant', 'action'}

EMAIL_HELP = {
    'received': 'the auto-reply to an applicant right after they apply',
    'alert': 'the alert to the owner and the hiring manager about a new application',
    'interview_invite': 'the email with the private link to pick an interview time',
    'interview_nudge': 'the optional "don\'t miss out" reminder to an applicant who has the link but has not booked',
    'interview_booked': "the applicant's confirmation after booking an interview",
    'interview_changed': "the applicant's notice that their interview moved",
    'interview_cancelled': "the applicant's notice that their interview is cancelled",
    'interview_reminder': 'the reminder the day before the interview',
    'interview_notice': 'the notice to the interviewer and hiring manager about a booked, moved or cancelled interview',
    'not_now.default': 'the "not now" email to an applicant we are not moving forward with',
    'not_now.withdrew': 'the reply when an applicant withdraws',
    'not_now.position_closed': 'the "position filled" email',
    'not_now.no_show': 'the email after an applicant missed their interview',
    'offer_letter': ('the job offer letter the applicant signs with a finger on a phone. Keep the at-will '
                     'paragraph and the Form I-9 condition in substance; keep it to one printed page'),
    'offer_sent': 'the email with the private link to read and sign the job offer',
    'offer_signed': 'the welcome email to a new hire after they sign the offer (the signed PDF is attached)',
    'offer_notice': 'the notice to the owner and hiring manager that an offer was signed or declined',
    'first_day': ('the first-day email to a new hire: when and where, who to ask for, what to wear, and the I-9 '
                  'documents to bring (List A, or List B plus List C)'),
}

_HOUSE_RULES = (
    'Eco-Thrift is a small thrift and liquidation store, one location: the Canfield store at 8425 West Center '
    'Road, Omaha, Nebraska. Mission: Another Chance for Everything and Everyone. Bill is the owner. '
    'Never invent pay, perks or benefits. Never ask about age (except 18+), race, religion, national origin, '
    'citizenship (only "authorized to work in the US"), marital or family status, pregnancy, disability or health, '
    'arrests or criminal history. Plain words, short sentences, warm and direct.'
)


# ── Running jobs ────────────────────────────────────────────────────────────


def start(kind: str, params: dict, *, user) -> HiringAiJob:
    job = HiringAiJob.objects.create(kind=kind, params=params, created_by=user)
    _spawn(job.pk)
    return job


def _spawn(job_id) -> None:
    """Run in a thread so the request returns at once. (Tests replace this to run inline.)"""
    threading.Thread(target=_run, args=(job_id,), name=f'hiring-ai-{job_id}', daemon=True).start()


def _run(job_id) -> None:
    close_old_connections()
    try:
        _work(job_id)
    finally:
        connections.close_all()


def _work(job_id) -> None:
    job = HiringAiJob.objects.get(pk=job_id)
    try:
        result, model = WORK[job.kind](job.params)
        job.status, job.result, job.model = HiringAiJob.STATUS_DONE, result, model
    except Exception as exc:  # noqa: BLE001 - the error is shown to the person
        logger.exception('Hiring AI job %s failed', job_id)
        job.status, job.error = HiringAiJob.STATUS_FAILED, str(exc)[:2000] or exc.__class__.__name__
    job.finished_at = timezone.now()
    job.save(update_fields=['status', 'result', 'model', 'error', 'finished_at'])


def poll(job: HiringAiJob) -> HiringAiJob:
    """A run whose thread died (the dyno restarted) is marked failed instead of spinning forever."""
    if job.status == HiringAiJob.STATUS_RUNNING and timezone.now() - job.created_at > STALE_AFTER:
        job.status = HiringAiJob.STATUS_FAILED
        job.error = 'The AI run stopped (the server restarted). Try again.'
        job.finished_at = timezone.now()
        job.save(update_fields=['status', 'error', 'finished_at'])
    return job


# ── The model call ──────────────────────────────────────────────────────────


def _ask(system: str, user: str, params: dict, *, max_tokens: int) -> tuple[str, str]:
    from apps.core.services.llm_router import llm_chat_text

    return llm_chat_text(
        purpose=PURPOSE, system=system, user=user, max_tokens=max_tokens, timeout=240,
        model_override=(params.get('model') or None), effort=(params.get('effort') or None),
        log_source='hiring.ai',
    )


def json_from(text: str):
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


def _what_to_do(params: dict) -> str:
    action = ACTIONS.get(params.get('action') or 'polish', ACTIONS['polish'])
    note = (params.get('instruction') or '').strip()[:2000]
    return action + (f'\nAlso: {note}' if note else '')


# ── One role ────────────────────────────────────────────────────────────────


def _lines(value) -> list[str]:
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if isinstance(item, dict):
            item = item.get('label') or ''
        item = str(item).strip().lstrip('-•').strip()
        if item:
            out.append(item[:300])
    return out


def work_job(params: dict) -> tuple[dict, str]:
    fields = params.get('fields') or {}
    current = {key: str(fields.get(key) or '').strip() for key in JOB_TEXT_FIELDS}
    current.update({key: _lines(fields.get(key)) for key in JOB_LIST_FIELDS})
    context = {k: str(fields.get(k) or '') for k in ('title', 'schedule', 'hours', 'pay_text', 'works_with')}
    system = (
        "You edit one job posting on Eco-Thrift's careers page. " + _HOUSE_RULES + '\n'
        'The page has: tagline (one line), summary ("About the role", 2-3 sentences: what it is and why it '
        'matters), duties ("What you\'ll do", 6-8 concrete bullets), success ("What great looks like", 3 bullets '
        'a strong performer hits, the kind of person who could grow into the area lead), looking_for ("What we\'re '
        'looking for", 4-5 qualities, no degrees or years of experience), nice_to_have (2-3), physical ("The '
        'physical side": the real demands, with "with or without accommodation" on lifting), questions (the '
        "application question(s) only for this role, 1-2), interview_questions (5-6 questions to ask in person).\n"
        'Return JSON only, exactly these keys: tagline, summary, duties, success, looking_for, nice_to_have, '
        'physical, questions, interview_questions. Lists are arrays of strings. Change only what the request '
        'asks; keep everything else exactly as it is.'
    )
    user = (f'The role: {json.dumps(context)}\n\nThe current text:\n{json.dumps(current, indent=2)}\n\n'
            f'What to do:\n{_what_to_do(params)}')
    text, model = _ask(system, user, params, max_tokens=6000)
    raw = json_from(text)
    if not isinstance(raw, dict):
        raise ValueError('The AI answer was not usable. Try again.')
    proposed = {key: str(raw.get(key, current[key]) or '').strip()[:4000] for key in JOB_TEXT_FIELDS}
    proposed.update({key: _lines(raw.get(key, current[key])) for key in JOB_LIST_FIELDS})
    changed = [key for key in (*JOB_TEXT_FIELDS, *JOB_LIST_FIELDS) if proposed[key] != current[key]]
    return {'fields': proposed, 'changed': changed}, model


# ── One email ───────────────────────────────────────────────────────────────


def work_email(params: dict) -> tuple[dict, str]:
    key = params.get('key') or ''
    subject = str(params.get('subject') or '').strip()
    body = str(params.get('body') or '').strip()
    used = set(PLACEHOLDER.findall(subject + body))
    allowed = sorted(allowed_placeholders(key))
    role = (params.get('role_title') or '').strip()
    system = (
        "You edit one plain-text email Eco-Thrift sends about hiring. " + _HOUSE_RULES + '\n'
        f'This email is {EMAIL_HELP.get(key, "a hiring email")}' + (f', for the {role} role' if role else '') + '.\n'
        f'Placeholders in curly braces are filled in when it is sent. You may use only: '
        f'{", ".join("{" + p + "}" for p in allowed)}. Keep the ones it already uses unless asked. '
        'No markdown, no emoji. Keep the sign-off lines at the end.\n'
        'Return JSON only: {"subject": "...", "body": "..."} with \\n for new lines.'
    )
    user = f'Subject: {subject}\n\nBody:\n{body}\n\nWhat to do:\n{_what_to_do(params)}'
    text, model = _ask(system, user, params, max_tokens=3000)
    raw = json_from(text)
    if not isinstance(raw, dict) or not raw.get('subject') or not raw.get('body'):
        raise ValueError('The AI answer was not usable. Try again.')
    new_subject, new_body = str(raw['subject']).strip()[:200], str(raw['body']).strip()[:6000]
    new_used = set(PLACEHOLDER.findall(new_subject + new_body))
    warnings = []
    unknown = sorted(new_used - set(allowed))
    if unknown:
        warnings.append('It used placeholders that don\'t exist here: ' + ', '.join('{' + p + '}' for p in unknown)
                        + '. Fix them before saving.')
    dropped = sorted(used - new_used)
    if dropped:
        warnings.append('It dropped: ' + ', '.join('{' + p + '}' for p in dropped) + '.')
    return {'subject': new_subject, 'body': new_body, 'warnings': warnings}, model


# ── The whole careers file ──────────────────────────────────────────────────


def work_careers(params: dict) -> tuple[dict, str]:
    from apps.hiring.views import careers_brief

    current = json.dumps(careers.export_doc(), indent=2, default=str)
    indexes = json.dumps(careers.indexes(), indent=2, default=str)
    system = careers_brief() + '\nReturn JSON only (no YAML, no prose): the whole careers file.'
    user = f'Indexes:\n{indexes}\n\nThe current file:\n{current}\n\nWhat to do:\n{(params.get("request") or "")[:4000]}'
    text, model = _ask(system, user, params, max_tokens=12000)
    doc = json_from(text)
    if doc is None:
        raise ValueError('The AI answer was not a file. Try again or rephrase.')
    result = careers.check_doc(doc)
    changes = careers.summarize_changes(careers.export_doc(), result['doc']) if result['ok'] else []
    return {**result, 'raw': doc, 'changes': changes}, model


# ── One role's interview questions (2026-10-12) ─────────────────────────────

QUESTIONS_TOOL = 'propose_interview_questions'
QUESTIONS_SCHEMA = {
    'name': QUESTIONS_TOOL,
    'description': "The role's whole interview question list after your changes, in the order to ask them.",
    'input_schema': {
        'type': 'object',
        'properties': {
            'questions': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'key': {'type': 'string', 'description': "The existing question's key when you keep or reword it; "
                                                                 'empty for a new question.'},
                        'label': {'type': 'string', 'description': 'The question as the interviewer reads it aloud.'},
                        'why': {'type': 'string', 'description': 'One short line: why you changed or added it (empty if kept).'},
                    },
                    'required': ['key', 'label'],
                },
            },
            'removed': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {'key': {'type': 'string'}, 'why': {'type': 'string'}},
                    'required': ['key'],
                },
            },
            'summary': {'type': 'string', 'description': 'One or two sentences on what you changed.'},
        },
        'required': ['questions', 'removed', 'summary'],
    },
}

QUESTIONS_SYSTEM = """You help the owner of Eco-Thrift (a thrift and liquidation store in Omaha) keep a short, strong list \
of interview questions for one role. The interviewer reads each question aloud and rates the answer 1 to 5.

Rules:
- Return the whole list after your changes with the tool, in the order to ask them. 5 to 8 questions.
- Keep a question's key when you keep it or reword it. A new question gets an empty key. Put every question you
  drop under "removed" with a short why.
- One clear sentence each, plain words, open questions (not yes or no), about real work in this role.
- Never ask about age, family, children, pregnancy, religion, health, disability, national origin, citizenship,
  arrest record, or anything else the law protects.
- Do only what the request asks. When asked to review, change only what needs it."""


def _ask_tool(system: str, user: str, params: dict, *, schema: dict, max_tokens: int) -> tuple[dict, str]:
    from apps.core.services.llm_router import llm_chat_tool_input

    return llm_chat_tool_input(
        purpose=PURPOSE, system=system, user=user, tool_name=schema['name'], tools=[schema], max_tokens=max_tokens,
        timeout=240, model_override=(params.get('model') or None), effort=(params.get('effort') or None),
        log_source='hiring.ai', log_detail='interview_questions',
    )


def work_questions(params: dict) -> tuple[dict, str]:
    """The AI's whole list, checked: each item marked keep / edit / new against the current list, and the dropped
    ones listed. The person accepts all of it or item by item; nothing saves here."""
    current = [
        {'key': str(q.get('key') or ''), 'label': str(q.get('label') or '').strip()}
        for q in (params.get('questions') or []) if isinstance(q, dict) and str(q.get('label') or '').strip()
    ]
    by_key = {q['key']: q for q in current if q['key']}
    role = params.get('role') or {}
    user = (
        f"Role: {role.get('title') or 'a role'}\n"
        f"About the role: {role.get('summary') or ''}\n"
        f"Duties: {'; '.join(_lines(role.get('duties')))}\n"
        f"Looking for: {'; '.join(_lines(role.get('looking_for')))}\n\n"
        f'Current interview questions (key: question):\n'
        + ('\n'.join(f"{q['key']}: {q['label']}" for q in current) or '(none yet)')
        + f'\n\nWhat to do: {_what_to_do(params)}'
    )
    raw, model = _ask_tool(QUESTIONS_SYSTEM, user, params, schema=QUESTIONS_SCHEMA, max_tokens=2500)
    out, seen = [], set()
    for item in raw.get('questions') or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get('label') or '').strip()[:300]
        if not label:
            continue
        key = str(item.get('key') or '').strip()
        if key not in by_key or key in seen:
            key = ''
        if key:
            seen.add(key)
        change = 'new' if not key else ('keep' if by_key[key]['label'] == label else 'edit')
        out.append({'key': key, 'label': label, 'change': change, 'was': by_key[key]['label'] if key else '',
                    'why': str(item.get('why') or '').strip()[:200]})
    why_removed = {str(r.get('key') or ''): str(r.get('why') or '').strip()[:200]
                   for r in raw.get('removed') or [] if isinstance(r, dict)}
    removed = [{'key': q['key'], 'label': q['label'], 'why': why_removed.get(q['key'], '')}
               for q in current if q['key'] and q['key'] not in seen]
    if not out:
        raise ValueError('The AI returned no questions. Try again.')
    return {'questions': out, 'removed': removed, 'summary': str(raw.get('summary') or '').strip()[:500]}, model


WORK = {
    HiringAiJob.KIND_QUESTIONS: work_questions,
    HiringAiJob.KIND_JOB: work_job,
    HiringAiJob.KIND_EMAIL: work_email,
    HiringAiJob.KIND_CAREERS: work_careers,
}
