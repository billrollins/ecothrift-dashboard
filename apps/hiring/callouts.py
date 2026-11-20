"""Heads-up flags on an application, and the invite paragraphs that call them out (Bill, 2026-11-19, Dash #184).

Worked out from the answers against the roles applied for, each time they are shown (nothing stored):

- ``pay``: asks more than the role's start pay (``Job.pay_min``). "$22", "15.50", "$18-20" (the low end counts).
- ``hours``: hours a week outside the role's hours ("Up to 40 hours a week", "25-35", or full / part time).
- ``days``: fewer than 3 of the role's days, when its schedule names them ("Typically Monday through Friday").
- ``start``: a start date more than ``LATE_START_DAYS`` after they applied, only when the answer is clear.
- ``must_have``: a must-be yes/no answer that missed (transport, lifting, 18+, authorized; also ``red_flags``).

A flag is a heads-up and never blocks. With more than one role, a flag shows only when no role fits. The invite gets
one ready paragraph per flag (the careers file's ``email.flag_notes``, filled in here); the review lets staff untick,
edit or add lines before it goes.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

LATE_START_DAYS = 21
MIN_DAYS = 3
FULL_TIME_HOURS = 30  # a full-time role wants at least this; a part-time one at most this
KINDS = ('pay', 'hours', 'days', 'start', 'must_have')

_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
_DAY_WORD = (r'(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)'
             r'\b\.?')
_DAY_RANGE = re.compile(_DAY_WORD + r'\s*(?:-|\u2013|\u2014|to|through|thru)\s*' + _DAY_WORD, re.I)
_DAY_ONE = re.compile(r'\b' + _DAY_WORD, re.I)
_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


def money(value) -> str:
    """$15, $15.50."""
    value = Decimal(str(value))
    return f'${value:,.0f}' if value == value.to_integral_value() else f'${value:,.2f}'


# ── Reading the answers ─────────────────────────────────────────────────────


def parse_pay(text) -> tuple[Decimal, Decimal] | None:
    """The hourly pay asked for, as (low, high): "$20" → 20-20, "$15-$22 (…)" → 15-22. None when there is no
    hourly number in it ("Open", "negotiable", "40k a year")."""
    if text is None:
        return None
    raw = str(text).lower().replace(',', '')
    if re.search(r'\d\s*k\b|year|annual|salary', raw):
        return None
    numbers = []
    for found in re.findall(r'\d+(?:\.\d{1,2})?', raw):
        try:
            number = Decimal(found)
        except InvalidOperation:
            continue
        if 7 <= number <= 100:
            numbers.append(number)
    return (min(numbers), max(numbers)) if numbers else None


def _hours_wanted(value) -> float | None:
    try:
        hours = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return hours if 0 < hours <= 80 else None


def job_hours(job) -> tuple[float | None, float | None]:
    """(fewest, most) hours a week the role takes: its hours text first, then full / part time."""
    text = (job.hours or '').lower()
    numbers = [float(n) for n in re.findall(r'\d+(?:\.\d+)?', text)]
    low = high = None
    if len(numbers) >= 2:
        low, high = min(numbers[:2]), max(numbers[:2])
    elif numbers:
        if re.search(r'up to|max|no more than|under|or less', text):
            high = numbers[0]
        elif re.search(r'at least|min|or more|\+', text):
            low = numbers[0]
    if job.employment_type == 'full_time' and low is None:
        low = FULL_TIME_HOURS
    if job.employment_type == 'part_time' and high is None:
        high = FULL_TIME_HOURS
    return low, high


def _hours_text(job) -> str:
    if (job.hours or '').strip():
        text = job.hours.strip()
        return text[0].lower() + text[1:]
    return {'full_time': 'full time', 'part_time': 'part time'}.get(job.employment_type, 'full or part time')


def _day_index(word: str) -> int:
    return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].index(word.lower()[:3])


def job_days(job) -> list[str] | None:
    """The days the role's schedule names ("Monday through Friday", "Mon-Sat", "weekdays"), or None ("Flexible")."""
    text = job.schedule or ''
    picked: set[int] = set()
    for start, end in _DAY_RANGE.findall(text):
        a, b = _day_index(start), _day_index(end)
        picked.update(range(a, b + 1) if a <= b else [*range(a, 7), *range(0, b + 1)])
    rest = _DAY_RANGE.sub(' ', text)
    picked.update(_day_index(word) for word in _DAY_ONE.findall(rest))
    if re.search(r'weekdays', text, re.I):
        picked.update(range(5))
    if re.search(r'weekends', text, re.I):
        picked.update((5, 6))
    return [_DAY_NAMES[i] for i in sorted(picked)] or None


def _days_span(days: list[str]) -> str:
    """Monday..Friday → "Mon\u2013Fri"; a list that is not a run → "Mon, Wed, Fri"."""
    index = [_DAY_NAMES.index(d) for d in days]
    if len(index) > 2 and index == list(range(index[0], index[-1] + 1)):
        return f'{days[0][:3]}\u2013{days[-1][:3]}'
    return ', '.join(d[:3] for d in days)


def _join(words: list[str]) -> str:
    return words[0] if len(words) == 1 else ', '.join(words[:-1]) + ' and ' + words[-1]


_NUMBER_WORDS = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'eight': 8}


def parse_start(text, applied: date) -> tuple[date, str] | None:
    """When they can start, as (the date, short words for it), only when it is clear. "ASAP", "Monday", a date
    already past or a guess are None (not flagged)."""
    if text is None:
        return None
    raw = str(text).strip().lower()
    if not raw or re.search(r'asap|immediate|right away|\bnow\b|today|tomorrow|any ?time|whenever', raw):
        return None
    found = re.search(r'\b(\d+|an?|one|two|three|four|five|six|eight)\s*(week|wk|month|mo)s?\b', raw)
    if found:
        count = int(found.group(1)) if found.group(1).isdigit() else _NUMBER_WORDS[found.group(1)]
        unit = 'week' if found.group(2) in ('week', 'wk') else 'month'
        days = count * (7 if unit == 'week' else 30)
        return applied + timedelta(days=days), f'in {count} {unit}{"s" if count != 1 else ""}'
    year = None
    found = re.search(r'\b(' + '|'.join(_MONTHS) + r')[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4}))?', raw)
    if found:
        month, day = _MONTHS.index(found.group(1)) + 1, int(found.group(2))
        year = int(found.group(3)) if found.group(3) else None
    else:
        found = re.search(r'\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b', raw)
        if not found:
            return None
        month, day = int(found.group(1)), int(found.group(2))
        if found.group(3):
            year = int(found.group(3)) + (2000 if len(found.group(3)) == 2 else 0)
    try:
        if year is not None:
            when = date(year, month, day)
        else:
            when = date(applied.year, month, day)
            if when < applied - timedelta(days=180):  # "January 10" written in December
                when = date(applied.year + 1, month, day)
    except ValueError:
        return None
    if when < applied:
        return None
    return when, when.strftime('%b ') + str(when.day)


# ── The flags ───────────────────────────────────────────────────────────────


def _answers(application) -> dict:
    return {a.get('key'): a.get('answer') for a in application.answers or [] if isinstance(a, dict)}


def flags(application, jobs=None) -> list[dict]:
    """``[{key, kind, label, values}]``: ``label`` is the chip ("Asks $22 (starts at $15)"); ``values`` fill the
    invite paragraph."""
    jobs = list(application.jobs.all()) if jobs is None else list(jobs)
    answers = _answers(application)
    out: list[dict] = []

    asked = parse_pay(answers.get('pay_wanted'))
    starts = [job.pay_min for job in jobs if job.pay_min is not None]
    if asked and starts and asked[0] > max(starts):
        start = max(starts)
        asked_text = money(asked[0]) if asked[0] == asked[1] else f'{money(asked[0])}\u2013{money(asked[1])}'
        out.append({'key': 'pay', 'kind': 'pay', 'label': f'Asks {asked_text} (starts at {money(start)})', 'short': asked_text,
                    'values': {'asked': asked_text, 'start_pay': money(start)}})

    hours = _hours_wanted(answers.get('hours_per_week'))
    if hours is not None and jobs:
        def fits(job):
            low, high = job_hours(job)
            return (low is None or hours >= low) and (high is None or hours <= high)

        if not any(fits(job) for job in jobs):
            job = jobs[0]
            low, high = job_hours(job)
            short = (f'up to {high:g}' if low is None else f'{low:g}+' if high is None else f'{low:g}\u2013{high:g}')
            out.append({'key': 'hours', 'kind': 'hours', 'label': f'Wants {hours:g} hrs ({short})', 'short': f'{hours:g}h',
                        'values': {'hours_wanted': f'{hours:g}', 'job_hours': _hours_text(job)}})

    days = answers.get('days')
    if isinstance(days, list) and days:
        needed = [(job, job_days(job)) for job in jobs]
        needed = [(job, d) for job, d in needed if d]
        if needed and len(needed) == len(jobs):
            def short_of(d):
                return len([x for x in days if x in d]) < min(MIN_DAYS, len(d))

            if all(short_of(d) for _, d in needed):
                job, wanted = needed[0]
                fit = len([x for x in days if x in wanted])
                schedule = job.schedule.strip()
                out.append({'key': 'days', 'kind': 'days', 'label': f'Days: {fit} of {_days_span(wanted)}', 'short': 'Days',
                            'values': {'days_wanted': _join([d for d in _DAY_NAMES if d in days]),
                                       'job_days': schedule[0].lower() + schedule[1:]}})

    applied = (application.created_at.date() if getattr(application, 'created_at', None) else date.today())
    start = parse_start(answers.get('start_date'), applied)
    if start and (start[0] - applied).days > LATE_START_DAYS:
        out.append({'key': 'start', 'kind': 'start', 'label': f'Starts {start[1]}', 'short': 'Late start',
                    'values': {'start_wanted': str(answers.get('start_date')).strip()}})

    for answer in application.answers or []:
        if isinstance(answer, dict) and answer.get('must_be') and answer.get('ok') is False:
            name = answer.get('flag_label') or answer.get('label')
            out.append({'key': f'must_have.{answer["key"]}', 'kind': 'must_have', 'label': f'{name}: {answer.get("answer")}', 'short': name,
                        'values': {'question': answer.get('label') or name, 'answer': str(answer.get('answer'))}})
    return out


def chips(application, jobs=None) -> list[dict]:
    """The flags for the screen: ``[{key, kind, label, short}]`` (``short``: the mark in the list, "$22")."""
    return [{k: f[k] for k in ('key', 'kind', 'label', 'short')} for f in flags(application, jobs)]


# ── The invite paragraphs ───────────────────────────────────────────────────


def _level_values() -> dict:
    from apps.accounts.services import pay_levels

    table = pay_levels.ranges()
    return {'entry_pay': money(table['entry']['min']), 'senior_pay': money(table['senior']['min']),
            'lead_pay': money(table['manager']['min'])}


def invite_notes(application) -> dict | None:
    """``{heading, items: [{key, kind, label, text}]}`` for the interview invite. No flags: no items (the review
    still lets staff add a line of their own)."""
    from apps.hiring.careers import DEFAULT_FLAG_NOTES, fill, load_setting

    found = flags(application)
    words = {**DEFAULT_FLAG_NOTES, **(load_setting()['email'].get('flag_notes') or {})}
    heading = (words.get('heading') or DEFAULT_FLAG_NOTES['heading']).strip()
    if not found:
        return {'heading': heading, 'items': []}
    levels = _level_values()
    base = {'first_name': application.first_name, 'start_pay': levels['entry_pay'], **levels}
    items = []
    for flag in found:
        values = {**base, **flag['values']}
        text = fill(words.get(flag['kind']) or DEFAULT_FLAG_NOTES[flag['kind']], values).strip()
        items.append({'key': flag['key'], 'kind': flag['kind'], 'label': flag['label'], 'text': text})
    return {'heading': heading, 'items': items}


def insert(body: str, heading: str, texts: list[str]) -> str:
    """The section in the email: the heading and one paragraph per line, just before the paragraph with the
    interview link (else before the sign-off). No lines → the body as it is."""
    texts = [t.strip() for t in texts if t and t.strip()]
    if not texts:
        return body
    section = '\n\n'.join(([heading.strip()] if heading and heading.strip() else []) + texts)
    at = body.find('{link}')
    if at < 0:
        at = body.rstrip().rfind('\n\n')
        if at < 0:
            return body.rstrip() + '\n\n' + section
        return body[:at + 2] + section + '\n\n' + body[at + 2:]
    para = body.rfind('\n\n', 0, at)
    if para < 0:
        return section + '\n\n' + body
    return body[:para + 2] + section + '\n\n' + body[para + 2:]
