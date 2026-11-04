"""One template sent to many people at once, one document each, each person the only signer (D22: "each handbook
version's acknowledgment"). A ``Batch`` ties them together so the tracker can say who has signed and who hasn't.

The people come from the host (``adapter.everyone()``): only signed-in users, who sign inside the host. Someone left
out, or who joined later, is added to the same batch afterwards.
"""
from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from . import adapter
from .models import Batch, Envelope, Party, TemplateVersion

MAX_PEOPLE = 300


def _people(user_ids) -> list[dict]:
    if not isinstance(user_ids, list) or not user_ids:
        raise ValidationError({'people': 'Choose who it goes to.'})
    if len(user_ids) > MAX_PEOPLE:
        raise ValidationError({'people': f'Up to {MAX_PEOPLE} people at once.'})
    host, out, seen = adapter.get(), [], set()
    for raw in user_ids:
        try:
            user_id = int(raw)
        except (TypeError, ValueError):
            raise ValidationError({'people': 'Someone in the list is not readable.'})
        if user_id in seen:
            continue
        seen.add(user_id)
        found = host.user_party(user_id)
        if found is None:
            raise ValidationError({'people': 'Someone in the list cannot sign in any more. Refresh and choose again.'})
        out.append({'user_id': user_id, **found})
    return out


def _send_one(batch: Batch, person: dict, *, by) -> Envelope:
    from .services import create_envelope, send

    attached_type, attached_id = adapter.get().attach_for_user(person['user_id'])
    envelope = create_envelope(version=batch.template_version, values=batch.values, by=by, title=batch.name,
                               parties=[{'user_id': person['user_id'], 'role_label': person.get('title', '')}],
                               attached_type=attached_type, attached_id=attached_id)
    Envelope.objects.filter(pk=envelope.pk).update(batch=batch)
    send(envelope, by=by, hand_over=False)  # signed in: they sign in the app, and no link is shown to the sender
    return envelope


@transaction.atomic
def send_to_many(*, version: TemplateVersion, name: str, user_ids, values: dict | None, by) -> Batch:
    from .services import _PARTY_BLANK, blanks_in, clean_values

    if any((m := _PARTY_BLANK.match(b)) and m.group(1) != '1' for b in blanks_in(version.sections)):
        raise ValidationError({'detail': 'This template names a second signer. Send it to one person at a time.'})
    name = ' '.join(str(name or '').split())[:200] or version.title
    people = _people(user_ids)
    values = clean_values(version, values or {}, strict=True)  # the same fill-ins for everyone
    batch = Batch.objects.create(name=name, kind=version.template.kind, template_version=version, values=values,
                                 created_by=by)
    for person in people:
        _send_one(batch, person, by=by)
    return batch


@transaction.atomic
def add_people(batch: Batch, *, user_ids, by) -> int:
    """Send it to more people. Anyone who already has one that was not voided is skipped. Returns how many were sent."""
    if batch.template_version_id is None:
        raise ValidationError({'detail': 'This batch has no template to send.'})
    has = set(Party.objects.filter(envelope__batch=batch).exclude(envelope__status=Envelope.VOID)
              .values_list('user_id', flat=True))
    people = [p for p in _people(user_ids) if p['user_id'] not in has]
    for person in people:
        _send_one(batch, person, by=by)
    return len(people)


def coverage(batch: Batch) -> dict:
    """Who has signed, who hasn't, and who on the host's list has none yet."""
    rows = []
    parties = Party.objects.filter(envelope__batch=batch).select_related('envelope').order_by('name')
    for p in parties:
        e = p.envelope
        rows.append({'envelope': e.pk, 'party': p.pk, 'user_id': p.user_id, 'name': p.name,
                     'status': 'void' if e.status == Envelope.VOID else ('signed' if p.status == Party.SIGNED else 'waiting'),
                     'signed_at': p.signed_at.isoformat() if p.signed_at else None,
                     'sent_at': e.sent_at.isoformat() if e.sent_at else None,
                     'deleting': bool(e.delete_requested_at)})
    live = [r for r in rows if r['status'] != 'void' and not r['deleting']]
    have = {r['user_id'] for r in live}
    missing = [{'user_id': p['user_id'], 'name': p['name']} for p in adapter.get().everyone() if p['user_id'] not in have]
    return {
        'id': batch.pk, 'name': batch.name, 'kind': batch.kind, 'created_at': batch.created_at.isoformat(),
        'template': batch.template_version.template_id if batch.template_version_id else None,
        'version': batch.template_version.number if batch.template_version_id else None,
        'signed': sum(1 for r in live if r['status'] == 'signed'), 'total': len(live),
        'people': rows, 'missing': missing,
    }
