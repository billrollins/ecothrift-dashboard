"""AI review of an incident report (Bill, Dash Updates #133, 2026-11-13): HR -> Incidents -> a report -> AI review.

The AI (house router; Settings > AI purpose ``INCIDENT_REVIEW``, Spark Contributor when nothing is picked) tidies the
wording of the report's text boxes and lists questions where a fact is missing or unclear (who, when, where, injuries,
witnesses, cameras). It never adds a fact: it may only reword what is there, and a tidied box that brings in a number
the original does not have, or grows much longer, is dropped.

Nothing changes on the report until a person decides. The review is kept as an ``IncidentNote`` of kind ``ai_review``
whose ``changes`` hold::

    {"model": "...", "done": false,
     "fields": {"what_happened": {"old": "...", "new": "...", "choice": "" | "kept" | "reverted"}},
     "questions": [{"field": "witnesses", "question": "...", "answer": ""}]}

Keep puts the tidied text in, Revert puts the original back; each change is an ordinary edit in the history, so the
original text is always there. An answer to a question is added to that question's box as its own line.
"""
from __future__ import annotations

import json
import re
import time

from django.db import transaction
from django.utils import timezone

from .models import IncidentNote, IncidentReport

PURPOSE = 'INCIDENT_REVIEW'
SOURCE = 'hr.incident_review'
DEFAULT_MODEL = 'muse-spark-1.3-contributor'
DEFAULT_EFFORT = 'low'
MAX_QUESTIONS = 6
# The boxes the AI may tidy, with the most each one holds (the write serializer's limits).
TEXT_LIMITS = {
    'place_detail': 200,
    'what_happened': 6000,
    'injuries': 3000,
    'witnesses': 3000,
    'cameras': 300,
    'follow_up': 3000,
}
FIELDS = tuple(TEXT_LIMITS)

WORDS = {
    'kept': {'en': 'AI review: kept the tidied wording', 'es': 'Revisión con IA: se mantuvo el texto arreglado'},
    'reverted': {'en': 'AI review: back to the original wording', 'es': 'Revisión con IA: se regresó al texto original'},
    'answer': {'en': 'Answer to the AI review', 'es': 'Respuesta a la revisión con IA'},
}


class ReviewError(Exception):
    """Plain words for the person; the report is unchanged."""


def _words(key: str, lang: str) -> str:
    return WORDS[key]['es' if lang == 'es' else 'en']


def review_model() -> tuple[str, str]:
    """(model id, effort): Settings > AI when a model is picked for INCIDENT_REVIEW, else Spark Contributor."""
    from apps.core.ai_config import ai_effort, ai_model, settings_model

    model_id = ai_model(PURPOSE)
    if model_id == settings_model(PURPOSE):  # nothing picked in Settings > AI
        return DEFAULT_MODEL, DEFAULT_EFFORT
    effort = ai_effort(PURPOSE)
    return model_id, DEFAULT_EFFORT if effort == 'off' else effort


SYSTEM = """You review an incident report a thrift store worker wrote on a phone right after something happened on site.
Two jobs. Call the tool `review_incident`.

1. Tidy the wording of each text box: fix spelling, grammar, punctuation and word order; turn shorthand into plain
   sentences; keep it short, plain and in the order it happened. Keep the language it was written in (English or
   Spanish). Return every box you were given, tidied, or exactly as given when it needs nothing.
   NEVER add a fact. Do not add names, times, numbers, places, causes, injuries, feelings or guesses that are not in
   the words given. Do not move facts between boxes. Do not judge who was at fault. Do not soften or strengthen what
   happened. If you are unsure what a word means, leave it as written and ask about it instead.
   An empty box stays empty.

2. List questions where a fact the store would need later is missing or unclear: who was involved (names, contact),
   exactly when and where, what injuries and what help was given, who saw it (witnesses), which cameras may have it,
   what was damaged, what happens next. Ask only about what the report does not already say clearly (read the
   `facts` too). Each question names the box its answer belongs in (`field`), is short, plain and answerable in one
   line, and is written in the language given as `ask_in`. At most 6, most important first. No questions when the
   report is complete."""


def _tool() -> dict:
    return {
        'name': 'review_incident',
        'description': 'The tidied boxes and the questions.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'fields': {
                    'type': 'object',
                    'properties': {f: {'type': 'string'} for f in FIELDS},
                    'description': 'Each box given, tidied (or unchanged).',
                },
                'questions': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'field': {'type': 'string', 'enum': list(FIELDS)},
                            'question': {'type': 'string'},
                        },
                        'required': ['field', 'question'],
                    },
                },
            },
            'required': ['fields', 'questions'],
        },
    }


def _digits(text: str) -> set[str]:
    return set(re.findall(r'\d+', text or ''))


def _same(a: str, b: str) -> bool:
    return ' '.join((a or '').split()) == ' '.join((b or '').split())


def tidy_is_safe(old: str, new: str) -> bool:
    """A tidied box may only reword: no new numbers, not empty, and not much longer than what was written."""
    old, new = (old or '').strip(), (new or '').strip()
    if not old or not new:
        return False
    if _digits(new) - _digits(old):
        return False
    return len(new) <= len(old) * 1.4 + 60


def _facts(row: IncidentReport) -> dict:
    when = timezone.localtime(row.occurred_at)
    return {
        'kind': row.get_kind_display(),
        'place': row.get_place_display(),
        'when': f'{when:%A %B} {when.day}, {when:%I:%M %p}',
        'people': [{k: p.get(k, '') for k in ('role', 'name', 'contact')} for p in (row.people or [])],
        'first_aid_given': row.first_aid,
        'called_911': row.called_911,
        'photos': len(row.photos.all()),
        'spot_marked_on_store_map': row.map_pin_id is not None,
    }


def latest_review(row: IncidentReport) -> IncidentNote | None:
    """The report's open review (not finished with Done), or None."""
    for note in sorted(row.notes.all(), key=lambda n: (n.created_at, n.pk), reverse=True):
        if note.kind == IncidentNote.KIND_AI_REVIEW:
            return None if (note.changes or {}).get('done') else note
    return None


def review_payload(row: IncidentReport) -> dict | None:
    note = latest_review(row)
    if note is None:
        return None
    data = note.changes or {}
    fields = []
    for field in FIELDS:
        entry = (data.get('fields') or {}).get(field)
        if not entry:
            continue
        current = getattr(row, field)
        now = 'new' if current == entry['new'] else 'old' if current == entry['old'] else 'changed'
        fields.append({**entry, 'field': field, 'now': now})
    return {
        'id': note.pk,
        'created_at': note.created_at.isoformat(),
        'author_name': (getattr(note.author, 'full_name', '') or '').strip(),
        'fields': fields,
        'questions': [{**q, 'index': i} for i, q in enumerate(data.get('questions') or [])],
    }


def run_review(row: IncidentReport, user, *, lang: str = 'en') -> IncidentNote:
    """Ask the AI, keep its review on the report. Raises ReviewError (the report is unchanged)."""
    from apps.core.services.ai_usage_log import log_ai_usage
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

    boxes = {f: getattr(row, f) for f in FIELDS}
    if not any((v or '').strip() for v in boxes.values()):
        raise ReviewError('There is no writing to review yet.')
    model_id, effort = review_model()
    detail = f'Incident {row.pk}: AI review'
    content = json.dumps({
        'ask_in': 'Spanish' if lang == 'es' else 'English',
        'facts': _facts(row),
        'boxes': boxes,
    }, ensure_ascii=False)
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model_id, system=SYSTEM, messages=[{'role': 'user', 'content': content}],
            tools=[_tool()], tool_name='review_incident', max_tokens=4000, effort=effort, temperature=0.0,
            timeout=60.0, log_source=SOURCE, log_purpose=PURPOSE, log_detail=detail,
        )
    except (LLMAPIError, LLMConfigError) as exc:
        log_ai_usage(SOURCE, model_id, purpose=PURPOSE, user=user, duration_ms=int((time.monotonic() - started) * 1000),
                     detail=detail, success=False, error=str(exc)[:500])
        raise ReviewError('The AI could not review this report right now. Nothing was changed: try again in a minute.') from exc
    raw = result.tool_input
    if not isinstance(raw, dict):
        from apps.inventory.services.category_taxonomy import extract_json_object

        try:
            raw = extract_json_object(result.text or '')
        except Exception:  # noqa: BLE001 - nothing usable came back
            raw = None
    if not isinstance(raw, dict):
        raise ReviewError('The AI answer was not usable. Nothing was changed: try again.')

    tidied = raw.get('fields') if isinstance(raw.get('fields'), dict) else {}
    fields = {}
    for field in FIELDS:
        old = boxes[field] or ''
        new = str(tidied.get(field) or '').strip()[:TEXT_LIMITS[field]]
        if new and not _same(old, new) and tidy_is_safe(old, new):
            fields[field] = {'old': old, 'new': new, 'choice': ''}
    questions = []
    for q in raw.get('questions') if isinstance(raw.get('questions'), list) else []:
        if not isinstance(q, dict):
            continue
        text = ' '.join(str(q.get('question') or '').split())[:300]
        field = q.get('field') if q.get('field') in FIELDS else 'what_happened'
        if text and text not in [x['question'] for x in questions]:
            questions.append({'field': field, 'question': text, 'answer': ''})
        if len(questions) >= MAX_QUESTIONS:
            break

    with transaction.atomic():
        # One open review at a time: a new one closes the last.
        for old_note in IncidentNote.objects.select_for_update().filter(report=row, kind=IncidentNote.KIND_AI_REVIEW):
            if not (old_note.changes or {}).get('done'):
                old_note.changes = {**(old_note.changes or {}), 'done': True}
                old_note.save(update_fields=['changes'])
        return IncidentNote.objects.create(
            report=row, kind=IncidentNote.KIND_AI_REVIEW, author=user,
            changes={'model': result.model_used or model_id, 'done': False, 'fields': fields, 'questions': questions},
        )


def _apply(row: IncidentReport, changes: dict, user, body: str) -> None:
    for field, change in changes.items():
        setattr(row, field, change['new'])
    row.save()
    IncidentNote.objects.create(report=row, kind=IncidentNote.KIND_EDIT, changes=changes, author=user, body=body)


def decide(row: IncidentReport, note: IncidentNote, user, *, choice: str, field: str | None, lang: str = 'en') -> int:
    """Keep (the tidied text) or Revert (the original) one box, or every box when ``field`` is None.
    Returns how many boxes were skipped because someone changed them after the review."""
    if choice not in ('keep', 'revert'):
        raise ReviewError('Pick Keep or Revert.')
    data = note.changes or {}
    entries = data.get('fields') or {}
    targets = [field] if field else [f for f in FIELDS if f in entries]
    if field and field not in entries:
        raise ReviewError('That box is not in the review.')
    changes, skipped = {}, 0
    for f in targets:
        entry = entries[f]
        current = getattr(row, f)
        want, other = (entry['new'], entry['old']) if choice == 'keep' else (entry['old'], entry['new'])
        if current != want and current != other:
            if field:
                raise ReviewError('Someone changed this box after the review. Run the AI review again.')
            skipped += 1
            continue
        if current != want:
            changes[f] = {'old': current, 'new': want}
        entry['choice'] = 'kept' if choice == 'keep' else 'reverted'
    with transaction.atomic():
        if changes:
            _apply(row, changes, user, _words('kept' if choice == 'keep' else 'reverted', lang))
        note.changes = {**data, 'fields': entries}
        note.save(update_fields=['changes'])
    return skipped


def answer(row: IncidentReport, note: IncidentNote, user, *, index, text: str, lang: str = 'en') -> None:
    """Add the answer to the question's box as its own line (an edit in the history) and mark the question answered."""
    data = note.changes or {}
    questions = data.get('questions') or []
    try:
        question = questions[int(index)]
    except (TypeError, ValueError, IndexError):
        raise ReviewError('That question is not in the review.')
    text = ' '.join(str(text or '').split())
    if not text:
        raise ReviewError('Write the answer first.')
    if question.get('answer'):
        raise ReviewError('That question already has an answer.')
    field = question['field']
    current = getattr(row, field) or ''
    joiner = '\n' if field in ('what_happened', 'injuries', 'witnesses', 'follow_up') else '; '
    added = (joiner if current.strip() else '') + text
    if len(current.rstrip()) + len(added) > TEXT_LIMITS[field]:
        raise ReviewError('That answer does not fit in the box. Shorten it, or add it as a note.')
    new = current.rstrip() + added
    # The box's tidied and original text in the review get the same line, so Keep and Revert still work.
    entry = (data.get('fields') or {}).get(field)
    if entry and current in (entry['old'], entry['new']):
        both = [entry[k].rstrip() + (joiner if entry[k].strip() else '') + text for k in ('old', 'new')]
        if max(len(v) for v in both) <= TEXT_LIMITS[field]:
            entry['old'], entry['new'] = both
    question['answer'] = text
    with transaction.atomic():
        _apply(row, {field: {'old': current, 'new': new}}, user, f"{_words('answer', lang)}: {question['question']}")
        note.changes = data
        note.save(update_fields=['changes'])


def finish(note: IncidentNote) -> None:
    note.changes = {**(note.changes or {}), 'done': True}
    note.save(update_fields=['changes'])
