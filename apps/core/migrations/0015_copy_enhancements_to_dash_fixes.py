from django.db import migrations
from django.utils import timezone

AREA_LABELS = {'restoration': 'Restoration', 'processing': 'Processing'}


def _title_for(area, body):
    first = (body or '').strip().splitlines()[0] if (body or '').strip() else 'Request'
    prefix = f'[{AREA_LABELS.get(area, area.title())}] '
    room = 200 - len(prefix)
    if len(first) > room:
        first = first[: room - 1].rstrip() + '…'
    return prefix + first


def copy_enhancements(apps, schema_editor):
    """Every old Enhancement request becomes a Dash Fix (the old tables stay until a later cleanup)."""
    Old = apps.get_model('core', 'EnhancementRequest')
    OldNote = apps.get_model('core', 'EnhancementRequestNote')
    Fix = apps.get_model('core', 'DashFix')
    FixNote = apps.get_model('core', 'DashFixNote')
    now = timezone.now()
    rank = 0
    for old in Old.objects.order_by('created_at', 'id'):
        body = (old.body or '').strip()
        fix = Fix(
            title=_title_for(old.area, body),
            details=body,
            page_path='',
            kind='change',
            submitted_by_id=old.submitted_by_id,
            private=False,
            status_changed_at=old.updated_at or now,
            submitter_seen_at=now,
        )
        if old.status == 'done':
            fix.status = 'done'
            fix.done_at = old.reviewed_at or old.updated_at
        elif old.status == 'declined':
            fix.status = 'declined'
        else:  # open, planned
            rank += 1
            fix.status = 'accepted'
            fix.rank = rank
            fix.accepted_at = old.created_at
        fix.save()
        # created_at is auto_now_add: keep the original date.
        Fix.objects.filter(pk=fix.pk).update(created_at=old.created_at)
        for note in OldNote.objects.filter(request_id=old.pk).order_by('created_at', 'id'):
            new_note = FixNote.objects.create(fix=fix, body=note.body, author_id=note.author_id)
            FixNote.objects.filter(pk=new_note.pk).update(created_at=note.created_at)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_dash_fix'),
    ]

    operations = [
        migrations.RunPython(copy_enhancements, migrations.RunPython.noop),
    ]
